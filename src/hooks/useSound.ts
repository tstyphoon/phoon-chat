import { useCallback, useRef, useState } from 'react';
import { readStorage, STORAGE_KEYS, writeStorage } from '../utils/storage';

/** 提示音。預設關閉，使用者自己決定要不要開（選擇會記在瀏覽器） */
export function useSound() {
  const [enabled, setEnabled] = useState(() => readStorage(STORAGE_KEYS.sound) === 'on');
  const contextRef = useRef<AudioContext | null>(null);

  const ensureContext = useCallback((): AudioContext | null => {
    if (contextRef.current) return contextRef.current;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return null;
    contextRef.current = new Ctor();
    return contextRef.current;
  }, []);

  const beep = useCallback(() => {
    const context = ensureContext();
    if (!context) return;
    if (context.state === 'suspended') void context.resume();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.22);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.25);
  }, [ensureContext]);

  const toggle = useCallback(() => {
    setEnabled((previous) => {
      const next = !previous;
      writeStorage(STORAGE_KEYS.sound, next ? 'on' : 'off');
      return next;
    });
    // 在使用者點擊的當下建立音訊環境，瀏覽器才會允許之後播放
    ensureContext();
  }, [ensureContext]);

  return { enabled, toggle, play: beep };
}
