// localStorage 在無痕視窗、被封鎖時可能直接丟錯，所有讀寫都包起來，失敗就當作沒有。

export function readStorage(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // 忽略：這些只是方便使用者的記憶功能，沒存成也不影響聊天
  }
}

export const STORAGE_KEYS = {
  nickname: 'phoon-chat:nickname',
  theme: 'phoon-chat:theme',
  sound: 'phoon-chat:sound',
} as const;
