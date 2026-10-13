-- phoon-chat 資料庫設定 1／3：訊息資料表、安全規則、洗版檢查
-- 在 Supabase 網頁的 SQL Editor 貼上並執行（不使用 Supabase CLI）。可重複執行，不會壞掉。
-- 規則的數字要和 src/config.ts 保持一致。

-- ============ 資料表 ============
create table if not exists public.messages (
  id          uuid primary key,                         -- 由送出的瀏覽器先產生，重送不會變兩則
  user_id     uuid not null default auth.uid(),         -- 匿名登入發的隱形身分
  nickname    text not null,
  kind        text not null,
  text        text,
  image_path  text,
  created_at  timestamptz not null default now(),       -- 下面的觸發器會強制改成伺服器時間
  constraint messages_kind_check check (kind in ('text', 'image')),
  constraint messages_content_check check (
    (kind = 'text'  and text is not null and btrim(text) <> '' and image_path is null) or
    (kind = 'image' and image_path is not null and text is null)
  ),
  constraint messages_text_length check (text is null or char_length(text) <= 500),
  constraint messages_nickname_length check (char_length(btrim(nickname)) between 1 and 24)
);

create index if not exists messages_created_at_idx on public.messages (created_at desc, id desc);
create index if not exists messages_user_created_idx on public.messages (user_id, created_at desc);

-- ============ 權限與 RLS（誰能對哪幾筆資料做什麼）============
alter table public.messages enable row level security;

revoke all on public.messages from anon;
grant select, insert, delete on public.messages to authenticated;

drop policy if exists "signed-in users can read recent messages" on public.messages;
create policy "signed-in users can read recent messages"
  on public.messages for select to authenticated
  using (created_at > now() - interval '30 days');

drop policy if exists "users can insert their own messages" on public.messages;
create policy "users can insert their own messages"
  on public.messages for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists "users can delete their own messages" on public.messages;
create policy "users can delete their own messages"
  on public.messages for delete to authenticated
  using (user_id = (select auth.uid()));

-- 沒有 update 的規則：訊息送出後不能修改。

-- ============ 寫入前的檢查（觸發器）============
-- 前端也會檢查，但公開金鑰在網頁裡，有人可以繞過畫面直接送資料，所以這裡要再檢查一次。
-- 失敗時丟出以 phoon: 開頭的錯誤代碼，前端會對應成中文提示。
create or replace function public.messages_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  nick_key   text;
  body_key   text;
  same_count int;
begin
  -- 時間一律由伺服器填入，不信任瀏覽器送來的
  new.created_at := now();
  new.nickname := btrim(new.nickname);

  -- 代號：不能含看不見的控制字元
  if new.nickname ~ '[\u0001-\u001f\u007f-\u009f​‌‎‏ -‮⁠-⁯﻿]' then
    raise exception 'phoon:invalid_nickname';
  end if;

  -- 代號：不能是容易冒充官方的保留字（不分大小寫、全形半形，忽略空白與底線）
  nick_key := lower(regexp_replace(normalize(new.nickname, NFKC), '[\s_-]+', '', 'g'));
  if nick_key = any (array['系統', '管理員', '管理者', '客服', 'admin', 'administrator', 'system', 'moderator']) then
    raise exception 'phoon:reserved_nickname';
  end if;

  -- 每個身分每 0.8 秒最多一則（規格是每秒 1 則，留一點網路延遲的空間，避免誤擋）
  if exists (
    select 1 from public.messages m
    where m.user_id = new.user_id and m.created_at > now() - interval '800 milliseconds'
  ) then
    raise exception 'phoon:rate_limited';
  end if;

  if new.kind = 'image' then
    -- 圖片只能指向自己的資料夾
    if new.image_path not like new.user_id::text || '/%' then
      raise exception 'phoon:invalid_image_path';
    end if;
  else
    -- 單則內，同一段字連續重複超過 10 次（例如「你好」連續 11 次）
    if new.text ~ '(\S.{0,19}?)\1{10,}' then
      raise exception 'phoon:repeat_in_message';
    end if;

    -- 單則內，用空白或標點隔開的同一個詞出現超過 10 次
    if exists (
      select 1
      from regexp_split_to_table(lower(new.text), '[\s,，、。.!！?？;；:：~～]+') as t(token)
      where token <> ''
      group by token
      having count(*) > 10
    ) then
      raise exception 'phoon:repeat_in_message';
    end if;

    -- 30 秒內已經送過 5 次相同內容，第 6 則起不能送
    body_key := lower(regexp_replace(btrim(new.text), '\s+', ' ', 'g'));
    select count(*) into same_count
    from public.messages m
    where m.user_id = new.user_id
      and m.kind = 'text'
      and m.created_at > now() - interval '30 seconds'
      and lower(regexp_replace(btrim(m.text), '\s+', ' ', 'g')) = body_key;
    if same_count >= 5 then
      raise exception 'phoon:repeat_content';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists messages_before_insert on public.messages;
create trigger messages_before_insert
  before insert on public.messages
  for each row execute function public.messages_before_insert();

-- ============ Realtime：新增、刪除時通知所有連線中的人 ============
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end
$$;
