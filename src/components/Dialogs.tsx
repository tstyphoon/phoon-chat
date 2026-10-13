import { useEffect, useRef } from 'react';
import { Icon } from './Icon';

interface LightboxProps {
  src: string;
  /** 打開前拿到焦點的元素，關閉後要把焦點還給它 */
  returnFocusTo: HTMLElement | null;
  onClose: () => void;
}

/** 圖片放大檢視：點背景、按關閉鈕、按 Esc 都能關閉 */
export function ImageLightbox({ src, returnFocusTo, onClose }: LightboxProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeRef.current?.focus();
    return () => {
      if (returnFocusTo && document.contains(returnFocusTo)) returnFocusTo.focus();
    };
  }, [returnFocusTo]);

  return (
    <div
      className="lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="圖片放大檢視"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
        // 對話框裡只有一個可以聚焦的東西，Tab 不讓焦點跑到後面的畫面
        if (event.key === 'Tab') {
          event.preventDefault();
          closeRef.current?.focus();
        }
      }}
    >
      <button ref={closeRef} type="button" className="lightbox-close" aria-label="關閉圖片" onClick={onClose}>
        <Icon name="close" />
      </button>
      <img className="lightbox-image" src={src} alt="放大後的圖片" />
    </div>
  );
}

interface ConfirmProps {
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 刪除前的確認框 */
export function ConfirmDialog({ title, description, confirmLabel, onConfirm, onCancel }: ConfirmProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    cancelRef.current?.focus();
    return () => {
      if (previous && document.contains(previous)) previous.focus();
    };
  }, []);

  return (
    <div
      className="dialog-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        className="dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        aria-describedby="dialog-desc"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onCancel();
          if (event.key === 'Tab') {
            // 只在兩顆按鈕之間循環
            const active = document.activeElement;
            if (event.shiftKey && active === cancelRef.current) {
              event.preventDefault();
              confirmRef.current?.focus();
            } else if (!event.shiftKey && active === confirmRef.current) {
              event.preventDefault();
              cancelRef.current?.focus();
            }
          }
        }}
      >
        <div className="dialog-text">
          <div id="dialog-title" className="dialog-title">
            {title}
          </div>
          <div id="dialog-desc" className="dialog-desc">
            {description}
          </div>
        </div>
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" className="outline-button" onClick={onCancel}>
            取消
          </button>
          <button ref={confirmRef} type="button" className="danger-button" onClick={onConfirm}>
            <Icon name="trash" size={18} strokeWidth={2} />
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
