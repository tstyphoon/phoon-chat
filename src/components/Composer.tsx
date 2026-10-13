import { useCallback, useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { CONFIG } from '../config';
import { validateImage, formatFileSize } from '../rules/image';
import { countChars } from '../rules/nickname';
import type { SubmitResult } from '../hooks/useChat';
import { Icon } from './Icon';

export interface ComposerHandle {
  /** 把檔案交給輸入區（貼上、拖曳進來時使用），會先檢查格式與大小 */
  attach: (files: FileList | File[]) => void;
}

interface Props {
  onSendText: (text: string) => SubmitResult;
  onSendImage: (file: File) => SubmitResult;
  ref?: Ref<ComposerHandle>;
}

interface Attachment {
  file: File;
  url: string;
}

const MAX_PX = 132;

/** 有實體鍵盤與滑鼠的裝置，Enter 送出；手機的 Enter 是換行 */
function enterSends(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches;
}

export function Composer({ onSendText, onSendImage, ref }: Props) {
  const [text, setText] = useState('');
  const [hint, setHint] = useState<{ message: string; id: number } | null>(null);
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const attachmentRef = useRef<Attachment | null>(null);
  attachmentRef.current = attachment;

  const showHint = useCallback((message: string) => {
    setHint({ message, id: Date.now() });
  }, []);

  // 提示過幾秒自動消失
  useEffect(() => {
    if (!hint) return;
    const timer = setTimeout(() => setHint(null), CONFIG.ui.hintDurationMs);
    return () => clearTimeout(timer);
  }, [hint]);

  // 文字框依內容自動長高，最多約五行
  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, MAX_PX)}px`;
  }, [text]);

  // 離開時釋放預覽圖
  useEffect(
    () => () => {
      if (attachmentRef.current) URL.revokeObjectURL(attachmentRef.current.url);
    },
    [],
  );

  const clearAttachment = useCallback(() => {
    setAttachment((current) => {
      if (current) URL.revokeObjectURL(current.url);
      return null;
    });
  }, []);

  const attach = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files);
      const file = list.find((item) => item.type.startsWith('image/')) ?? list[0];
      if (!file) return;
      const check = validateImage(file);
      if (!check.ok) {
        showHint(check.message);
        return;
      }
      setAttachment((current) => {
        if (current) URL.revokeObjectURL(current.url);
        return { file, url: URL.createObjectURL(file) };
      });
    },
    [showHint],
  );

  useImperativeHandle(ref, () => ({ attach }), [attach]);

  const length = countChars(text.trim());
  const overLimit = length > CONFIG.message.maxLength;
  const showCounter = length >= CONFIG.message.maxLength - 50;
  const canSend = text.trim() !== '' && !overLimit;

  const submit = () => {
    if (!canSend) return;
    const result = onSendText(text);
    if (result.ok) {
      setText('');
      setHint(null);
    } else {
      showHint(result.message);
    }
    textareaRef.current?.focus();
  };

  const submitImage = () => {
    if (!attachment) return;
    const result = onSendImage(attachment.file);
    if (result.ok) {
      clearAttachment();
      setHint(null);
    } else {
      showHint(result.message);
    }
  };

  return (
    <div className="composer">
      {hint && (
        <div key={hint.id} role="alert" className="hint">
          <Icon name="alert" size={16} strokeWidth={2} />
          {hint.message}
        </div>
      )}

      {attachment && (
        <div className="attachment">
          <img className="attachment-thumb" src={attachment.url} alt="待送出圖片的預覽" />
          <div className="attachment-info">
            <div className="attachment-name">{attachment.file.name || '貼上的圖片'}</div>
            <div className="attachment-size">
              {formatFileSize(attachment.file.size)}，在 {CONFIG.image.maxBytes / (1024 * 1024)} MB 上限內
            </div>
          </div>
          <button type="button" className="outline-button" onClick={clearAttachment}>
            取消
          </button>
          <button type="button" className="primary-button" onClick={submitImage}>
            送出圖片
          </button>
        </div>
      )}

      {showCounter && (
        <div className={`counter${overLimit ? ' is-over' : ''}`} aria-live="polite">
          {length} / {CONFIG.message.maxLength}
          {overLimit && '，超過上限'}
        </div>
      )}

      <div className="composer-row">
        <button
          type="button"
          className="icon-button"
          aria-label="選擇圖片"
          onClick={() => fileInputRef.current?.click()}
        >
          <Icon name="image" size={24} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          hidden
          accept={CONFIG.image.mimeTypes.join(',')}
          onChange={(event) => {
            if (event.target.files) attach(event.target.files);
            event.target.value = '';
          }}
        />
        <textarea
          ref={textareaRef}
          className="composer-input"
          rows={1}
          aria-label="訊息內容"
          placeholder="輸入訊息…"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // 輸入中文選字時按 Enter 是確認選字，不能當成送出
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && enterSends()) {
              event.preventDefault();
              submit();
            }
          }}
          onPaste={(event) => {
            const files = Array.from(event.clipboardData.files);
            if (files.some((file) => file.type.startsWith('image/'))) {
              event.preventDefault();
              attach(files);
            }
          }}
        />
        <button type="button" className="send-button" aria-label="送出" disabled={!canSend} onClick={submit}>
          <Icon name="send" />
        </button>
      </div>
      <div className="composer-help">Enter 送出，Shift + Enter 換行；也可以貼上截圖或把圖片拖進來</div>
    </div>
  );
}
