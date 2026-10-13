// 階段一的「假後端」。
// - 同一個瀏覽器開兩個分頁，就像兩個人在聊天（用 BroadcastChannel 互相傳話）。
// - 有幾位機器人使用者會加入、離開、說話。
// - 文字訊息存在 localStorage；圖片只放在記憶體，重新整理就消失。
// 它吐出的資料格式，和階段二的 Supabase 後端完全一致（見 src/types.ts）。

import { CONFIG } from '../../config';
import { validateImage } from '../../rules/image';
import { nicknameKey, countChars, validateNickname } from '../../rules/nickname';
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
import type { ChatService, DebugControls, Unsubscribe } from '../chatService';
import { BOT_NAMES, BOT_PHRASES, createRandom } from './bots';

const CHANNEL_NAME = 'phoon-chat:mock:room';
const STORAGE_KEY = 'phoon-chat:mock:messages:v1';
const USER_ID_KEY = 'phoon-chat:mock:user-id';
const MAX_STORED = 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type Wire =
  | { t: 'who' }
  | { t: 'here'; member: PresenceMember }
  | { t: 'hello'; member: PresenceMember }
  | { t: 'bye'; session_id: string; nickname: string; explicit: boolean }
  | { t: 'msg'; message: Message; image?: string }
  | { t: 'del'; id: string };

type Handler = (payload: never) => void;

function compareMessages(a: Message, b: Message): number {
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 每個分頁各有一個隱形身分，這樣同一個瀏覽器開兩個分頁才像兩個人 */
function loadUserId(): string {
  try {
    const saved = sessionStorage.getItem(USER_ID_KEY);
    if (saved) return saved;
    const created = newId();
    sessionStorage.setItem(USER_ID_KEY, created);
    return created;
  } catch {
    return newId();
  }
}

function readStored(): Message[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - CONFIG.history.retentionDays * DAY_MS;
    return (parsed as Message[]).filter(
      (m) => typeof m?.id === 'string' && typeof m.created_at === 'string' && Date.parse(m.created_at) >= cutoff,
    );
  } catch {
    return [];
  }
}

function writeStored(messages: Message[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages.slice(-MAX_STORED)));
  } catch {
    // 空間不足或被瀏覽器禁止時，就只留在記憶體
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export class MockChatService implements ChatService {
  readonly userId = loadUserId();
  readonly debug: DebugControls;

  private listeners = new Map<string, Set<Handler>>();
  private channel: BroadcastChannel | null = null;
  private messages: Message[] = [];
  private images = new Map<string, string>();
  private me: PresenceMember | null = null;
  private remote = new Map<string, PresenceMember>();
  private bots = new Map<string, PresenceMember>();
  private online = true;
  private buffered: { event: keyof ChatEvents; payload: unknown }[] = [];
  private botTimers: ReturnType<typeof setTimeout>[] = [];
  private botsRunning = false;

  constructor() {
    this.debug = {
      disconnect: () => this.goOffline(),
      reconnect: () => void this.goOnline(),
      botSpeak: () => this.botSay(),
    };

    this.messages = this.seedHistory();
    for (const stored of readStored()) {
      if (!this.messages.some((m) => m.id === stored.id)) this.messages.push(stored);
    }
    this.messages.sort(compareMessages);

    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel(CHANNEL_NAME);
      this.channel.onmessage = (event: MessageEvent<Wire>) => this.onWire(event.data);
    }
    if (typeof window !== 'undefined') {
      // 直接關掉分頁時，其他人看到的是「斷線」而不是「按了離開」
      window.addEventListener('pagehide', () => {
        if (this.me) this.post({ t: 'bye', session_id: this.me.session_id, nickname: this.me.nickname, explicit: false });
      });
      // 瀏覽器開發者工具切到離線，也當成斷線
      window.addEventListener('offline', () => this.goOffline());
      window.addEventListener('online', () => void this.goOnline());
    }
  }

  // ---------- 對外介面 ----------

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

  async join(raw: string): Promise<JoinResult> {
    if (!this.online) {
      return { ok: false, reason: 'connection', message: '目前離線，請檢查網路後再試一次' };
    }
    const check = validateNickname(raw);
    if (!check.ok) return { ok: false, reason: 'invalid', message: check.message };

    // 問一下其他分頁現在有誰在線上
    this.remote.clear();
    this.post({ t: 'who' });
    await sleep(200);

    const key = nicknameKey(check.nickname);
    const taken =
      [...this.bots.values()].some((m) => nicknameKey(m.nickname) === key) ||
      [...this.remote.values()].some((m) => nicknameKey(m.nickname) === key);
    if (taken) {
      return { ok: false, reason: 'taken', message: '這個代號有人在用了，請換一個' };
    }

    const me: PresenceMember = {
      session_id: newId(),
      user_id: this.userId,
      nickname: check.nickname,
      joined_at: new Date().toISOString(),
    };
    this.me = me;
    this.post({ t: 'hello', member: me });
    this.startBots();
    this.emit('presence.sync', this.allMembers());
    this.emit('connection.status', this.online ? 'connected' : 'reconnecting');
    return { ok: true, me };
  }

  async leave(): Promise<void> {
    const me = this.me;
    if (!me) return;
    this.post({ t: 'bye', session_id: me.session_id, nickname: me.nickname, explicit: true });
    this.me = null;
    this.stopBots();
  }

  async sendText(id: string, text: string): Promise<SendResult> {
    if (!this.me) return { ok: false, message: '還沒進入聊天室' };
    if (!this.online) return { ok: false, message: '目前離線，訊息沒有送出' };
    await sleep(120);
    if (!this.online) return { ok: false, message: '目前離線，訊息沒有送出' };

    // 伺服器端會再檢查一次（階段二是資料庫的規則）
    const body = text.trim();
    if (body === '') return { ok: false, message: '請輸入訊息' };
    if (countChars(body) > CONFIG.message.maxLength) {
      return { ok: false, message: `訊息最多 ${CONFIG.message.maxLength} 個字` };
    }
    if (this.messages.some((m) => m.id === id)) return { ok: true };

    this.addMessage(this.makeMessage(id, 'text', body, null));
    return { ok: true };
  }

  async sendImage(id: string, file: File): Promise<SendResult> {
    if (!this.me) return { ok: false, message: '還沒進入聊天室' };
    if (!this.online) return { ok: false, message: '目前離線，圖片沒有送出' };
    const check = validateImage(file);
    if (!check.ok) return { ok: false, message: check.message };
    let dataUrl: string;
    try {
      dataUrl = await readFileAsDataUrl(file);
    } catch {
      return { ok: false, message: '讀不到這張圖片，換一張試試' };
    }
    await sleep(250);
    if (!this.online) return { ok: false, message: '目前離線，圖片沒有送出' };
    if (this.messages.some((m) => m.id === id)) return { ok: true };

    const path = `mock/${id}`;
    this.images.set(path, dataUrl);
    this.addMessage(this.makeMessage(id, 'image', null, path), dataUrl);
    return { ok: true };
  }

  async deleteMessage(id: string): Promise<void> {
    const target = this.messages.find((m) => m.id === id);
    if (!target || target.user_id !== this.userId) return; // 只能刪自己的
    this.removeMessage(id);
    this.post({ t: 'del', id });
    this.emit('message.deleted', { id });
  }

  async loadRecent(): Promise<HistoryPage> {
    await sleep(250);
    return this.page(this.messages);
  }

  async loadOlder(before: string): Promise<HistoryPage> {
    await sleep(350);
    return this.page(this.messages.filter((m) => m.created_at < before));
  }

  getImageUrl(path: string): string {
    return this.images.get(path) ?? '';
  }

  // ---------- 內部：訊息 ----------

  private page(source: Message[]): HistoryPage {
    const size = CONFIG.history.pageSize;
    const messages = source.slice(-size);
    return { messages: [...messages], hasMore: source.length > size };
  }

  private makeMessage(id: string, kind: Message['kind'], text: string | null, imagePath: string | null): Message {
    return {
      id,
      user_id: this.userId,
      nickname: this.me?.nickname ?? '',
      kind,
      text,
      image_path: imagePath,
      created_at: new Date().toISOString(),
    };
  }

  /** 自己送出的訊息：存起來、通知其他分頁、通知畫面 */
  private addMessage(message: Message, image?: string): void {
    this.messages.push(message);
    this.messages.sort(compareMessages);
    if (message.kind === 'text') this.persist(message);
    this.post({ t: 'msg', message, image });
    this.emit('message.new', message);
  }

  private removeMessage(id: string): void {
    const target = this.messages.find((m) => m.id === id);
    this.messages = this.messages.filter((m) => m.id !== id);
    if (target?.image_path) this.images.delete(target.image_path);
    const stored = readStored();
    if (stored.some((m) => m.id === id)) writeStored(stored.filter((m) => m.id !== id));
  }

  private persist(message: Message): void {
    const stored = readStored();
    if (stored.some((m) => m.id === message.id)) return;
    stored.push(message);
    stored.sort(compareMessages);
    writeStored(stored);
  }

  /** 很久以前的假歷史訊息，用來測試「往上滑載入更早訊息」與日期分隔線 */
  private seedHistory(): Message[] {
    const random = createRandom(20261013);
    const total = 130;
    const now = Date.now();
    const result: Message[] = [];
    let time = now - 40 * 60 * 60 * 1000;
    const end = now - 3 * 60 * 1000;
    const step = (end - time) / total;
    for (let i = 0; i < total; i++) {
      time += step * (0.4 + random() * 1.2);
      const name = BOT_NAMES[Math.floor(random() * BOT_NAMES.length)];
      const text = BOT_PHRASES[Math.floor(random() * BOT_PHRASES.length)];
      result.push({
        id: `seed-${String(i).padStart(3, '0')}`,
        user_id: `bot:${name}`,
        nickname: name,
        kind: 'text',
        text,
        image_path: null,
        created_at: new Date(Math.min(time, end)).toISOString(),
      });
    }
    return result;
  }

  // ---------- 內部：在線名單 ----------

  private allMembers(): PresenceMember[] {
    const members = [...this.bots.values(), ...this.remote.values()];
    if (this.me) members.push(this.me);
    return members;
  }

  private kick(): void {
    const me = this.me;
    if (!me) return;
    this.post({ t: 'bye', session_id: me.session_id, nickname: me.nickname, explicit: true });
    this.me = null;
    this.stopBots();
    this.emit('session.kicked', { reason: 'nickname_taken' });
  }

  // ---------- 內部：其他分頁 ----------

  private post(wire: Wire): void {
    this.channel?.postMessage(wire);
  }

  private onWire(wire: Wire): void {
    switch (wire.t) {
      case 'who':
        if (this.me) this.post({ t: 'here', member: this.me });
        break;
      case 'here':
        if (wire.member.session_id !== this.me?.session_id) this.remote.set(wire.member.session_id, wire.member);
        break;
      case 'hello': {
        const other = wire.member;
        this.remote.set(other.session_id, other);
        const me = this.me;
        if (me && nicknameKey(other.nickname) === nicknameKey(me.nickname)) {
          // 兩個人幾乎同時搶同一個代號：加入時間較早的保留（時間相同就比編號）
          const mineFirst =
            me.joined_at < other.joined_at || (me.joined_at === other.joined_at && me.session_id < other.session_id);
          if (!mineFirst) {
            this.kick();
            return;
          }
        }
        if (me) this.emit('presence.join', other);
        break;
      }
      case 'bye': {
        const member = this.remote.get(wire.session_id);
        this.remote.delete(wire.session_id);
        if (!this.me || !member) break;
        if (wire.explicit) {
          this.emit('user.left', { session_id: wire.session_id, nickname: wire.nickname });
        } else {
          this.emit('presence.leave', member);
        }
        break;
      }
      case 'msg':
        if (this.messages.some((m) => m.id === wire.message.id)) break;
        if (wire.image && wire.message.image_path) this.images.set(wire.message.image_path, wire.image);
        this.messages.push(wire.message);
        this.messages.sort(compareMessages);
        if (this.me) this.emit('message.new', wire.message);
        break;
      case 'del':
        if (!this.messages.some((m) => m.id === wire.id)) break;
        this.removeMessage(wire.id);
        if (this.me) this.emit('message.deleted', { id: wire.id });
        break;
    }
  }

  // ---------- 內部：事件與斷線模擬 ----------

  private emit<K extends keyof ChatEvents>(event: K, payload: ChatEvents[K]): void {
    if (!this.online && event !== 'connection.status') {
      this.buffered.push({ event, payload });
      return;
    }
    this.listeners.get(event)?.forEach((handler) => (handler as (p: ChatEvents[K]) => void)(payload));
  }

  private emitNow<K extends keyof ChatEvents>(event: K, payload: ChatEvents[K]): void {
    this.listeners.get(event)?.forEach((handler) => (handler as (p: ChatEvents[K]) => void)(payload));
  }

  private goOffline(): void {
    if (!this.online) return;
    this.online = false;
    this.emitNow('connection.status', 'reconnecting' satisfies ConnectionStatus);
  }

  private async goOnline(): Promise<void> {
    if (this.online) return;
    await sleep(900);
    this.online = true;
    this.emitNow('connection.status', 'connected');
    // 補上斷線期間錯過的訊息與刪除；在線名單直接給最新的完整名單
    const missed = this.buffered.filter((item) => item.event === 'message.new' || item.event === 'message.deleted');
    this.buffered = [];
    if (this.me) this.emitNow('presence.sync', this.allMembers());
    for (const item of missed) {
      this.emitNow(item.event, item.payload as never);
    }
  }

  // ---------- 內部：機器人 ----------

  private startBots(): void {
    if (this.botsRunning) return;
    this.botsRunning = true;
    const myKey = this.me ? nicknameKey(this.me.nickname) : '';
    const initial = BOT_NAMES.filter((name) => nicknameKey(name) !== myKey).slice(0, 4);
    for (const name of initial) this.bots.set(name, this.makeBot(name));
    this.scheduleTalk();
    this.schedulePresence();
  }

  private stopBots(): void {
    this.botsRunning = false;
    this.botTimers.forEach(clearTimeout);
    this.botTimers = [];
    this.bots.clear();
  }

  private makeBot(name: string): PresenceMember {
    return {
      session_id: `bot-session-${name}`,
      user_id: `bot:${name}`,
      nickname: name,
      joined_at: new Date().toISOString(),
    };
  }

  private later(callback: () => void, min: number, max: number): void {
    const timer = setTimeout(() => {
      this.botTimers = this.botTimers.filter((t) => t !== timer);
      if (this.botsRunning) callback();
    }, min + Math.random() * (max - min));
    this.botTimers.push(timer);
  }

  private scheduleTalk(): void {
    this.later(
      () => {
        this.botSay();
        this.scheduleTalk();
      },
      7000,
      16000,
    );
  }

  private schedulePresence(): void {
    this.later(
      () => {
        this.toggleBot();
        this.schedulePresence();
      },
      18000,
      40000,
    );
  }

  private botSay(): void {
    const online = [...this.bots.values()];
    if (online.length === 0) return;
    const bot = online[Math.floor(Math.random() * online.length)];
    const text = BOT_PHRASES[Math.floor(Math.random() * BOT_PHRASES.length)];
    const message: Message = {
      id: newId(),
      user_id: bot.user_id,
      nickname: bot.nickname,
      kind: 'text',
      text,
      image_path: null,
      created_at: new Date().toISOString(),
    };
    this.messages.push(message);
    this.messages.sort(compareMessages);
    this.emit('message.new', message);
  }

  private toggleBot(): void {
    const taken = new Set([...this.bots.keys()]);
    const myKey = this.me ? nicknameKey(this.me.nickname) : '';
    const remoteKeys = new Set([...this.remote.values()].map((m) => nicknameKey(m.nickname)));
    const offline = BOT_NAMES.filter(
      (name) => !taken.has(name) && nicknameKey(name) !== myKey && !remoteKeys.has(nicknameKey(name)),
    );
    const shouldJoin = this.bots.size <= 2 || (offline.length > 0 && Math.random() < 0.5);
    if (shouldJoin && offline.length > 0) {
      const name = offline[Math.floor(Math.random() * offline.length)];
      const bot = this.makeBot(name);
      this.bots.set(name, bot);
      this.emit('presence.join', bot);
    } else if (this.bots.size > 0) {
      const names = [...this.bots.keys()];
      const name = names[Math.floor(Math.random() * names.length)];
      const bot = this.bots.get(name);
      this.bots.delete(name);
      if (!bot) return;
      // 一半是按了「離開」，一半是直接斷線，兩種情況都能測到
      if (Math.random() < 0.5) {
        this.emit('user.left', { session_id: bot.session_id, nickname: bot.nickname });
      } else {
        this.emit('presence.leave', bot);
      }
    }
  }
}
