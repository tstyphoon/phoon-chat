-- phoon-chat 資料庫設定 2／3：圖片櫃 chat-images
-- 在 Supabase 網頁的 SQL Editor 貼上並執行（不使用 Supabase CLI）。可重複執行，不會壞掉。

-- ============ 圖片櫃 ============
-- 公開讀取（網頁用網址直接顯示圖片）、單檔 5 MB、只收四種圖片格式（不收 SVG）
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-images',
  'chat-images',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- ============ 誰能對圖片做什麼 ============
-- 檔案路徑的第一層資料夾必須是自己的身分編號，例如 <我的編號>/<圖片編號>.png
drop policy if exists "chat-images: users upload into their own folder" on storage.objects;
create policy "chat-images: users upload into their own folder"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "chat-images: users read their own folder" on storage.objects;
create policy "chat-images: users read their own folder"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "chat-images: users delete their own images" on storage.objects;
create policy "chat-images: users delete their own images"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'chat-images'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- 沒有 update 的規則：不能覆蓋別人（或自己）已上傳的圖片。

-- ============ 給清理程式用：列出超過 30 天的圖片 ============
-- 只有管理身分（service_role，也就是清理程式）能呼叫，一般使用者不行。
create or replace function public.expired_chat_images(max_rows int default 200)
returns table (name text)
language sql
security definer
set search_path = ''
as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'chat-images'
    and o.created_at < now() - interval '30 days'
  order by o.created_at
  limit max_rows;
$$;

revoke all on function public.expired_chat_images(int) from public, anon, authenticated;
grant execute on function public.expired_chat_images(int) to service_role;
