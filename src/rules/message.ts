import { CONFIG } from '../config';
import { countChars } from './nickname';

export type TextCheck =
  | { ok: true }
  | {
      ok: false;
      code: 'empty' | 'too_long' | 'too_fast' | 'repeat_in_message' | 'repeat_content';
      message: string;
    };

/** 單則訊息裡，同一個詞是不是重複太多次（超過上限才算，剛好等於上限可以送） */
export function hasExcessiveRepeat(text: string, limit: number = CONFIG.message.maxRepeatInMessage): boolean {
  // 情況一：一段字連續重複，例如「你好你好你好…」。單位長度 1 到 20 個字。
  const consecutive = new RegExp(`(.{1,20}?)\\1{${limit},}`, 'gsu');
  for (const match of text.matchAll(consecutive)) {
    if (match[1].trim() !== '') return true;
  }
  // 情況二：用空白或標點隔開的同一個詞出現太多次，例如「你好 你好 你好 …」
  const counts = new Map<string, number>();
  for (const token of text.split(/[\s,，、。.!！?？;；:：~～]+/u)) {
    if (token === '') continue;
    const key = token.toLowerCase();
    const next = (counts.get(key) ?? 0) + 1;
    if (next > limit) return true;
    counts.set(key, next);
  }
  return false;
}

function contentKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * 送出文字前的檢查，並記住自己最近送過什麼。
 * 前端用它來提醒使用者；階段二資料庫會用同樣的規則再檢查一次。
 */
export class SendGuard {
  private lastSentAt = 0;
  private recent: { key: string; at: number }[] = [];

  /** 距離可以送出下一則，還要等幾毫秒（0 表示現在就可以送） */
  waitMs(now: number = Date.now()): number {
    return Math.max(0, this.lastSentAt + CONFIG.message.minIntervalMs - now);
  }

  /** `ignoreRate`：不檢查「距離上一則太近」（呼叫的人會自己等到間隔夠了才送出） */
  check(text: string, now: number = Date.now(), options: { ignoreRate?: boolean } = {}): TextCheck {
    const trimmed = text.trim();
    if (trimmed === '') {
      return { ok: false, code: 'empty', message: '請輸入訊息' };
    }
    if (countChars(trimmed) > CONFIG.message.maxLength) {
      return { ok: false, code: 'too_long', message: `訊息最多 ${CONFIG.message.maxLength} 個字` };
    }
    if (!options.ignoreRate && now - this.lastSentAt < CONFIG.message.minIntervalMs) {
      return { ok: false, code: 'too_fast', message: '送太快了，請稍等一下' };
    }
    if (hasExcessiveRepeat(trimmed)) {
      return { ok: false, code: 'repeat_in_message', message: '請不要重複洗版' };
    }
    const key = contentKey(trimmed);
    const sameCount = this.recent.filter(
      (item) => item.key === key && now - item.at <= CONFIG.message.sameContentWindowMs,
    ).length;
    if (sameCount >= CONFIG.message.maxSameContent) {
      return { ok: false, code: 'repeat_content', message: '請不要重複洗版' };
    }
    return { ok: true };
  }

  /** 訊息送出（或排好送出時間）之後呼叫，用來計算頻率與重複；`now` 可以是排定要送出的時間 */
  record(text: string, now: number = Date.now()): void {
    this.lastSentAt = Math.max(this.lastSentAt, now);
    this.recent = this.recent.filter((item) => now - item.at <= CONFIG.message.sameContentWindowMs);
    this.recent.push({ key: contentKey(text), at: now });
  }

  /** 圖片也算一次發送，用於頻率限制 */
  recordAny(now: number = Date.now()): void {
    this.lastSentAt = Math.max(this.lastSentAt, now);
  }

  checkRate(now: number = Date.now()): TextCheck {
    if (now - this.lastSentAt < CONFIG.message.minIntervalMs) {
      return { ok: false, code: 'too_fast', message: '送太快了，請稍等一下' };
    }
    return { ok: true };
  }
}
