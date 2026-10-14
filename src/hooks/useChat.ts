import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG } from '../config';
import { SendGuard } from '../rules/message';
import { validateImage } from '../rules/image';
import type { ChatService } from '../services/chatService';
import type {
  ConnectionStatus,
  Message,
  Notice,
  PendingMessage,
  PresenceMember,
} from '../types';
import { newId } from '../utils/id';
import { STORAGE_KEYS, writeStorage } from '../utils/storage';

export type Phase = 'join' | 'joining' | 'chat';

export type SubmitResult = { ok: true } | { ok: false; message: string };

interface Options {
  /** 別人送來新訊息時呼叫（用於分頁標題未讀數、提示音） */
  onIncoming?: (message: Message) => void;
}

/** 同一個瀏覽器（同一個 user_id）同時只算一個人：重新整理後舊連線會殘留一小段時間，只留最新的 */
function uniqueByUser(list: PresenceMember[]): PresenceMember[] {
  const byUser = new Map<string, PresenceMember>();
  for (const member of list) {
    const existing = byUser.get(member.user_id);
    if (!existing || existing.joined_at < member.joined_at) byUser.set(member.user_id, member);
  }
  return [...byUser.values()];
}

function mergeMessages(current: Message[], incoming: Message[]): Message[] {
  const byId = new Map<string, Message>();
  for (const message of current) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) =>
    a.created_at !== b.created_at ? (a.created_at < b.created_at ? -1 : 1) : a.id < b.id ? -1 : 1,
  );
}

/**
 * 聊天室的所有狀態與動作。畫面只呼叫這裡，這裡只透過 ChatService 和後端溝通。
 * 所以階段二換成 Supabase 時，這個檔案不用改。
 */
export function useChat(service: ChatService, options: Options = {}) {
  const [phase, setPhase] = useState<Phase>('join');
  const [joinError, setJoinError] = useState<string | null>(null);
  const [me, setMe] = useState<PresenceMember | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [members, setMembers] = useState<PresenceMember[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>('connected');
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMore, setHasMore] = useState(false);

  const guard = useRef(new SendGuard());
  const onIncomingRef = useRef(options.onIncoming);
  onIncomingRef.current = options.onIncoming;
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;
  /** 等待中的「離開」：先等一下，短暫斷線的人回來就取消 */
  const leaveTimers = useRef(new Map<string, { userId: string; timer: ReturnType<typeof setTimeout> }>());
  const leftSessions = useRef(new Set<string>());
  const loadingOlderRef = useRef(false);
  /** 送太快而排隊中的訊息：時間到了才會真的送出；離開聊天室時要全部取消 */
  const queuedTimers = useRef(new Set<ReturnType<typeof setTimeout>>());
  /** 目前名單的即時副本，事件處理函式要同步判斷「這個人還在不在名單裡」時使用 */
  const membersRef = useRef<PresenceMember[]>([]);
  const updateMembers = useCallback((update: (previous: PresenceMember[]) => PresenceMember[]) => {
    membersRef.current = update(membersRef.current);
    setMembers(membersRef.current);
  }, []);

  const addNotice = useCallback((type: Notice['type'], nickname: string) => {
    setNotices((previous) => [...previous, { id: newId(), type, nickname, at: Date.now() }].slice(-200));
  }, []);

  const resetChat = useCallback(() => {
    leaveTimers.current.forEach((entry) => clearTimeout(entry.timer));
    leaveTimers.current.clear();
    queuedTimers.current.forEach((timer) => clearTimeout(timer));
    queuedTimers.current.clear();
    leftSessions.current.clear();
    setPending((previous) => {
      previous.forEach((item) => item.previewUrl && URL.revokeObjectURL(item.previewUrl));
      return [];
    });
    setMessages([]);
    setNotices([]);
    membersRef.current = [];
    setMembers([]);
    setMe(null);
    setHasMore(false);
    setLoadingInitial(false);
    setLoadingOlder(false);
    loadingOlderRef.current = false;
    setStatus('connected');
    guard.current = new SendGuard();
  }, []);

  // ---------- 接收後端事件 ----------
  useEffect(() => {
    const offs = [
      service.on('message.new', (message) => {
        setMessages((previous) => mergeMessages(previous, [message]));
        setPending((previous) => {
          const done = previous.find((item) => item.id === message.id);
          if (done?.previewUrl) URL.revokeObjectURL(done.previewUrl);
          return previous.filter((item) => item.id !== message.id);
        });
        if (message.user_id !== service.userId) onIncomingRef.current?.(message);
      }),

      service.on('message.deleted', ({ id }) => {
        setMessages((previous) => previous.filter((message) => message.id !== id));
      }),

      service.on('presence.sync', (list) => {
        leaveTimers.current.forEach((entry) => clearTimeout(entry.timer));
        leaveTimers.current.clear();
        leftSessions.current.clear();
        updateMembers(() => uniqueByUser(list));
      }),

      service.on('presence.join', (member) => {
        leftSessions.current.delete(member.session_id);
        // 同一個人換了新連線（短暫斷線又回來、或重新整理）：取消舊連線的「離開」，也不顯示「加入」
        let reconnected = membersRef.current.some(
          (item) => item.user_id === member.user_id && item.session_id !== member.session_id,
        );
        leaveTimers.current.forEach((entry, sessionId) => {
          if (entry.userId === member.user_id) {
            clearTimeout(entry.timer);
            leaveTimers.current.delete(sessionId);
            reconnected = true;
          }
        });
        updateMembers((previous) => [...previous.filter((item) => item.user_id !== member.user_id), member]);
        if (!reconnected) addNotice('joined', member.nickname);
      }),

      service.on('presence.leave', (member) => {
        // 已經按「離開」處理過的人，後面又來的斷線事件不重複顯示
        if (leftSessions.current.has(member.session_id)) return;
        if (leaveTimers.current.has(member.session_id)) return;
        // 已經被同一個人的新連線取代的舊連線，不用處理
        if (!membersRef.current.some((item) => item.session_id === member.session_id)) return;
        const timer = setTimeout(() => {
          leaveTimers.current.delete(member.session_id);
          updateMembers((previous) => previous.filter((item) => item.session_id !== member.session_id));
          addNotice('left', member.nickname);
        }, CONFIG.presence.leaveGraceMs);
        leaveTimers.current.set(member.session_id, { userId: member.user_id, timer });
      }),

      // 按了「離開」：立刻顯示，不用等寬限時間
      service.on('user.left', ({ session_id, nickname }) => {
        if (leftSessions.current.has(session_id)) return;
        leftSessions.current.add(session_id);
        const waiting = leaveTimers.current.get(session_id);
        if (waiting) {
          clearTimeout(waiting.timer);
          leaveTimers.current.delete(session_id);
        }
        updateMembers((previous) => previous.filter((item) => item.session_id !== session_id));
        addNotice('left', nickname);
      }),

      service.on('connection.status', setStatus),

      service.on('session.kicked', () => {
        resetChat();
        setPhase('join');
        setJoinError('這個代號有人在用了，請換一個');
      }),
    ];
    return () => {
      offs.forEach((off) => off());
    };
  }, [service, addNotice, resetChat, updateMembers]);

  // 關掉元件時清掉計時器
  useEffect(() => {
    const timers = leaveTimers.current;
    return () => {
      timers.forEach((entry) => clearTimeout(entry.timer));
    };
  }, []);

  // ---------- 動作 ----------

  const join = useCallback(
    async (nickname: string) => {
      setPhase('joining');
      setJoinError(null);
      const result = await service.join(nickname);
      if (!result.ok) {
        setPhase('join');
        setJoinError(result.message);
        return;
      }
      writeStorage(STORAGE_KEYS.nickname, result.me.nickname);
      setMe(result.me);
      setPhase('chat');
      setLoadingInitial(true);
      try {
        const page = await service.loadRecent();
        setMessages((previous) => mergeMessages(previous, page.messages));
        setHasMore(page.hasMore);
      } finally {
        setLoadingInitial(false);
      }
    },
    [service],
  );

  const leave = useCallback(async () => {
    await service.leave();
    resetChat();
    setPhase('join');
    setJoinError(null);
  }, [service, resetChat]);

  const loadOlder = useCallback(async () => {
    if (loadingOlderRef.current || !hasMore) return;
    const oldest = messages[0];
    if (!oldest) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    try {
      const page = await service.loadOlder(oldest.created_at);
      setMessages((previous) => mergeMessages(previous, page.messages));
      setHasMore(page.hasMore);
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlder(false);
    }
  }, [service, hasMore, messages]);

  const deliver = useCallback(
    async (item: PendingMessage) => {
      const result =
        item.kind === 'image' && item.file
          ? await service.sendImage(item.id, item.file)
          : await service.sendText(item.id, item.text ?? '');
      if (!result.ok) {
        setPending((previous) =>
          previous.map((entry) => (entry.id === item.id ? { ...entry, status: 'failed' } : entry)),
        );
      }
    },
    [service],
  );

  const sendText = useCallback(
    (text: string): SubmitResult => {
      // 送太快時不直接拒絕：排隊等間隔夠了再自動送出（等太久才請使用者稍等）
      const now = Date.now();
      const wait = guard.current.waitMs(now);
      if (wait > CONFIG.message.maxQueueWaitMs) return { ok: false, message: '送太快了，請稍等一下' };
      const sendAt = now + wait;
      const check = guard.current.check(text, sendAt, { ignoreRate: true });
      if (!check.ok) return { ok: false, message: check.message };
      const body = text.trim();
      const item: PendingMessage = {
        id: newId(),
        kind: 'text',
        user_id: service.userId,
        nickname: me?.nickname ?? '',
        text: body,
        file: null,
        previewUrl: null,
        status: 'sending',
        created: sendAt,
      };
      guard.current.record(body, sendAt);
      setPending((previous) => [...previous, item]);
      if (wait === 0) {
        void deliver(item);
      } else {
        const timer = setTimeout(() => {
          queuedTimers.current.delete(timer);
          void deliver(item);
        }, wait);
        queuedTimers.current.add(timer);
      }
      return { ok: true };
    },
    [service, me, deliver],
  );

  const sendImage = useCallback(
    (file: File): SubmitResult => {
      const valid = validateImage(file);
      if (!valid.ok) return { ok: false, message: valid.message };
      const rate = guard.current.checkRate();
      if (!rate.ok) return { ok: false, message: rate.message };
      const item: PendingMessage = {
        id: newId(),
        kind: 'image',
        user_id: service.userId,
        nickname: me?.nickname ?? '',
        text: null,
        file,
        previewUrl: URL.createObjectURL(file),
        status: 'sending',
        created: Date.now(),
      };
      guard.current.recordAny();
      setPending((previous) => [...previous, item]);
      void deliver(item);
      return { ok: true };
    },
    [service, me, deliver],
  );

  /** 沒送出去的訊息，點一下用同一個 id 重送，不會變成兩則 */
  const retry = useCallback(
    (id: string) => {
      const item = pending.find((entry) => entry.id === id);
      if (!item || item.status === 'sending') return;
      const next: PendingMessage = { ...item, status: 'sending' };
      setPending((previous) => previous.map((entry) => (entry.id === id ? next : entry)));
      void deliver(next);
    },
    [pending, deliver],
  );

  const deleteMessage = useCallback(
    async (id: string) => {
      setMessages((previous) => previous.filter((message) => message.id !== id));
      await service.deleteMessage(id);
    },
    [service],
  );

  return {
    phase,
    joinError,
    me,
    messages,
    pending,
    notices,
    members,
    status,
    loadingInitial,
    loadingOlder,
    hasMore,
    join,
    leave,
    loadOlder,
    sendText,
    sendImage,
    retry,
    deleteMessage,
    clearJoinError: () => setJoinError(null),
  };
}

export type ChatApi = ReturnType<typeof useChat>;
