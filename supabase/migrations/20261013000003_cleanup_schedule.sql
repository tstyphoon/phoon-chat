-- phoon-chat 資料庫設定 3／3：每天自動清理的排程
-- 在 Supabase 網頁的 SQL Editor 貼上並執行（不使用 Supabase CLI）。可重複執行。
--
-- 這個檔案裡的 __CLEANUP_FUNCTION_URL__ 與 __CLEANUP_TOKEN__ 是「填空」，不是真正的值。
-- __CLEANUP_FUNCTION_URL__ 是清理函式部署後的完整網址，格式：
--   https://<專案代號>.supabase.co/functions/v1/<函式的 slug>
-- 注意：用網頁編輯器部署時，函式的 slug 是 Supabase 自動取的（目前是 super-processor），
-- 部署後不能改，所以排程要用實際的網址，不能假設叫 cleanup-expired。
-- 真正的通關密語不能放進專案：執行前由我在你的電腦上產生、替換後放進你的剪貼簿，
-- 替換後的版本只存在剪貼簿與暫存資料夾，不會 commit。
--
-- 事前要先做的事：
-- 1. Supabase 網頁 → Database → Extensions，開啟 pg_cron、pg_net、supabase_vault。
-- 2. 已部署清理用的 Edge Function（程式碼在 supabase/functions/cleanup-expired/index.ts），
--    關掉它的 Verify JWT，並在 Edge Functions → Secrets 設定同一個 CLEANUP_TOKEN。

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception '請先到 Database → Extensions 開啟 pg_cron';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception '請先到 Database → Extensions 開啟 pg_net';
  end if;
  if not exists (select 1 from pg_extension where extname = 'supabase_vault') then
    raise exception '請先到 Database → Extensions 開啟 supabase_vault';
  end if;
end
$$;

-- 把網址與通關密語存進 Vault（加密保管處），排程執行時再取出來用
do $$
declare
  existing uuid;
begin
  select id into existing from vault.secrets where name = 'phoon_cleanup_url';
  if existing is null then
    perform vault.create_secret('__CLEANUP_FUNCTION_URL__', 'phoon_cleanup_url');
  else
    perform vault.update_secret(existing, '__CLEANUP_FUNCTION_URL__', 'phoon_cleanup_url');
  end if;

  select id into existing from vault.secrets where name = 'phoon_cleanup_token';
  if existing is null then
    perform vault.create_secret('__CLEANUP_TOKEN__', 'phoon_cleanup_token');
  else
    perform vault.update_secret(existing, '__CLEANUP_TOKEN__', 'phoon_cleanup_token');
  end if;
end
$$;

-- 每天 UTC 19:00（台灣時間凌晨 3:00）呼叫清理程式。已存在同名排程就先移除再建立。
do $$
begin
  if exists (select 1 from cron.job where jobname = 'phoon-cleanup-expired') then
    perform cron.unschedule('phoon-cleanup-expired');
  end if;
end
$$;

select cron.schedule(
  'phoon-cleanup-expired',
  '0 19 * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'phoon_cleanup_url'),
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cleanup-token', (select decrypted_secret from vault.decrypted_secrets where name = 'phoon_cleanup_token')
    ),
    body := '{}'::jsonb
  );
  $job$
);
