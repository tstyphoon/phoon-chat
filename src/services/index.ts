import { getBackendKind } from '../config';
import type { ChatService } from './chatService';
import { MockChatService } from './mock/mockChatService';
import { createSupabaseChatService } from './supabase';

export type { ChatService } from './chatService';

let instance: ChatService | null = null;

/** 依照 VITE_BACKEND 取得後端。整個網頁只會有一個後端實例。 */
export function getChatService(): ChatService {
  if (!instance) {
    instance = getBackendKind() === 'supabase' ? createSupabaseChatService() : new MockChatService();
  }
  return instance;
}
