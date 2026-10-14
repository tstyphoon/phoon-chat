import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CONFIG } from '../config';
import type { Message, Notice, PendingMessage } from '../types';
import { dayKey, formatDate, formatTime, nickColorIndex } from '../utils/format';
import { Icon } from './Icon';
import { MessageBody } from './MessageBody';

interface LineEntry {
  kind: 'line';
  key: string;
  time: number;
  user_id: string;
  nickname: string;
  content: { type: 'text'; text: string } | { type: 'image'; src: string };
  status: 'sent' | 'sending' | 'failed';
}

interface NoticeEntry {
  kind: 'notice';
  key: string;
  time: number;
  text: string;
}

type Entry = LineEntry | NoticeEntry;

type Block =
  | { type: 'date'; key: string; label: string }
  | { type: 'notice'; key: string; text: string }
  | { type: 'group'; key: string; user_id: string; nickname: string; time: number; lastTime: number; own: boolean; lines: LineEntry[] };

interface Props {
  messages: Message[];
  pending: PendingMessage[];
  notices: Notice[];
  userId: string;
  loadingInitial: boolean;
  loadingOlder: boolean;
  hasMore: boolean;
  onLoadOlder: () => void;
  getImageUrl: (path: string) => string;
  onOpenImage: (src: string, trigger: HTMLElement) => void;
  onDelete: (id: string) => void;
  onRetry: (id: string) => void;
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function MessageList({
  messages,
  pending,
  notices,
  userId,
  loadingInitial,
  loadingOlder,
  hasMore,
  onLoadOlder,
  getImageUrl,
  onOpenImage,
  onDelete,
  onRetry,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const atBottomRef = useRef(true);
  const previous = useRef<{ lastKey: string | null; firstKey: string | null; scrollHeight: number }>({
    lastKey: null,
    firstKey: null,
    scrollHeight: 0,
  });
  const [newCount, setNewCount] = useState(0);

  // ---------- 把訊息、傳送中的訊息、系統提示依時間排在一起 ----------
  const entries = useMemo<Entry[]>(() => {
    const lines: Entry[] = [
      ...messages.map<LineEntry>((message) => ({
        kind: 'line',
        key: message.id,
        time: Date.parse(message.created_at),
        user_id: message.user_id,
        nickname: message.nickname,
        content:
          message.kind === 'image'
            ? { type: 'image', src: getImageUrl(message.image_path ?? '') }
            : { type: 'text', text: message.text ?? '' },
        status: 'sent',
      })),
      ...pending.map<LineEntry>((item) => ({
        kind: 'line',
        key: item.id,
        time: item.created,
        user_id: item.user_id,
        nickname: item.nickname,
        content:
          item.kind === 'image'
            ? { type: 'image', src: item.previewUrl ?? '' }
            : { type: 'text', text: item.text ?? '' },
        status: item.status,
      })),
      ...notices.map<NoticeEntry>((notice) => ({
        kind: 'notice',
        key: notice.id,
        time: notice.at,
        text: `${notice.nickname} ${notice.type === 'joined' ? '加入了聊天室' : '離開了聊天室'}`,
      })),
    ];
    return lines.sort((a, b) => a.time - b.time);
  }, [messages, pending, notices, getImageUrl]);

  // ---------- 分組：同一人連續的訊息合併；跨日加日期分隔線 ----------
  const blocks = useMemo<Block[]>(() => {
    const result: Block[] = [];
    let lastDay = '';
    let group: Extract<Block, { type: 'group' }> | null = null;
    for (const entry of entries) {
      const day = dayKey(entry.time);
      if (day !== lastDay) {
        lastDay = day;
        group = null;
        result.push({ type: 'date', key: `date-${day}`, label: formatDate(entry.time) });
      }
      if (entry.kind === 'notice') {
        group = null;
        result.push({ type: 'notice', key: entry.key, text: entry.text });
        continue;
      }
      // 同一個身分換了代號（離開後用新代號重新進入），要另起一組，標題才會顯示新代號
      if (
        group &&
        group.user_id === entry.user_id &&
        group.nickname === entry.nickname &&
        entry.time - group.lastTime < CONFIG.ui.groupGapMs
      ) {
        group.lines.push(entry);
        group.lastTime = entry.time;
      } else {
        group = {
          type: 'group',
          key: entry.key,
          user_id: entry.user_id,
          nickname: entry.nickname,
          time: entry.time,
          lastTime: entry.time,
          own: entry.user_id === userId,
          lines: [entry],
        };
        result.push(group);
      }
    }
    return result;
  }, [entries, userId]);

  const hasLines = entries.some((entry) => entry.kind === 'line');

  const scrollToBottom = useCallback((smooth = false) => {
    const element = scrollRef.current;
    if (!element) return;
    element.scrollTo({ top: element.scrollHeight, behavior: smooth && !prefersReducedMotion() ? 'smooth' : 'auto' });
  }, []);

  // ---------- 捲動行為 ----------
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const lastKey = entries.length > 0 ? entries[entries.length - 1].key : null;
    const firstKey = entries.length > 0 ? entries[0].key : null;
    const before = previous.current;

    if (before.lastKey === null) {
      // 第一次有內容：直接捲到最底
      if (lastKey !== null) element.scrollTop = element.scrollHeight;
    } else if (lastKey !== before.lastKey) {
      const lastEntry = entries[entries.length - 1];
      const index = entries.findIndex((entry) => entry.key === before.lastKey);
      const ownJustSent = lastEntry?.kind === 'line' && lastEntry.user_id === userId;
      if (index !== -1 && index < entries.length - 1) {
        if (atBottomRef.current || ownJustSent) {
          element.scrollTop = element.scrollHeight;
        } else {
          // 不在底部：不要把畫面拉走，只提示有幾則新訊息
          const fresh = entries
            .slice(index + 1)
            .filter((entry) => entry.kind === 'line' && entry.user_id !== userId).length;
          if (fresh > 0) setNewCount((count) => count + fresh);
        }
      }
    } else if (firstKey !== before.firstKey) {
      // 往上載入了更早的訊息：保持使用者原本看的位置不動
      element.scrollTop += element.scrollHeight - before.scrollHeight;
    }
    previous.current = { lastKey, firstKey, scrollHeight: element.scrollHeight };
  }, [entries, userId]);

  // 內容太短、捲不動的時候，自動多載一頁
  useEffect(() => {
    const element = scrollRef.current;
    if (!element || !hasMore || loadingOlder || loadingInitial) return;
    if (element.scrollHeight <= element.clientHeight + 20) onLoadOlder();
  }, [entries, hasMore, loadingOlder, loadingInitial, onLoadOlder]);

  const handleScroll = () => {
    const element = scrollRef.current;
    if (!element) return;
    const gap = element.scrollHeight - element.scrollTop - element.clientHeight;
    atBottomRef.current = gap < CONFIG.ui.atBottomThresholdPx;
    if (atBottomRef.current) setNewCount(0);
    if (element.scrollTop < 60 && hasMore && !loadingOlder && !loadingInitial) onLoadOlder();
  };

  const handleImageLoaded = () => {
    if (atBottomRef.current) scrollToBottom();
  };

  const jumpToBottom = () => {
    scrollToBottom(true);
    setNewCount(0);
  };

  return (
    <div className="message-pane">
      <div
        ref={scrollRef}
        className="message-scroll"
        role="log"
        aria-label="聊天訊息"
        aria-live="polite"
        tabIndex={0}
        onScroll={handleScroll}
      >
        <div className="message-flow">
          {loadingInitial && (
            <div className="skeleton" role="status">
              <div className="skeleton-row">
                <span className="skeleton-bar w-name" />
                <span className="skeleton-bar w-long" />
              </div>
              <div className="skeleton-row">
                <span className="skeleton-bar w-name" />
                <span className="skeleton-bar w-mid" />
                <span className="skeleton-bar w-long" />
              </div>
              <div className="skeleton-note">
                <Icon name="spinner" size={14} strokeWidth={2.4} className="spin" />
                載入最近的訊息…
              </div>
            </div>
          )}

          {!loadingInitial && loadingOlder && (
            <div className="flow-note" role="status">
              <Icon name="spinner" size={14} strokeWidth={2.4} className="spin" />
              載入更早的訊息…
            </div>
          )}
          {!loadingInitial && !loadingOlder && !hasMore && hasLines && (
            <div className="flow-note">沒有更早的訊息了</div>
          )}

          {!loadingInitial && !hasLines && (
            <div className="empty-state">
              <Icon name="logo" size={40} strokeWidth={1.6} />
              <div className="empty-title">這裡還沒有訊息</div>
              <div className="empty-desc">來當第一個開口的人吧。</div>
            </div>
          )}

          {blocks.map((block) => {
            if (block.type === 'date') {
              return (
                <div key={block.key} className="date-divider">
                  <span className="date-rule" />
                  {block.label}
                  <span className="date-rule" />
                </div>
              );
            }
            if (block.type === 'notice') {
              return (
                <div key={block.key} className="system-notice">
                  {block.text}
                </div>
              );
            }
            return (
              <div key={block.key} className={`group${block.own ? ' is-own' : ''}`}>
                <div className="group-head">
                  <span className={`nick ${block.own ? 'nick-self' : `nick-${nickColorIndex(block.nickname)}`}`}>
                    {block.nickname}
                  </span>
                  <time className="group-time" dateTime={new Date(block.time).toISOString()}>
                    {formatTime(block.time)}
                  </time>
                </div>
                {block.lines.map((line) => (
                  <div key={line.key} className={`line${line.status !== 'sent' ? ' is-unsettled' : ''}`}>
                    <div className="line-main">
                      {line.content.type === 'text' ? (
                        <div className="line-text">
                          <MessageBody text={line.content.text} />
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="image-button"
                          aria-label="放大圖片"
                          onClick={(event) => onOpenImage((line.content as { src: string }).src, event.currentTarget)}
                        >
                          <img src={line.content.src} alt="圖片訊息" onLoad={handleImageLoaded} />
                        </button>
                      )}
                      {line.status === 'sending' && <span className="line-state">傳送中…</span>}
                      {line.status === 'failed' && (
                        <button type="button" className="retry-button" onClick={() => onRetry(line.key)}>
                          <Icon name="refresh" size={14} strokeWidth={2.2} />
                          未送出，點一下重送
                        </button>
                      )}
                    </div>
                    {block.own && line.status === 'sent' && (
                      <button
                        type="button"
                        className="delete-button"
                        aria-label="刪除這則訊息"
                        onClick={() => onDelete(line.key)}
                      >
                        <Icon name="trash" size={16} strokeWidth={2} />
                        <span className="delete-label">刪除</span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {newCount > 0 && (
        <button type="button" className="new-pill" onClick={jumpToBottom}>
          有 {newCount} 則新訊息
          <Icon name="arrowDown" size={18} strokeWidth={2.2} />
        </button>
      )}
    </div>
  );
}
