// 收到訊息後、顯示之前的檢查（架構文件 9.1）。
// 資料庫的規則擋得住一般使用者，但公開金鑰在網頁裡，有人可以繞過畫面直接寫資料，
// 所以前端收到別人的訊息時也要再檢查一次：欄位型別、種類、文字長度、圖片路徑格式，
// 不合格就丟掉（回傳 null），不顯示。

import { CONFIG } from '../../config';
import type { Message } from '../../types';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** 資料庫 messages_nickname_length 的上限（比進入時的 12 字寬鬆，因為組合 emoji 兩邊算法不同） */
const NICKNAME_MAX_CHARS = 24;
const IMAGE_FILE = new RegExp(`^[0-9a-zA-Z_-]+\\.(${CONFIG.image.extensions.join('|')})$`, 'i');

/** 資料庫算的是字元數（一個 emoji 可能是兩個字元），這裡用同樣的算法 */
function charCount(value: string): number {
  return [...value].length;
}

export function parseMessage(row: unknown): Message | null {
  if (typeof row !== 'object' || row === null) return null;
  const data = row as Record<string, unknown>;

  const { id, user_id, nickname, kind, text, image_path, created_at } = data;
  if (typeof id !== 'string' || !UUID.test(id)) return null;
  if (typeof user_id !== 'string' || !UUID.test(user_id)) return null;
  if (typeof nickname !== 'string') return null;
  const nickChars = charCount(nickname.trim());
  if (nickChars < 1 || nickChars > NICKNAME_MAX_CHARS) return null;
  if (typeof created_at !== 'string' || Number.isNaN(Date.parse(created_at))) return null;

  if (kind === 'text') {
    if (typeof text !== 'string' || text.trim() === '') return null;
    if (charCount(text) > CONFIG.message.maxLength) return null;
    if (image_path !== null && image_path !== undefined) return null;
    return { id, user_id, nickname, kind: 'text', text, image_path: null, created_at };
  }

  if (kind === 'image') {
    if (text !== null && text !== undefined) return null;
    if (typeof image_path !== 'string') return null;
    // 圖片一定放在送出者自己的資料夾：<user_id>/<檔名>.<副檔名>
    const prefix = `${user_id.toLowerCase()}/`;
    if (!image_path.toLowerCase().startsWith(prefix)) return null;
    if (!IMAGE_FILE.test(image_path.slice(prefix.length))) return null;
    return { id, user_id, nickname, kind: 'image', text: null, image_path, created_at };
  }

  return null;
}
