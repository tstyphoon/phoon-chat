# phoon-chat

一個不用註冊登入的匿名聊天室，前端放 GitHub Pages，即時傳訊用 Supabase。

## 規則

- 開始任何工作前，先讀 `docs/architecture.md`（需求在 `docs/requirements.md`，畫面設計在 `docs/design.md`）。
- 目前在「階段一」：前端已完成，後端用假的（`VITE_BACKEND=mock`），還沒接 Supabase。階段二只換掉 `src/services/` 裡的通訊部分，畫面與 `useChat` 不改。
- 不可以把金鑰檔案（`.env`、`.env.local` 等）commit 進 git；管理金鑰與資料庫密碼不可寫進專案任何檔案。只有 `.env.example`（假值）可以提交。

## 常用指令

- `npm run dev`：本機預覽，網址 http://127.0.0.1:5173/phoon-chat/
- `npm test`：規則測試與整個流程的整合測試
- `npm run build`：型別檢查加打包，輸出到 `dist/`
