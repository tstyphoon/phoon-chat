import { createClient } from '@supabase/supabase-js';
import type { ChatService } from '../chatService';
import { SupabaseChatService } from './supabaseChatService';

/**
 * 用環境變數裡的「專案網址」與「公開金鑰」建立 Supabase 後端。
 * 這兩個值本來就是公開的（會被打包進網頁）；管理金鑰與資料庫密碼絕對不會出現在這裡。
 * 本機放在 .env.local（不會上傳），部署時由 GitHub 的 Actions Variables 提供。
 */
export function createSupabaseChatService(): ChatService {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      '缺少 Supabase 設定。本機請在 .env.local、部署請在 GitHub 的 Variables 設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_PUBLISHABLE_KEY。',
    );
  }
  const client = createClient(url, key, {
    // 匿名身分存在這個瀏覽器裡，下次打開沿用同一個，才刪得掉自己以前的訊息
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return new SupabaseChatService(client);
}

export { SupabaseChatService } from './supabaseChatService';
