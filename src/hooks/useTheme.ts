import { useCallback, useEffect, useState } from 'react';
import { readStorage, STORAGE_KEYS, writeStorage } from '../utils/storage';

export type ThemeMode = 'dark' | 'light' | 'system';

const ORDER: ThemeMode[] = ['dark', 'light', 'system'];

function readMode(): ThemeMode {
  const saved = readStorage(STORAGE_KEYS.theme);
  return saved === 'dark' || saved === 'light' || saved === 'system' ? saved : 'system';
}

function systemPrefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
}

/** 深色、淺色、跟隨系統。實際套用的是 <html data-theme="dark|light">，樣式用 CSS 變數切換 */
export function useTheme() {
  const [mode, setModeState] = useState<ThemeMode>(readMode);

  useEffect(() => {
    const apply = () => {
      const dark = mode === 'dark' || (mode === 'system' && systemPrefersDark());
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    if (mode !== 'system' || typeof matchMedia !== 'function') return;
    const query = matchMedia('(prefers-color-scheme: dark)');
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [mode]);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    writeStorage(STORAGE_KEYS.theme, next);
  }, []);

  /** 手機上點一下依序切換：深色 → 淺色 → 跟隨系統 */
  const cycle = useCallback(() => {
    setMode(ORDER[(ORDER.indexOf(mode) + 1) % ORDER.length]);
  }, [mode, setMode]);

  return { mode, setMode, cycle };
}
