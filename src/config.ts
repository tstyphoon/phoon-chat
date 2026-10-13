// 所有數字設定集中在這裡（架構文件 4.3 與第 11 段）。
// 想調整字數、次數、秒數、檔案大小，只要改這個檔案。

export const CONFIG = {
  nickname: {
    minLength: 1,
    maxLength: 12,
    // 容易冒充官方的字，比對時不分大小寫、忽略空白與底線
    reserved: ['系統', '管理員', '管理者', '客服', 'admin', 'administrator', 'system', 'moderator'],
  },
  message: {
    maxLength: 500,
    /** 兩則訊息之間至少要間隔多久（毫秒） */
    minIntervalMs: 1000,
    /** 單則訊息內，同一個詞最多可以重複幾次（超過就不能送） */
    maxRepeatInMessage: 10,
    /** 時間窗口內，相同內容最多可以送幾則（再送就擋） */
    maxSameContent: 5,
    sameContentWindowMs: 30_000,
  },
  image: {
    maxBytes: 5 * 1024 * 1024,
    mimeTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
  },
  history: {
    pageSize: 50,
    retentionDays: 30,
  },
  presence: {
    /** 別人離開的事件先等這麼久再顯示，短暫斷線不算離開 */
    leaveGraceMs: 10_000,
  },
  ui: {
    hintDurationMs: 4000,
    /** 同一人連續訊息，超過這個間隔就重新顯示代號與時間 */
    groupGapMs: 10 * 60 * 1000,
    /** 離底部多近算「在最底部」 */
    atBottomThresholdPx: 80,
  },
} as const;

export type BackendKind = 'mock' | 'supabase';

export function getBackendKind(): BackendKind {
  return import.meta.env.VITE_BACKEND === 'supabase' ? 'supabase' : 'mock';
}
