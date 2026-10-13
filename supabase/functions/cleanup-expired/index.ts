// 每日清理：刪除超過 30 天的訊息與圖片。
// 部署方式：Supabase 網頁 → Edge Functions → Deploy a new function → Via Editor，
// 函式名稱填 cleanup-expired，把這個檔案的內容貼上，並把 Verify JWT 關掉。
// 由排程（pg_cron）每天呼叫一次，呼叫時要帶 x-cleanup-token，對得上才會執行。
//
// 需要的設定（都不寫在這個檔案裡）：
// - CLEANUP_TOKEN：自己設定的通關密語，在 Edge Functions → Secrets 新增。
// - SUPABASE_URL、管理金鑰：Supabase 會自動提供給執行中的函式，不需要另外複製。

import { createClient } from 'npm:@supabase/supabase-js@2';

const RETENTION_DAYS = 30;
const BUCKET = 'chat-images';
const BATCH_SIZE = 200;
const MAX_BATCHES = 25;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** 比對字串時不因為「哪個字元先不同」而洩漏資訊 */
function sameText(a: string, b: string): boolean {
  const left = new TextEncoder().encode(a);
  const right = new TextEncoder().encode(b);
  let diff = left.length ^ right.length;
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    diff |= (left[i] ?? 0) ^ (right[i] ?? 0);
  }
  return diff === 0;
}

/** 優先用新版的管理金鑰；沒有才退回舊版名稱 */
function adminKey(): string {
  const dictionary = Deno.env.get('SUPABASE_SECRET_KEYS');
  if (dictionary) {
    try {
      const keys = JSON.parse(dictionary) as Record<string, string>;
      const key = keys.default ?? Object.values(keys)[0];
      if (key) return key;
    } catch {
      // 格式不如預期，改用下面的舊名稱
    }
  }
  const legacy = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (legacy) return legacy;
  throw new Error('找不到管理金鑰');
}

Deno.serve(async (request) => {
  const expected = Deno.env.get('CLEANUP_TOKEN');
  const given = request.headers.get('x-cleanup-token');
  if (!expected || !given || !sameText(given, expected)) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, adminKey(), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString();

    // 1. 刪除過期的訊息
    const { count: deletedMessages, error: messageError } = await admin
      .from('messages')
      .delete({ count: 'exact' })
      .lt('created_at', cutoff);
    if (messageError) throw new Error(`刪除訊息失敗：${messageError.message}`);

    // 2. 刪除過期的圖片檔案（包含沒有對應訊息的殘留檔案）
    let removedImages = 0;
    for (let batch = 0; batch < MAX_BATCHES; batch++) {
      const { data, error } = await admin.rpc('expired_chat_images', { max_rows: BATCH_SIZE });
      if (error) throw new Error(`列出過期圖片失敗：${error.message}`);
      const names = ((data ?? []) as { name: string }[]).map((row) => row.name);
      if (names.length === 0) break;
      const { error: removeError } = await admin.storage.from(BUCKET).remove(names);
      if (removeError) throw new Error(`刪除圖片失敗：${removeError.message}`);
      removedImages += names.length;
    }

    return jsonResponse({ ok: true, deletedMessages, removedImages });
  } catch (error) {
    return jsonResponse({ ok: false, error: error instanceof Error ? error.message : String(error) }, 500);
  }
});
