// 檢查 Supabase 的資料庫與圖片櫃有沒有照架構文件第 9 段設定好（驗證清單 13.2「資料庫端的保護」）。
// 用公開金鑰、以匿名身分實際送資料，所以測的是「別人也能做到的事」。
//
// 執行：  npm run check:supabase
// 需要：  .env.local 裡有 VITE_SUPABASE_URL 與 VITE_SUPABASE_PUBLISHABLE_KEY
//
// 測試過程中會建立、再刪除幾則名為「檢查員」的訊息與圖片。

import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

const url = process.env.VITE_SUPABASE_URL;
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) {
  console.error('找不到 VITE_SUPABASE_URL 或 VITE_SUPABASE_PUBLISHABLE_KEY，請確認 .env.local');
  process.exit(1);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const results = [];

function record(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? '通過' : '失敗'}  ${name}${detail ? `  （${detail}）` : ''}`);
}

/** 預期這個動作被擋下，而且錯誤訊息要含指定文字 */
function expectBlocked(name, error, expected) {
  const message = error?.message ?? '';
  const ok = Boolean(error) && (!expected || message.includes(expected) || error.code === expected);
  record(name, ok, error ? message : '沒有被擋下');
}

async function newUser() {
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInAnonymously();
  if (error) throw new Error(`匿名登入失敗：${error.message}`);
  return { client, id: data.user.id };
}

function insertText(user, text, extra = {}) {
  return user.client
    .from('messages')
    .insert({ id: randomUUID(), nickname: '檢查員', kind: 'text', text, ...extra });
}

// 1x1 的 PNG 圖片
const TINY_PNG = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    'base64',
  ),
);

const varied = (length) => Array.from({ length }, (_, i) => String.fromCharCode(0x4e00 + i)).join('');

async function main() {
  console.log(`檢查專案：${url}\n`);
  const a = await newUser();
  const b = await newUser();
  record('匿名登入（不需註冊）', Boolean(a.id && b.id));

  // ---------- 訊息 ----------
  console.log('\n[訊息規則]');
  const firstId = randomUUID();
  const first = await a.client
    .from('messages')
    .insert({ id: firstId, nickname: '檢查員', kind: 'text', text: '第一則測試訊息', created_at: '2000-01-01T00:00:00Z' })
    .select()
    .single();
  record('正常訊息可以送出', !first.error, first.error?.message);
  if (first.data) {
    record(
      '送出時間由伺服器填入（瀏覽器送來的 2000 年被忽略）',
      new Date(first.data.created_at).getFullYear() >= 2026,
      first.data.created_at,
    );
  }
  const seenByB = await b.client.from('messages').select('id').eq('id', firstId);
  record('其他人看得到這則訊息', !seenByB.error && seenByB.data?.length === 1, seenByB.error?.message);

  const tooFast = await insertText(a, '太快的第二則');
  expectBlocked('一秒內連送第二則被擋', tooFast.error, 'phoon:rate_limited');
  await sleep(1100);

  const forged = await b.client
    .from('messages')
    .insert({ id: randomUUID(), user_id: a.id, nickname: '假冒者', kind: 'text', text: '我假冒 A' });
  expectBlocked('冒用別人的身分寫入被擋', forged.error);
  await sleep(1100);

  expectBlocked('超過 500 字被擋', (await insertText(b, varied(501))).error);
  await sleep(1100);
  const exactly500 = await insertText(b, varied(500));
  record('剛好 500 字可以送', !exactly500.error, exactly500.error?.message);
  await sleep(1100);

  expectBlocked('單則內同一段字重複 11 次被擋', (await insertText(b, '你好'.repeat(11))).error, 'phoon:repeat_in_message');
  await sleep(1100);
  const ten = await insertText(b, '你好'.repeat(10));
  record('單則內剛好重複 10 次可以送', !ten.error, ten.error?.message);
  await sleep(1100);
  expectBlocked(
    '用空白隔開的同一個詞出現 11 次被擋',
    (await insertText(b, Array(11).fill('hello').join(' '))).error,
    'phoon:repeat_in_message',
  );
  await sleep(1100);

  expectBlocked('保留字 admin 被擋', (await insertText(b, '保留字測試', { nickname: 'admin' })).error, 'phoon:reserved_nickname');
  await sleep(1100);
  expectBlocked('全形的ＡＤＭＩＮ也被擋', (await insertText(b, '保留字測試', { nickname: 'ＡＤＭＩＮ' })).error, 'phoon:reserved_nickname');
  await sleep(1100);
  expectBlocked('代號含看不見的字元被擋', (await insertText(b, '隱形字元測試', { nickname: 'a​b' })).error, 'phoon:invalid_nickname');
  await sleep(1100);

  console.log('\n[相同內容 30 秒內最多 5 則]（要等約 6 秒）');
  let allFiveOk = true;
  for (let i = 1; i <= 5; i++) {
    const sent = await insertText(a, '相同內容測試');
    if (sent.error) allFiveOk = false;
    await sleep(1000);
  }
  record('相同內容前 5 則可以送', allFiveOk);
  expectBlocked('第 6 則被擋', (await insertText(a, '相同內容測試')).error, 'phoon:repeat_content');
  await sleep(1100);

  console.log('\n[刪除]');
  const othersDelete = await b.client.from('messages').delete().eq('id', firstId).select();
  record('不能刪別人的訊息', !othersDelete.error && othersDelete.data?.length === 0, othersDelete.error?.message);
  const ownDelete = await a.client.from('messages').delete().eq('id', firstId).select();
  record('可以刪自己的訊息', !ownDelete.error && ownDelete.data?.length === 1, ownDelete.error?.message);

  // ---------- 圖片 ----------
  console.log('\n[圖片櫃]');
  const bucket = a.client.storage.from('chat-images');
  const ownPath = `${a.id}/${randomUUID()}.png`;
  const upload = await bucket.upload(ownPath, TINY_PNG, { contentType: 'image/png' });
  record('可以上傳圖片到自己的資料夾', !upload.error, upload.error?.message);

  const publicUrl = bucket.getPublicUrl(ownPath).data.publicUrl;
  const fetched = await fetch(publicUrl);
  record('圖片網址不需登入就能打開', fetched.ok, `HTTP ${fetched.status}`);

  const intoOthers = await b.client.storage
    .from('chat-images')
    .upload(`${a.id}/${randomUUID()}.png`, TINY_PNG, { contentType: 'image/png' });
  expectBlocked('不能上傳到別人的資料夾', intoOthers.error);

  const notImage = await bucket.upload(`${a.id}/${randomUUID()}.txt`, new TextEncoder().encode('hello'), {
    contentType: 'text/plain',
  });
  expectBlocked('不能上傳非圖片格式', notImage.error);

  const svg = await bucket.upload(`${a.id}/${randomUUID()}.svg`, new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>'), {
    contentType: 'image/svg+xml',
  });
  expectBlocked('不能上傳 SVG', svg.error);

  const big = await bucket.upload(`${a.id}/${randomUUID()}.png`, new Uint8Array(5 * 1024 * 1024 + 1024), {
    contentType: 'image/png',
  });
  expectBlocked('超過 5 MB 被擋', big.error);

  const imageOk = await a.client
    .from('messages')
    .insert({ id: randomUUID(), nickname: '檢查員', kind: 'image', image_path: ownPath });
  record('圖片訊息（指向自己的圖片）可以送出', !imageOk.error, imageOk.error?.message);
  await sleep(1100);
  const imageBad = await a.client
    .from('messages')
    .insert({ id: randomUUID(), nickname: '檢查員', kind: 'image', image_path: `${b.id}/x.png` });
  expectBlocked('圖片訊息指向別人的資料夾被擋', imageBad.error, 'phoon:invalid_image_path');

  const othersRemove = await b.client.storage.from('chat-images').remove([ownPath]);
  const stillThere = await fetch(publicUrl);
  record('不能刪別人的圖片', !othersRemove.error ? stillThere.ok : true, `刪除後仍可打開：${stillThere.ok}`);

  // ---------- Realtime ----------
  console.log('\n[即時通知（Realtime）]');
  let received = null;
  const channel = b.client
    .channel(`check-${randomUUID()}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      received = payload.new;
    });
  const subscribed = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve('逾時'), 8000);
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        clearTimeout(timer);
        resolve(status);
      }
    });
  });
  record('可以訂閱訊息的即時通知', subscribed === 'SUBSCRIBED', subscribed);
  if (subscribed === 'SUBSCRIBED') {
    // 剛訂閱成功時，伺服器還要一點時間才會開始轉送，等久一點再送
    await sleep(2000);
    const liveId = randomUUID();
    const live = await a.client
      .from('messages')
      .insert({ id: liveId, nickname: '檢查員', kind: 'text', text: '即時通知測試' });
    for (let i = 0; i < 40 && !received; i++) await sleep(250);
    record(
      '另一個人送出後，這邊在 10 秒內收到通知',
      received?.id === liveId,
      live.error ? `送出失敗：${live.error.message}` : received ? '' : '送出成功但沒收到通知',
    );
  }
  await b.client.removeChannel(channel);

  // ---------- 清理 ----------
  await a.client.storage.from('chat-images').remove([ownPath]);
  await a.client.from('messages').delete().eq('user_id', a.id);
  await b.client.from('messages').delete().eq('user_id', b.id);
  console.log('\n已刪除測試用的訊息與圖片。');
}

try {
  await main();
} catch (error) {
  console.error(`\n檢查中斷：${error.message}`);
  record('檢查流程', false, error.message);
}

const failed = results.filter((r) => !r.ok);
console.log(`\n共 ${results.length} 項，通過 ${results.length - failed.length} 項，失敗 ${failed.length} 項。`);
process.exit(failed.length === 0 ? 0 : 1);
