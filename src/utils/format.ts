import { nicknameKey } from '../rules/nickname';

const timeFormat = new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false });

/** 14:32 */
export function formatTime(ms: number): string {
  return timeFormat.format(new Date(ms));
}

/** 2026年10月13日 */
export function formatDate(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 用來判斷兩則訊息是不是同一天 */
export function dayKey(ms: number): string {
  const date = new Date(ms);
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
}

/** 代號文字算出固定的顏色編號（1 到 6），同一個代號永遠同一個顏色 */
export function nickColorIndex(nickname: string): number {
  let hash = 0;
  for (const char of nicknameKey(nickname)) {
    hash = (hash * 31 + (char.codePointAt(0) ?? 0)) >>> 0;
  }
  return (hash % 6) + 1;
}
