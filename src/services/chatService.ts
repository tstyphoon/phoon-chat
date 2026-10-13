// 「聊天服務介面」：畫面和後端之間唯一的約定（架構文件 4.3）。
// 畫面只認得這份約定，不知道後面是假後端還是 Supabase。
// 階段二只要新增一個符合這份約定的實作，並在 services/index.ts 切換即可。

import type { ChatEvents, HistoryPage, JoinResult, SendResult } from '../types';

export type Unsubscribe = () => void;

/** 只有假後端提供，用來在沒有真實網路的情況下測試斷線等情境 */
export interface DebugControls {
  /** 模擬斷線 */
  disconnect(): void;
  /** 模擬恢復連線，並補上斷線期間錯過的訊息 */
  reconnect(): void;
  /** 讓機器人立刻說一句話 */
  botSpeak(): void;
}

export interface ChatService {
  /** 自己的隱形身分編號（階段二是 Supabase 匿名登入發的） */
  readonly userId: string;

  /** 進入聊天室。代號已被使用、連不上等情況會回傳失敗原因 */
  join(nickname: string): Promise<JoinResult>;
  /** 主動離開：其他人會立刻看到離開提示 */
  leave(): Promise<void>;

  /** 送出文字。id 由呼叫端先產生，重送時沿用同一個 */
  sendText(id: string, text: string): Promise<SendResult>;
  sendImage(id: string, file: File): Promise<SendResult>;
  /** 刪除自己送出的訊息 */
  deleteMessage(id: string): Promise<void>;

  /** 最近的一頁訊息 */
  loadRecent(): Promise<HistoryPage>;
  /** 比 before（訊息的 created_at）更早的一頁訊息 */
  loadOlder(before: string): Promise<HistoryPage>;
  /** 圖片路徑換成瀏覽器可以顯示的網址 */
  getImageUrl(path: string): string;

  on<K extends keyof ChatEvents>(event: K, handler: (payload: ChatEvents[K]) => void): Unsubscribe;

  readonly debug?: DebugControls;
}
