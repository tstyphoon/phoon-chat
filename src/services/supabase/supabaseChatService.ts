// 階段二：用 Supabase 提供真正的多人即時聊天。
// 它和階段一的假後端（../mock/mockChatService.ts）實作同一份約定（../chatService.ts），
// 吐出的資料格式一模一樣（src/types.ts），所以畫面與 useChat 不用改。
//
// 用到的 Supabase 功能（架構文件 3.2）：
// - 匿名登入：替每個瀏覽器發一個隱形身分
// - 資料庫 messages 資料表 + Postgres Changes：訊息先寫進資料庫，再通知所有人
// - Presence：誰在線上
// - Broadcast：按「離開」時的「立刻離開」通知
// - Storage chat-images：圖片

import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { CONFIG } from '../../config';
import { validateImage } from '../../rules/image';
import { nicknameKey, validateNickname } from '../../rules/nickname';
import type {
  ChatEvents,
  ConnectionStatus,
  HistoryPage,
  JoinResult,
  Message,
  PresenceMember,
  SendResult,
} from '../../types';
import { newId, sleep } from '../../utils/id';
import type { ChatService, Unsubscribe } from '../chatService';
import { describeJoinError, describeSendError, isRejection } from './errors';

const ROOM_CHANNEL = 'room:main';
const BUCKET = 'chat-images';
const MESSAGE_COLUMNS = 'id,user_id,nickname,kind,text,image_path,created_at';
const SUBSCRIBE_TIMEOUT_MS = 10_000;
const FIRST_SYNC_WAIT_MS = 1_500;
// 登記為在線後，要等同時搶同一個代號的人也出現在名單裡（Supabase 的在線名單要約 1 秒才會同步）
const CONFLICT_WAIT_MS = 1_300;
/** 訂閱成功後，伺服器要再過一小段時間才開始轉送新訊息，所以之後補查一次漏掉的 */
const CATCH_UP_DELAY_MS = 2_000;
const CATCH_UP_LIMIT = 300;

const IMAGE_EXTENSION: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
};

type Handler = (payload: never) => void;

function toMessage(row: Record<string, unknown>): Message {
  return {
    id: String(row.id),
    user_id: String(row.user_id),
    nickname: String(row.nickname),
    kind: row.kind === 'image' ? 'image' : 'text',
    text: typeof row.text === 'string' ? row.text : null,
    image_path: typeof row.image_path === 'string' ? row.image_path : null,
    // 維持資料庫給的原始字串（含微秒），拿來當「往前載入」的起點才不會漏
    created_at: String(row.created_at),
  };
}

function toMember(raw: unknown): PresenceMember | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const entry = raw as Record<string, unknown>;
  if (
    typeof entry.session_id !== 'string' ||
    typeof entry.user_id !== 'string' ||
    typeof entry.nickname !== 'string' ||
    typeof entry.joined_at !== 'string'
  ) {
    return null;
  }
  return {
    session_id: entry.session_id,
    user_id: entry.user_id,
    nickname: entry.nickname,
    joined_at: entry.joined_at,
  };
}

function isAlreadyExists(error: unknown): boolean {
  const { message = '', statusCode = '' } = (error ?? {}) as { message?: string; statusCode?: string | number };
  return String(statusCode) === '409' || /already exists|duplicate/i.test(message);
}

export class SupabaseChatService implements ChatService {
  private userIdValue = '';
  private listeners = new Map<string, Set<Handler>>();
  private channel: RealtimeChannel | null = null;
  private me: PresenceMember | null = null;
  /** join() 完成之後才是 true；之前收到的事件都不通知畫面（會由載入的結果涵蓋） */
  private joined = false;
  /** 第一次取得名單之後才是 true，避免一進來就對每個已經在線的人顯示「加入了」 */
  private presenceReady = false;
  private conflictLost = false;
  private status: ConnectionStatus = 'connected';
  private onFirstSync: (() => void) | null = null;
  private catchUpTimer: ReturnType<typeof setTimeout> | null = null;
  private resubscribing = false;
  /** 這次連線期間看過的訊息：編號 → 時間。用來去重，也用來發現斷線期間被刪掉的訊息 */
  private known = new Map<string, string>();

  constructor(private readonly client: SupabaseClient) {
    if (typeof window !== 'undefined') {
      // 瀏覽器偵測到沒網路時馬上顯示橫幅，不用等 Realtime 自己發現
      window.addEventListener('offline', () => {
        if (this.joined) this.setStatus('reconnecting');
      });
      window.addEventListener('online', () => {
        if (this.joined) void this.handleBackOnline();
      });
    }
  }

  get userId(): string {
    return this.userIdValue;
  }

  on<K extends keyof ChatEvents>(event: K, handler: (payload: ChatEvents[K]) => void): Unsubscribe {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler as Handler);
    return () => {
      set.delete(handler as Handler);
    };
  }

  // ---------- 進入與離開 ----------

  async join(raw: string): Promise<JoinResult> {
    const check = validateNickname(raw);
    if (!check.ok) return { ok: false, reason: 'invalid', message: check.message };

    if (this.channel) await this.dropChannel();

    try {
      await this.ensureSession();
    } catch (error) {
      return { ok: false, reason: 'connection', message: describeJoinError(error) };
    }

    const sessionId = newId();
    const channel = this.client.channel(ROOM_CHANNEL, {
      config: { presence: { key: sessionId }, broadcast: { self: false } },
    });
    this.channel = channel;
    this.joined = false;
    this.presenceReady = false;
    this.conflictLost = false;
    this.known.clear();

    const firstSync = new Promise<void>((resolve) => {
      this.onFirstSync = resolve;
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        if (channel !== this.channel) return;
        this.onFirstSync?.();
        this.onFirstSync = null;
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        if (channel === this.channel) this.handlePresenceJoin(newPresences);
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        if (channel === this.channel) this.handlePresenceLeave(leftPresences);
      })
      .on('broadcast', { event: 'user_left' }, ({ payload }) => {
        if (channel === this.channel) this.handleUserLeft(payload);
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
        if (channel === this.channel) this.receive(toMessage(payload.new as Record<string, unknown>));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
        if (channel !== this.channel || !this.joined) return;
        const id = (payload.old as { id?: string }).id;
        if (!id) return;
        this.known.delete(id);
        this.emit('message.deleted', { id });
      });

    const subscribed = await this.subscribe(channel);
    if (!subscribed) {
      await this.dropChannel();
      return { ok: false, reason: 'connection', message: describeJoinError(new Error('timeout')) };
    }

    // 取得目前的在線名單，檢查有沒有人已經用這個代號（大小寫不分）
    await Promise.race([firstSync, sleep(FIRST_SYNC_WAIT_MS)]);
    const key = nicknameKey(check.nickname);
    // 同一個瀏覽器自己留下的舊連線（例如剛重新整理）不算「別人」
    const others = this.readMembers(channel).filter((member) => member.user_id !== this.userIdValue);
    if (others.some((member) => nicknameKey(member.nickname) === key)) {
      await this.dropChannel();
      return { ok: false, reason: 'taken', message: '這個代號有人在用了，請換一個' };
    }

    // 登記為在線
    const me: PresenceMember = {
      session_id: sessionId,
      user_id: this.userIdValue,
      nickname: check.nickname,
      joined_at: new Date().toISOString(),
    };
    this.me = me;
    this.presenceReady = true;
    const tracked = await channel.track(me);
    if (tracked !== 'ok') {
      await this.dropChannel();
      this.me = null;
      return { ok: false, reason: 'connection', message: describeJoinError(new Error('timeout')) };
    }

    // 兩個人幾乎同時搶同一個代號：等一下讓對方也出現在名單裡，加入時間較早的保留
    await this.waitUntil(() => this.readMembers(channel).some((m) => m.session_id === sessionId), 2_000);
    await sleep(CONFLICT_WAIT_MS);
    if (this.conflictLost || this.findWinnerAgainstMe(this.readMembers(channel))) {
      await this.dropChannel();
      this.me = null;
      return { ok: false, reason: 'taken', message: '這個代號有人在用了，請換一個' };
    }

    this.joined = true;
    this.status = 'connected';
    this.emit('presence.sync', this.readMembers(channel));
    this.emit('connection.status', 'connected');
    this.catchUpTimer = setTimeout(() => void this.catchUp(), CATCH_UP_DELAY_MS);
    return { ok: true, me };
  }

  async leave(): Promise<void> {
    const channel = this.channel;
    const me = this.me;
    this.joined = false;
    this.presenceReady = false;
    this.me = null;
    this.clearCatchUp();
    if (channel && me) {
      // 先廣播「我按了離開」，其他人才能馬上顯示；再取消在線登記
      await this.safely(() =>
        channel.send({
          type: 'broadcast',
          event: 'user_left',
          payload: { session_id: me.session_id, nickname: me.nickname },
        }),
      );
      await this.safely(() => channel.untrack());
    }
    await this.dropChannel();
    this.known.clear();
    this.status = 'connected';
  }

  // ---------- 送出與刪除 ----------

  async sendText(id: string, text: string): Promise<SendResult> {
    const me = this.me;
    if (!me) return { ok: false, message: '還沒進入聊天室' };
    const { data, error } = await this.client
      .from('messages')
      .insert({ id, nickname: me.nickname, kind: 'text', text })
      .select(MESSAGE_COLUMNS)
      .single();
    if (error) return this.handleInsertError(id, error);
    this.acceptOwn(toMessage(data as Record<string, unknown>));
    return { ok: true };
  }

  async sendImage(id: string, file: File): Promise<SendResult> {
    const me = this.me;
    if (!me) return { ok: false, message: '還沒進入聊天室' };
    const check = validateImage(file);
    if (!check.ok) return { ok: false, message: check.message };

    // 路徑第一層必須是自己的身分編號，資料庫的規則也是這樣要求
    const path = `${this.userIdValue}/${id}.${IMAGE_EXTENSION[file.type] ?? 'png'}`;
    const upload = await this.client.storage.from(BUCKET).upload(path, file, {
      contentType: file.type,
      upsert: false,
      // 快取只留 5 分鐘：刪除圖片後，各地的快取最多 5 分鐘內也會失效，圖片網址就打不開了。
      // （設成一年的話，刪掉的圖片網址可能還能開很久）
      cacheControl: '300',
    });
    // 重送時檔案已經在了就直接沿用
    if (upload.error && !isAlreadyExists(upload.error)) {
      return { ok: false, message: describeSendError(upload.error) };
    }

    const { data, error } = await this.client
      .from('messages')
      .insert({ id, nickname: me.nickname, kind: 'image', image_path: path })
      .select(MESSAGE_COLUMNS)
      .single();
    if (error) {
      // 被規則明確拒絕的話，上傳好的圖片就沒用了，清掉；只是網路問題就留著，重送時沿用
      if (isRejection(error)) await this.safely(() => this.client.storage.from(BUCKET).remove([path]));
      return this.handleInsertError(id, error);
    }
    this.acceptOwn(toMessage(data as Record<string, unknown>));
    return { ok: true };
  }

  async deleteMessage(id: string): Promise<void> {
    // 資料庫的規則只讓人刪自己的；刪到的那一列會回傳，圖片訊息要連檔案一起刪
    const { data, error } = await this.client.from('messages').delete().eq('id', id).select('id,image_path');
    if (error) return;
    this.known.delete(id);
    const paths = (data ?? [])
      .map((row) => (row as { image_path: string | null }).image_path)
      .filter((path): path is string => typeof path === 'string');
    if (paths.length > 0) await this.safely(() => this.client.storage.from(BUCKET).remove(paths));
  }

  // ---------- 歷史訊息 ----------

  async loadRecent(): Promise<HistoryPage> {
    return this.fetchPage();
  }

  async loadOlder(before: string): Promise<HistoryPage> {
    return this.fetchPage(before);
  }

  getImageUrl(path: string): string {
    return this.client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
  }

  private async fetchPage(before?: string): Promise<HistoryPage> {
    const size = CONFIG.history.pageSize;
    let query = this.client
      .from('messages')
      .select(MESSAGE_COLUMNS)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(size + 1);
    if (before) query = query.lt('created_at', before);
    const { data, error } = await query;
    if (error || !data) {
      // 讀不到時先回空的，連線恢復後的「補查」會把訊息補上
      this.setStatus('reconnecting');
      return { messages: [], hasMore: false };
    }
    const messages = data
      .slice(0, size)
      .reverse()
      .map((row) => toMessage(row as Record<string, unknown>));
    for (const message of messages) this.known.set(message.id, message.created_at);
    return { messages, hasMore: data.length > size };
  }

  // ---------- 收到的訊息 ----------

  private receive(message: Message): void {
    if (!this.joined || this.known.has(message.id)) return;
    this.known.set(message.id, message.created_at);
    this.emit('message.new', message);
  }

  /** 自己剛送出的訊息：伺服器確認後就直接通知畫面，不用等 Realtime 繞一圈 */
  private acceptOwn(message: Message): void {
    this.receive(message);
  }

  private async handleInsertError(id: string, error: { code?: string; message?: string }): Promise<SendResult> {
    // 重送時，上一次其實已經成功（只是回應沒收到）：編號重複，當作成功
    if (error.code === '23505') {
      const { data } = await this.client.from('messages').select(MESSAGE_COLUMNS).eq('id', id).maybeSingle();
      if (data) this.acceptOwn(toMessage(data as Record<string, unknown>));
      return { ok: true };
    }
    return { ok: false, message: describeSendError(error) };
  }

  /** 補查：訂閱剛成功、或斷線恢復後，把中間漏掉的新訊息補上，並移除斷線期間被刪掉的 */
  private async catchUp(): Promise<void> {
    if (!this.joined) return;
    const recent = [...this.known.entries()]
      .sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0))
      .slice(-CONFIG.history.pageSize);
    const since = recent[0]?.[1];

    let rows: Record<string, unknown>[];
    if (since) {
      const { data, error } = await this.client
        .from('messages')
        .select(MESSAGE_COLUMNS)
        .gte('created_at', since)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(CATCH_UP_LIMIT);
      if (error || !data) return;
      rows = data as Record<string, unknown>[];
    } else {
      const { data, error } = await this.client
        .from('messages')
        .select(MESSAGE_COLUMNS)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(CONFIG.history.pageSize);
      if (error || !data) return;
      rows = (data as Record<string, unknown>[]).reverse();
    }

    const fetched = new Set(rows.map((row) => String(row.id)));
    for (const row of rows) this.receive(toMessage(row));
    // 太多筆時查不完整，不判斷刪除，免得誤刪
    if (!since || rows.length >= CATCH_UP_LIMIT) return;
    for (const [id] of recent) {
      if (!fetched.has(id) && this.known.has(id)) {
        this.known.delete(id);
        this.emit('message.deleted', { id });
      }
    }
  }

  // ---------- 在線名單 ----------

  private readMembers(channel: RealtimeChannel): PresenceMember[] {
    const state = channel.presenceState<Record<string, unknown>>();
    const members: PresenceMember[] = [];
    for (const entries of Object.values(state)) {
      for (const entry of entries) {
        const member = toMember(entry);
        if (member) members.push(member);
      }
    }
    return members;
  }

  /** 別人的代號和我相同，而且他比我早到：回傳那個人（代表我輸了） */
  private findWinnerAgainstMe(members: PresenceMember[]): PresenceMember | null {
    const me = this.me;
    if (!me) return null;
    const key = nicknameKey(me.nickname);
    for (const member of members) {
      if (member.session_id === me.session_id || member.user_id === me.user_id) continue;
      if (nicknameKey(member.nickname) !== key) continue;
      // 加入時間較早的保留；時間相同就比編號，兩邊的判斷才會一致
      const theyFirst =
        member.joined_at < me.joined_at || (member.joined_at === me.joined_at && member.session_id < me.session_id);
      if (theyFirst) return member;
    }
    return null;
  }

  private handlePresenceJoin(presences: unknown[]): void {
    if (!this.presenceReady || !this.me) return;
    for (const raw of presences) {
      const member = toMember(raw);
      if (!member || member.session_id === this.me.session_id) continue;
      if (this.findWinnerAgainstMe([member])) {
        this.conflictLost = true;
        if (this.joined) void this.kick();
        continue;
      }
      if (this.joined) this.emit('presence.join', member);
    }
  }

  private handlePresenceLeave(presences: unknown[]): void {
    if (!this.joined || !this.me) return;
    for (const raw of presences) {
      const member = toMember(raw);
      if (!member || member.session_id === this.me.session_id) continue;
      this.emit('presence.leave', member);
    }
  }

  private handleUserLeft(payload: unknown): void {
    if (!this.joined || !this.me) return;
    const data = payload as { session_id?: unknown; nickname?: unknown };
    if (typeof data?.session_id !== 'string' || typeof data.nickname !== 'string') return;
    if (data.session_id === this.me.session_id) return;
    this.emit('user.left', { session_id: data.session_id, nickname: data.nickname });
  }

  /** 進入之後才發現代號被別人先搶走：離開頻道，回到輸入畫面 */
  private async kick(): Promise<void> {
    const channel = this.channel;
    const me = this.me;
    if (!channel || !me) return;
    this.joined = false;
    this.presenceReady = false;
    this.me = null;
    this.clearCatchUp();
    await this.safely(() =>
      channel.send({
        type: 'broadcast',
        event: 'user_left',
        payload: { session_id: me.session_id, nickname: me.nickname },
      }),
    );
    await this.safely(() => channel.untrack());
    await this.dropChannel();
    this.known.clear();
    this.emit('session.kicked', { reason: 'nickname_taken' });
  }

  // ---------- 連線狀態 ----------

  private subscribe(channel: RealtimeChannel): Promise<boolean> {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (ok: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(ok);
      };
      const timer = setTimeout(() => finish(false), SUBSCRIBE_TIMEOUT_MS);
      channel.subscribe((status) => {
        if (channel !== this.channel) return;
        if (!settled) {
          if (status === 'SUBSCRIBED') finish(true);
          else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') finish(false);
          return;
        }
        this.handleChannelStatus(status);
      });
    });
  }

  private handleChannelStatus(status: string): void {
    if (!this.joined) return;
    if (status === 'SUBSCRIBED') {
      void this.handleResubscribed();
    } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      this.setStatus('reconnecting');
    }
  }

  /** 斷線後自動重連成功：重新登記在線、補上錯過的訊息 */
  private async handleResubscribed(): Promise<void> {
    const channel = this.channel;
    const me = this.me;
    if (!channel || !me || this.resubscribing) return;
    this.resubscribing = true;
    try {
      await channel.track(me);
      await sleep(CONFLICT_WAIT_MS);
      if (channel !== this.channel || !this.joined) return;
      const members = this.readMembers(channel);
      if (this.findWinnerAgainstMe(members)) {
        await this.kick();
        return;
      }
      this.setStatus('connected');
      this.emit('presence.sync', members);
      await this.catchUp();
    } finally {
      this.resubscribing = false;
    }
  }

  private async handleBackOnline(): Promise<void> {
    // 網路回來了：Realtime 通常會自己重連並觸發 handleResubscribed。
    // 如果連線其實沒斷（只是瀏覽器曾經回報離線），這裡直接恢復並補查。
    await sleep(1_000);
    if (!this.joined || !this.channel) return;
    if (this.channel.state === 'joined') {
      this.setStatus('connected');
      await this.catchUp();
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    this.emit('connection.status', status);
  }

  // ---------- 內部工具 ----------

  /** 沿用這個瀏覽器已有的匿名身分；沒有、或身分已經失效就重新取得一個 */
  private async ensureSession(): Promise<void> {
    const { data: current } = await this.client.auth.getSession();
    if (current.session) {
      const { data, error } = await this.client.auth.getUser();
      if (!error && data.user) {
        this.userIdValue = data.user.id;
        return;
      }
      // 身分已經不存在（例如專案資料被清掉）才重新取得；只是網路問題就直接回報
      const status = (error as { status?: number } | null)?.status;
      if (error && status !== 401 && status !== 403 && status !== 404) throw error;
      await this.client.auth.signOut({ scope: 'local' });
    }
    const { data, error } = await this.client.auth.signInAnonymously();
    if (error || !data.user) throw error ?? new Error('匿名登入失敗');
    this.userIdValue = data.user.id;
  }

  private async dropChannel(): Promise<void> {
    const channel = this.channel;
    this.channel = null;
    this.onFirstSync = null;
    if (channel) await this.safely(() => this.client.removeChannel(channel));
  }

  private clearCatchUp(): void {
    if (this.catchUpTimer) clearTimeout(this.catchUpTimer);
    this.catchUpTimer = null;
  }

  private async waitUntil(condition: () => boolean, timeoutMs: number): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (!condition() && Date.now() < deadline) await sleep(100);
  }

  /** 收尾動作失敗不影響流程 */
  private async safely(action: () => unknown): Promise<void> {
    try {
      await action();
    } catch {
      // 忽略
    }
  }

  private emit<K extends keyof ChatEvents>(event: K, payload: ChatEvents[K]): void {
    this.listeners.get(event)?.forEach((handler) => (handler as (p: ChatEvents[K]) => void)(payload));
  }
}
