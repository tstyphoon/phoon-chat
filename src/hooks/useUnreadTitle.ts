import { useCallback, useEffect, useRef } from 'react';

const BASE_TITLE = 'phoon-chat';

/** 頁面在背景時，分頁標題顯示未讀數，例如「(3) phoon-chat」；回到頁面後清掉 */
export function useUnreadTitle(active: boolean) {
  const unreadRef = useRef(0);

  const render = useCallback(() => {
    document.title = unreadRef.current > 0 ? `(${unreadRef.current}) ${BASE_TITLE}` : BASE_TITLE;
  }, []);

  useEffect(() => {
    if (!active) {
      unreadRef.current = 0;
      render();
      return;
    }
    const onVisibility = () => {
      if (!document.hidden) {
        unreadRef.current = 0;
        render();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [active, render]);

  /** 有新訊息進來時呼叫；只有頁面在背景時才會計數 */
  const bump = useCallback((): boolean => {
    if (!document.hidden) return false;
    unreadRef.current += 1;
    render();
    return true;
  }, [render]);

  return { bump };
}
