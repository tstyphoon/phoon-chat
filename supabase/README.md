# supabase/

階段二的資料庫與後端設定。**不使用 Supabase CLI**：下面的 SQL 與函式程式碼，都是在 Supabase 網頁上手動貼上並執行。

| 檔案 | 做什麼 | 在哪裡執行 |
|---|---|---|
| `migrations/20261013000001_messages.sql` | `messages` 資料表、安全規則（RLS）、寫入前的檢查（頻率、重複內容、代號、時間由伺服器填）、加入 Realtime | SQL Editor |
| `migrations/20261013000002_storage.sql` | 圖片櫃 `chat-images`（公開讀取、5 MB、只收四種圖片格式）與權限、清理用的 `expired_chat_images` 函式 | SQL Editor |
| `migrations/20261013000003_cleanup_schedule.sql` | 每天凌晨 3 點（台灣時間）自動呼叫清理函式的排程。**含兩個「填空」，見下方** | SQL Editor |
| `functions/cleanup-expired/index.ts` | 清理函式：刪除超過 30 天的訊息與圖片檔案 | Edge Functions → Deploy a new function → Via Editor |

SQL 檔案可以重複執行，不會重複建立。

## 從頭重建的順序

1. 建立 Supabase 專案，Authentication → Sign In / Providers 開啟 **Allow anonymous sign-ins**。
2. Database → Extensions 開啟 `pg_cron`、`pg_net`（`supabase_vault` 通常已內建）。
3. SQL Editor 依序執行 `…000001…`、`…000002…`。
4. Edge Functions 部署 `cleanup-expired/index.ts`，**關掉 Verify JWT**，到 Secrets 新增 `CLEANUP_TOKEN`（自己產生一串隨機的長字串）。
5. 記下函式的網址。用網頁編輯器部署時，Supabase 會自動取名（例如 `super-processor`），**部署後不能改**，以實際網址為準：`https://<專案代號>.supabase.co/functions/v1/<函式名稱>`。
6. 執行 `…000003…`，但先把檔案裡的兩個填空換掉：
   - `__CLEANUP_FUNCTION_URL__` → 上一步的函式網址
   - `__CLEANUP_TOKEN__` → 步驟 4 設定的同一串 `CLEANUP_TOKEN`
   - **替換後的版本含有通關密語，貼完就刪掉，絕對不要放進專案或 commit。**
7. 把專案網址與 Publishable key 放進 `.env.local`（本機）與 GitHub 的 Actions Variables（部署），見專案根目錄的 `.env.example`。

## 檢查有沒有設定好

```
npm run check:supabase   # 用公開金鑰實際送資料，檢查每一條規則有沒有擋住（29 項）
npm run test:live        # 用兩個匿名身分實際進入、收發訊息、傳圖片、刪除、離開（13 項）
```

兩個指令都會讀 `.env.local`，過程中會建立再刪除幾則測試訊息與圖片。

## 金鑰

- 前端只用 **專案網址** 與 **Publishable key**（`sb_publishable_` 開頭），兩個都是公開的。
- **Secret key**（`sb_secret_` 開頭）與 **資料庫密碼** 不會出現在專案的任何地方。清理函式需要的管理金鑰，由 Supabase 自動提供給執行中的函式。
