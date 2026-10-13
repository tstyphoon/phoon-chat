import { defineConfig } from 'vitest/config';

// 連到真正的 Supabase 專案做整合測試：npm run test:live
// 會讀 .env.local 裡的專案網址與公開金鑰，過程中會建立並刪除幾則名為「連線測試」的訊息。
// 這些測試不會在 GitHub 部署時執行（那邊沒有 .env.local，也不該碰正式資料）。
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.live.{ts,tsx}'],
    testTimeout: 90_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
