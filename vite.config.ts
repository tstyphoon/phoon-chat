import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// GitHub Pages 的網址是 https://<帳號>.github.io/phoon-chat/，
// 網頁檔案都在 /phoon-chat/ 這個子路徑底下，所以 base 要設成這個值。
// 開發時也用同一個路徑，才能提早發現路徑寫錯的問題。
export default defineConfig({
  base: '/phoon-chat/',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
