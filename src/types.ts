// 資料格式（架構文件第 5 段「通訊約定」）。
// 階段一的假後端與階段二的 Supabase 後端，都必須吐出一模一樣的格式。

export type MessageKind = 'text' | 'image';

/** 一則訊息。會被存進資料庫，也是歷史訊息的來源。 */
export interface Message {
  /** 由送出的瀏覽器先產生的 UUID，重送時沿用同一個，才不會變成兩則 */
  id: string;
  /** 送出者的隱形身分編號，畫面用它判斷「是不是我的訊息」 */
  user_id: string;
  /** 送出當下的代號 */
  nickname: string;
  kind: MessageKind;
  /** 文字內容，最多 500 字；圖片訊息為 null */
  text: string | null;
  /** 圖片在儲存空間裡的路徑；文字訊息為 null */
  image_path: string | null;
  /** 伺服器收到的時間（ISO 格式），不是瀏覽器填的 */
  created_at: string;
}

/** 目前在線的一位成員 */
export interface PresenceMember {
  /** 這次進入聊天室的編號，每次進入都重新產生 */
  session_id: string;
  user_id: string;
  nickname: string;
  /** 加入時間，兩人同時搶同一個代號時用來判定誰先到 */
  joined_at: string;
}

export type ConnectionStatus = 'connected' | 'reconnecting' | 'disconnected';

/** 事件名稱與各自帶的資料 */
export interface ChatEvents {
  'message.new': Message;
  'message.deleted': { id: string };
  'presence.sync': PresenceMember[];
  'presence.join': PresenceMember;
  'presence.leave': PresenceMember;
  'user.left': { session_id: string; nickname: string };
  'connection.status': ConnectionStatus;
  /** 進入後才發現代號被別人先搶走，要回到輸入畫面 */
  'session.kicked': { reason: 'nickname_taken' };
}

export type JoinResult =
  | { ok: true; me: PresenceMember }
  | { ok: false; reason: 'taken' | 'invalid' | 'connection'; message: string };

export type SendResult = { ok: true } | { ok: false; message: string };

export interface HistoryPage {
  /** 由舊到新排序 */
  messages: Message[];
  /** 是否還有更早的訊息 */
  hasMore: boolean;
}

/** 只存在畫面上、不存進資料庫的系統提示 */
export interface Notice {
  id: string;
  type: 'joined' | 'left';
  nickname: string;
  /** 畫面收到事件的時間（毫秒） */
  at: number;
}

/** 已送出但還沒收到伺服器確認的自己的訊息 */
export interface PendingMessage {
  id: string;
  kind: MessageKind;
  user_id: string;
  nickname: string;
  text: string | null;
  /** 圖片訊息：原始檔案，重送時要用 */
  file: File | null;
  /** 圖片訊息：本機預覽網址 */
  previewUrl: string | null;
  status: 'sending' | 'failed';
  /** 本機建立的時間（毫秒），僅用於排序 */
  created: number;
}
