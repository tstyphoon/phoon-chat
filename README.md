# phoon-chat

不用註冊、不用登入的匿名聊天室。前端放在 GitHub Pages，即時傳訊用 Supabase。

- 需求：[docs/requirements.md](docs/requirements.md)
- 架構：[docs/architecture.md](docs/architecture.md)
- 畫面設計：[docs/design.md](docs/design.md)

## 目前進度：階段二

前端已接上 Supabase，是真正的多人即時聊天室（手機、電腦看到同一個聊天室）。訊息與圖片保留 30 天。
資料庫與清理排程的設定在 [supabase/](supabase/)，不使用 Supabase CLI。

## 在自己的電腦上跑

```
npm install
```

1. 複製 `.env.example` 成 `.env.local`，填入 Supabase 的專案網址與 Publishable key（兩個都是公開的值）。
2. 執行：

```
npm run dev          # 連真正的 Supabase
npm run dev:mock     # 用假後端（機器人、同一個瀏覽器的分頁互聊），不需要網路與 Supabase
```

打開 http://127.0.0.1:5173/phoon-chat/ 。

其他指令：`npm test`（測試）、`npm run test:live`（連真正的 Supabase 測試）、`npm run check:supabase`（檢查資料庫規則）、`npm run build`（打包）、`npm run preview`（預覽打包結果）。

## 測試用的小工具（假後端才有）

用 `npm run dev:mock` 開啟，網址後面加 `?debug`（例如 `http://127.0.0.1:5173/phoon-chat/?debug`），進入聊天室後左下角會出現「模擬斷線」「恢復連線」「讓機器人說話」三顆按鈕。連真正的 Supabase 時沒有這些，要測斷線請用瀏覽器開發者工具把網路切到離線。

## 部署

推送到 `main`，GitHub Actions 會自動測試、打包並發布到 GitHub Pages（Settings → Pages 的 Source 要是 **GitHub Actions**）。
打包時的設定來自 repo 的 Actions Variables：`VITE_BACKEND`、`VITE_SUPABASE_URL`、`VITE_SUPABASE_PUBLISHABLE_KEY`，都是公開的值。
