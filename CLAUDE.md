# phoon-chat

一個不用註冊登入的匿名聊天室，前端放 GitHub Pages，即時傳訊用 Supabase。

## 規則

- 開始任何工作前，先讀 `docs/architecture.md`（需求在 `docs/requirements.md`，畫面設計在 `docs/design.md`）。
- 目前在「階段二」：前端已接上 Supabase（`VITE_BACKEND=supabase`）；假後端（`VITE_BACKEND=mock`，`npm run dev:mock`）仍保留，給不需要網路的開發與一般測試使用。通訊只放在 `src/services/`，畫面與 `useChat` 不直接碰 Supabase。
- Supabase 的 SQL 與函式在 `supabase/`，不使用 Supabase CLI，是手動貼到網頁執行（見 `supabase/README.md`）。
- 不可以把金鑰檔案（`.env`、`.env.local` 等）commit 進 git；管理金鑰（Secret key）與資料庫密碼不可寫進專案任何檔案，也不要請使用者貼給你。只有 `.env.example`（假值）與 `.env.mock`（沒有金鑰）可以提交。前端只用專案網址與 Publishable key，這兩個是公開的。

## 常用指令

- `npm run dev`：本機預覽（用 `.env.local` 的設定，連真正的 Supabase），網址 http://127.0.0.1:5173/phoon-chat/
- `npm run dev:mock`：本機預覽，但用假後端
- `npm test`：規則測試與整個流程的整合測試（一律用假後端，不連網路）
- `npm run test:live`：連真正的 Supabase 做整合測試（會建立再刪除測試訊息）
- `npm run check:supabase`：用公開金鑰檢查資料庫與圖片櫃的規則有沒有擋住
- `npm run build`：型別檢查加打包，輸出到 `dist/`
