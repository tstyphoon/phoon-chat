import { useCallback, useId, useRef, useState } from 'react';
import { Composer, type ComposerHandle } from '../components/Composer';
import { ConnectionBanner } from '../components/ConnectionBanner';
import { Logo, SoundIconButton, SoundTextButton, ThemeCycleButton, ThemeSegmented } from '../components/Controls';
import { DebugPanel } from '../components/DebugPanel';
import { ConfirmDialog, ImageLightbox } from '../components/Dialogs';
import { MessageList } from '../components/MessageList';
import { OnlineBar, RosterList } from '../components/Roster';
import type { ChatApi } from '../hooks/useChat';
import type { ThemeMode } from '../hooks/useTheme';
import type { ChatService } from '../services/chatService';

interface Props {
  service: ChatService;
  chat: ChatApi;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onThemeCycle: () => void;
  soundEnabled: boolean;
  onSoundToggle: () => void;
}

const SHOW_DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

export function ChatScreen({
  service,
  chat,
  themeMode,
  onThemeChange,
  onThemeCycle,
  soundEnabled,
  onSoundToggle,
}: Props) {
  const rosterId = useId();
  const composerRef = useRef<ComposerHandle>(null);
  const dragDepth = useRef(0);
  const [rosterOpen, setRosterOpen] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; trigger: HTMLElement } | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const getImageUrl = useCallback((path: string) => service.getImageUrl(path), [service]);
  const meSessionId = chat.me?.session_id;
  const count = chat.members.length;

  const hasFiles = (event: React.DragEvent) => Array.from(event.dataTransfer.types).includes('Files');

  return (
    <div
      className="chat"
      onDragEnter={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        dragDepth.current += 1;
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (hasFiles(event)) event.preventDefault();
      }}
      onDragLeave={(event) => {
        if (!hasFiles(event)) return;
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) setDragging(false);
      }}
      onDrop={(event) => {
        if (!hasFiles(event)) return;
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        composerRef.current?.attach(event.dataTransfer.files);
      }}
    >
      {/* 電腦版：側邊欄 */}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Logo size={28} />
        </div>
        <div className="sidebar-online">
          <span className="online-dot" aria-hidden="true" />
          {count} 人在線
        </div>
        <RosterList members={chat.members} meSessionId={meSessionId} />
        <div className="sidebar-settings">
          <SoundTextButton enabled={soundEnabled} onToggle={onSoundToggle} />
          <ThemeSegmented mode={themeMode} onChange={onThemeChange} />
          <button type="button" className="danger-outline-button" onClick={() => void chat.leave()}>
            離開聊天室
          </button>
        </div>
      </aside>

      <div className="chat-main">
        {/* 手機版：標題列與人數列 */}
        <header className="topbar">
          <Logo />
          <div className="topbar-actions">
            <SoundIconButton enabled={soundEnabled} onToggle={onSoundToggle} />
            <ThemeCycleButton mode={themeMode} onCycle={onThemeCycle} />
            <button type="button" className="danger-outline-button topbar-leave" onClick={() => void chat.leave()}>
              離開
            </button>
          </div>
        </header>

        <ConnectionBanner status={chat.status} />

        <div className="mobile-online">
          <OnlineBar count={count} open={rosterOpen} controlsId={rosterId} onToggle={() => setRosterOpen((open) => !open)} />
          {rosterOpen && (
            <div className="mobile-roster">
              <RosterList id={rosterId} members={chat.members} meSessionId={meSessionId} />
            </div>
          )}
        </div>

        <MessageList
          messages={chat.messages}
          pending={chat.pending}
          notices={chat.notices}
          userId={service.userId}
          loadingInitial={chat.loadingInitial}
          loadingOlder={chat.loadingOlder}
          hasMore={chat.hasMore}
          onLoadOlder={() => void chat.loadOlder()}
          getImageUrl={getImageUrl}
          onOpenImage={(src, trigger) => setLightbox({ src, trigger })}
          onDelete={setDeleteId}
          onRetry={chat.retry}
        />

        <Composer ref={composerRef} onSendText={chat.sendText} onSendImage={chat.sendImage} />

        {dragging && (
          <div className="drop-overlay" aria-hidden="true">
            放開以上傳圖片
          </div>
        )}
      </div>

      {lightbox && (
        <ImageLightbox src={lightbox.src} returnFocusTo={lightbox.trigger} onClose={() => setLightbox(null)} />
      )}

      {deleteId && (
        <ConfirmDialog
          title="刪除這則訊息？"
          description="刪除後，所有人的畫面上都會消失。"
          confirmLabel="刪除"
          onCancel={() => setDeleteId(null)}
          onConfirm={() => {
            void chat.deleteMessage(deleteId);
            setDeleteId(null);
          }}
        />
      )}

      {SHOW_DEBUG && service.debug && <DebugPanel controls={service.debug} />}
    </div>
  );
}
