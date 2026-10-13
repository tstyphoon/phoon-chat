import { useState, type FormEvent } from 'react';
import { CONFIG } from '../config';
import { Icon } from '../components/Icon';
import { ThemeSegmented } from '../components/Controls';
import type { ThemeMode } from '../hooks/useTheme';
import { countChars, validateNickname } from '../rules/nickname';

interface Props {
  initialNickname: string;
  /** 後端回報的錯誤，例如「這個代號有人在用了」 */
  error: string | null;
  busy: boolean;
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onClearError: () => void;
  onSubmit: (nickname: string) => void;
}

export function JoinScreen({ initialNickname, error, busy, themeMode, onThemeChange, onClearError, onSubmit }: Props) {
  const [value, setValue] = useState(initialNickname);
  const prefilled = initialNickname !== '';
  const check = validateNickname(value);
  const trimmed = value.trim();
  // 沒輸入時不顯示錯誤，只是按鈕不能按；輸入了但不合規就說明原因
  const ruleError = trimmed !== '' && !check.ok ? check.message : null;
  const shownError = ruleError ?? error;
  const count = countChars(trimmed);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (busy || !check.ok) return;
    onSubmit(check.nickname);
  };

  return (
    <main className="join">
      <div className="join-top">
        <ThemeSegmented mode={themeMode} onChange={onThemeChange} />
      </div>

      <div className="join-body">
        <div className="join-heading">
          <div className="join-brand">
            <Icon name="logo" size={40} />
            <h1 className="join-title">phoon-chat</h1>
          </div>
          <p className="join-lead">不用註冊、不用登入。輸入一個代號，就能加入聊天室。</p>
        </div>

        <form className="join-form" onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="nickname" className="field-label">
              你的代號
            </label>
            <input
              id="nickname"
              className={`field-input${shownError ? ' has-error' : ''}`}
              type="text"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              autoFocus={!prefilled}
              value={value}
              aria-invalid={shownError ? true : undefined}
              aria-describedby={shownError ? 'nickname-error nickname-help' : 'nickname-help'}
              onChange={(event) => {
                setValue(event.target.value);
                if (error) onClearError();
              }}
            />
            {shownError && (
              <div id="nickname-error" role="alert" className="field-error">
                <Icon name="alert" size={18} strokeWidth={2} />
                <span>{shownError}</span>
              </div>
            )}
            <div id="nickname-help" className="field-help">
              <span>
                {CONFIG.nickname.minLength} 到 {CONFIG.nickname.maxLength} 個字，中文、英文、數字、emoji 都可以
              </span>
              <span className="field-count">
                {count} / {CONFIG.nickname.maxLength}
              </span>
            </div>
          </div>

          <button type="submit" className="join-submit" disabled={busy || !check.ok} aria-busy={busy}>
            {busy ? (
              <>
                <Icon name="spinner" size={20} strokeWidth={2.4} className="spin" />
                進入中…
              </>
            ) : (
              '進入聊天室'
            )}
          </button>
          {prefilled && !shownError && <div className="join-note">已自動填入你上次使用的代號</div>}
        </form>
      </div>

      <footer className="join-footer">匿名聊天室．訊息與圖片保留 {CONFIG.history.retentionDays} 天</footer>
    </main>
  );
}
