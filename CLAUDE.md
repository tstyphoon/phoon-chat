# phoon-chat

一個不用註冊登入的匿名聊天室，前端放 GitHub Pages，即時傳訊用 Supabase。

## 規則

- 開始任何工作前，先讀 `docs/architecture.md`（需求在 `docs/requirements.md`）。
- 目前在「階段一」：只做前端，後端用假的（`VITE_BACKEND=mock`），先不接 Supabase。
- 不可以把金鑰檔案（`.env`、`.env.local` 等）commit 進 git；管理金鑰與資料庫密碼不可寫進專案任何檔案。只有 `.env.example`（假值）可以提交。
