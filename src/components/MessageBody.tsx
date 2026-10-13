import type { ReactNode } from 'react';

// 只把 http:// 與 https:// 開頭的轉成連結。其餘一律當純文字，由 React 自動處理成安全的文字，
// 不使用「把字串當 HTML 插入」的寫法，所以訊息裡的 HTML 或 script 不會被執行。
const URL_PATTERN = /https?:\/\/[^\s<>"'，。！？、；：）」』】]+/giu;
const TRAILING_PUNCTUATION = /[.,;:!?)\]}]+$/u;

function cleanUrl(raw: string): { url: string; rest: string } {
  const trailing = raw.match(TRAILING_PUNCTUATION)?.[0] ?? '';
  return { url: trailing ? raw.slice(0, -trailing.length) : raw, rest: trailing };
}

function isValidHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/** 訊息文字：網址變成可點的連結，在新分頁開啟，並加上不讓新分頁控制原頁面的設定 */
export function MessageBody({ text }: { text: string }) {
  const parts: ReactNode[] = [];
  let last = 0;
  let key = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    const start = match.index ?? 0;
    const { url, rest } = cleanUrl(match[0]);
    if (start > last) parts.push(text.slice(last, start));
    if (isValidHttpUrl(url)) {
      parts.push(
        <a key={key++} href={url} target="_blank" rel="noopener noreferrer">
          {url}
        </a>,
      );
    } else {
      parts.push(url);
    }
    if (rest) parts.push(rest);
    last = start + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}
