// 把 Supabase 回傳的錯誤，翻成使用者看得懂的中文。
// 資料庫的檢查規則（supabase/migrations/…_messages.sql）失敗時，錯誤訊息會以 phoon: 開頭。

interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
  statusCode?: string | number;
}

function asErrorLike(error: unknown): ErrorLike {
  if (typeof error === 'object' && error !== null) return error as ErrorLike;
  return { message: String(error) };
}

const NETWORK_PATTERN = /failed to fetch|network|fetch failed|load failed|timeout|timed out|offline/i;

/** 這個錯誤是不是「連不上」（而不是被伺服器明確拒絕） */
export function isNetworkError(error: unknown): boolean {
  const { message = '', status } = asErrorLike(error);
  if (status === 0) return true;
  return NETWORK_PATTERN.test(message);
}

/** 這個錯誤是不是伺服器明確拒絕（規則沒過、沒有權限），重送也不會成功 */
export function isRejection(error: unknown): boolean {
  const { message = '', code = '' } = asErrorLike(error);
  return message.includes('phoon:') || code === '42501' || code === '23514' || /row-level security/i.test(message);
}

/** 送出訊息或圖片失敗的原因 */
export function describeSendError(error: unknown): string {
  const { message = '', code = '' } = asErrorLike(error);

  if (message.includes('phoon:rate_limited')) return '送太快了，請稍等一下';
  if (message.includes('phoon:repeat_in_message') || message.includes('phoon:repeat_content')) {
    return '請不要重複洗版';
  }
  if (message.includes('phoon:reserved_nickname') || message.includes('phoon:invalid_nickname')) {
    return '這個代號不能使用，請離開後換一個';
  }
  if (message.includes('phoon:invalid_image_path')) return '圖片沒有送出，請再試一次';
  if (code === '23514' && message.includes('text_length')) return '訊息最多 500 個字';

  if (/exceeded the maximum allowed size/i.test(message)) return '圖片超過 5 MB';
  if (/mime type/i.test(message)) return '只能傳 JPG、PNG、GIF、WebP';

  if (isNetworkError(error)) return '連線有問題，訊息沒有送出';
  if (code === '42501' || /row-level security|jwt|unauthorized/i.test(message)) {
    return '沒有權限送出，請重新整理頁面後再試';
  }
  return '訊息沒有送出，請稍後再試';
}

/** 進入聊天室時連不上的原因 */
export function describeJoinError(error: unknown): string {
  const { status } = asErrorLike(error);
  if (status === 429) return '現在太多人同時進入，請過一分鐘再試一次';
  if (isNetworkError(error)) return '連不上聊天室，請檢查網路後再試一次';
  return '暫時無法進入聊天室，請稍後再試一次';
}
