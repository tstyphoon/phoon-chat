import type { ThemeMode } from '../hooks/useTheme';
import { Icon, type IconName } from './Icon';

export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="logo">
      <Icon name="logo" size={size} />
      <span className="logo-word">phoon-chat</span>
    </span>
  );
}

const THEME_LABEL: Record<ThemeMode, string> = { dark: '深色', light: '淺色', system: '跟隨系統' };
const THEME_ICON: Record<ThemeMode, IconName> = { dark: 'moon', light: 'sun', system: 'monitor' };

/** 深色、淺色、跟隨系統三選一（進入畫面與電腦版側邊欄） */
export function ThemeSegmented({ mode, onChange }: { mode: ThemeMode; onChange: (mode: ThemeMode) => void }) {
  const modes: ThemeMode[] = ['dark', 'light', 'system'];
  return (
    <div role="group" aria-label="外觀主題" className="segmented">
      {modes.map((item) => (
        <button
          key={item}
          type="button"
          aria-pressed={mode === item}
          className="segmented-button"
          onClick={() => onChange(item)}
        >
          {THEME_LABEL[item]}
        </button>
      ))}
    </div>
  );
}

/** 手機標題列：點一下依序切換三種主題 */
export function ThemeCycleButton({ mode, onCycle }: { mode: ThemeMode; onCycle: () => void }) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={`外觀主題：${THEME_LABEL[mode]}，點一下切換`}
      onClick={onCycle}
    >
      <Icon name={THEME_ICON[mode]} />
    </button>
  );
}

export function SoundIconButton({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className={`icon-button${enabled ? ' is-on' : ''}`}
      aria-label={enabled ? '提示音：已開啟，點一下關閉' : '提示音：已關閉，點一下開啟'}
      aria-pressed={enabled}
      onClick={onToggle}
    >
      <Icon name={enabled ? 'bell' : 'bellOff'} />
    </button>
  );
}

export function SoundTextButton({ enabled, onToggle }: { enabled: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      className="outline-button side-sound"
      aria-label={enabled ? '提示音：已開啟，點一下關閉' : '提示音：已關閉，點一下開啟'}
      aria-pressed={enabled}
      onClick={onToggle}
    >
      <Icon name={enabled ? 'bell' : 'bellOff'} size={20} />
      提示音：{enabled ? '開啟' : '關閉'}
    </button>
  );
}
