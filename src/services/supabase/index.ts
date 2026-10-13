// 階段二才會實作：用 Supabase 提供真正的多人即時聊天。
// 這個檔案現在只是佔位，用來固定資料夾結構（架構文件第 11 段）。
// 實作時要符合 ../chatService.ts 的 ChatService 介面，其餘畫面程式不需要改。

import type { ChatService } from '../chatService';

export function createSupabaseChatService(): ChatService {
  throw new Error('Supabase 後端要到階段二才會接上。現在請使用 VITE_BACKEND=mock。');
}
