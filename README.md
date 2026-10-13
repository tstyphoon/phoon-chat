# phoon-chat

不用註冊、不用登入的匿名聊天室。前端放在 GitHub Pages，即時傳訊預計用 Supabase。

- 需求：[docs/requirements.md](docs/requirements.md)
- 架構：[docs/architecture.md](docs/architecture.md)
- 畫面設計：[docs/design.md](docs/design.md)

## 目前進度：階段一

前端已完成，後端是瀏覽器裡的「假後端」（機器人使用者、同一個瀏覽器的分頁之間互相聊天）。還沒接 Supabase。

## 在自己的電腦上跑

```
npm install
npm run dev
```

打開 http://127.0.0.1:5173/phoon-chat/ 。

其他指令：`npm test`（測試）、`npm run build`（打包）、`npm run preview`（預覽打包結果）。

## 測試用的小工具

網址後面加 `?debug`（例如 `http://127.0.0.1:5173/phoon-chat/?debug`），進入聊天室後左下角會出現「模擬斷線」「恢復連線」「讓機器人說話」三顆按鈕。只有示範版有。

## 部署

推送到 `main`，GitHub Actions 會自動測試、打包並發布到 GitHub Pages。第一次要到 repo 的 Settings → Pages，把 Source 選成 **GitHub Actions**。
