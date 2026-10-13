import { CONFIG } from '../config';

export type NicknameCheck = { ok: true; nickname: string } | { ok: false; message: string };

/** 算「看起來幾個字」，一個 emoji 算一個字 */
export function countChars(text: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new Intl.Segmenter('zh-Hant', { granularity: 'grapheme' });
    return Array.from(segmenter.segment(text)).length;
  }
  return Array.from(text).length;
}

/** 比對代號是否相同用的鍵：大小寫與全形半形視為相同 */
export function nicknameKey(nickname: string): string {
  return nickname.normalize('NFKC').trim().toLowerCase();
}

// 控制字元、隱形字元等（emoji 組合用的連接符與樣式選擇符除外）
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Cs}\p{Co}\p{Zl}\p{Zp}]/u;

function isReserved(nickname: string): boolean {
  const key = nicknameKey(nickname).replace(/[\s_-]+/g, '');
  return CONFIG.nickname.reserved.some((word) => word === key);
}

/** 檢查使用者輸入的代號是否合規（不含「有沒有人在用」，那要問後端） */
export function validateNickname(raw: string): NicknameCheck {
  const nickname = raw.trim();
  if (nickname.length === 0) {
    return { ok: false, message: '請輸入代號' };
  }
  if (INVISIBLE.test(nickname.replace(/[‍️]/g, ''))) {
    return { ok: false, message: '代號不能包含看不見的特殊字元' };
  }
  if (countChars(nickname) > CONFIG.nickname.maxLength) {
    return { ok: false, message: `代號最多 ${CONFIG.nickname.maxLength} 個字` };
  }
  if (isReserved(nickname)) {
    return { ok: false, message: '這個代號不能使用，請換一個' };
  }
  return { ok: true, nickname };
}
