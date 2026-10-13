// 連到真正的 Supabase 專案，用兩個「人」（兩個各自獨立的匿名身分）測試後端。
// 執行：npm run test:live      需要 .env.local 裡的專案網址與公開金鑰。
// 過程中會建立、再刪除幾則名為「連線測試」的訊息與圖片。

import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';
import type { ChatEvents } from '../../types';
import { newId, sleep } from '../../utils/id';
import { SupabaseChatService } from './supabaseChatService';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
if (!url || !key) throw new Error('找不到 VITE_SUPABASE_URL 或 VITE_SUPABASE_PUBLISHABLE_KEY，請確認 .env.local');

function createService(): SupabaseChatService {
  const client = createClient(url as string, key as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return new SupabaseChatService(client);
}

/** 記錄某個事件收到的所有資料 */
function record<K extends keyof ChatEvents>(service: SupabaseChatService, event: K) {
  const items: ChatEvents[K][] = [];
  service.on(event, (payload) => items.push(payload));
  return items;
}

async function waitFor(condition: () => boolean, timeoutMs: number, what: string): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!condition()) {
    if (Date.now() > deadline) throw new Error(`等不到：${what}`);
    await sleep(100);
  }
}

const TINY_PNG = Uint8Array.from(
  atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='),
  (char) => char.charCodeAt(0),
);

const suffix = newId().slice(0, 4);
const nameA = `連線測試甲${suffix}`;
const nameB = `連線測試乙${suffix}`;

describe('Supabase 後端（真實連線）', () => {
  const a = createService();
  const b = createService();
  const aJoins = record(a, 'presence.join');
  const aUserLeft = record(a, 'user.left');
  const aNew = record(a, 'message.new');
  const bNew = record(b, 'message.new');
  const bDeleted = record(b, 'message.deleted');
  const aStatus = record(a, 'connection.status');
  const sentByA: string[] = [];

  afterAll(async () => {
    for (const id of sentByA) await a.deleteMessage(id);
    await a.leave();
    await b.leave();
  });

  it('A 可以進入聊天室，拿到隱形身分', async () => {
    const result = await a.join(nameA);
    expect(result.ok).toBe(true);
    expect(a.userId).not.toBe('');
    expect(aStatus.at(-1)).toBe('connected');
  });

  it('B 用大小寫不同的同一個代號進入，會被擋下', async () => {
    const result = await b.join(nameA.toUpperCase());
    expect(result).toMatchObject({ ok: false, reason: 'taken' });
  });

  it('保留字不能用', async () => {
    expect(await b.join('admin')).toMatchObject({ ok: false, reason: 'invalid' });
  });

  it('B 用另一個代號進入，A 收到「加入」', async () => {
    const result = await b.join(nameB);
    expect(result.ok).toBe(true);
    expect(a.userId).not.toBe(b.userId);
    await waitFor(() => aJoins.some((member) => member.nickname === nameB), 5000, 'A 收到 B 加入');
  });

  it('A 送出文字，B 收到；A 自己只收到一次', async () => {
    const id = newId();
    sentByA.push(id);
    expect(await a.sendText(id, '連線測試：你好')).toEqual({ ok: true });
    await waitFor(() => bNew.some((m) => m.id === id), 8000, 'B 收到訊息');
    await sleep(1500); // 再等一下，確認 Realtime 的重複通知沒有讓 A 收到第二次
    expect(aNew.filter((m) => m.id === id)).toHaveLength(1);
    const received = bNew.find((m) => m.id === id);
    expect(received).toMatchObject({ nickname: nameA, kind: 'text', text: '連線測試：你好', user_id: a.userId });
  });

  it('資料庫的規則被擋時，回傳看得懂的中文原因', async () => {
    await sleep(1100);
    const spam = await a.sendText(newId(), '你好'.repeat(11));
    expect(spam).toEqual({ ok: false, message: '請不要重複洗版' });

    // 被擋下的不會存進資料庫，所以要先成功送一則，緊接著的第二則才會被「太快」擋下
    await sleep(1100);
    const firstId = newId();
    sentByA.push(firstId);
    expect(await a.sendText(firstId, '連線測試：第一則')).toEqual({ ok: true });
    const tooFast = await a.sendText(newId(), '連線測試：緊接著第二則');
    expect(tooFast).toEqual({ ok: false, message: '送太快了，請稍等一下' });
  });

  it('重送同一個編號不會變成兩則', async () => {
    await sleep(1100);
    const id = newId();
    sentByA.push(id);
    expect(await a.sendText(id, '連線測試：重送')).toEqual({ ok: true });
    await sleep(1100);
    expect(await a.sendText(id, '連線測試：重送')).toEqual({ ok: true });
    await sleep(1000);
    expect(aNew.filter((m) => m.id === id)).toHaveLength(1);
  });

  it('可以讀到最近的訊息，而且往前載入不會重複', async () => {
    const page = await b.loadRecent();
    expect(page.messages.length).toBeGreaterThan(0);
    expect(page.messages.some((m) => m.text === '連線測試：你好')).toBe(true);
    const sorted = [...page.messages].sort((x, y) => (x.created_at < y.created_at ? -1 : 1));
    expect(page.messages.map((m) => m.id)).toEqual(sorted.map((m) => m.id));
    const older = await b.loadOlder(page.messages[0].created_at);
    const ids = new Set(page.messages.map((m) => m.id));
    expect(older.messages.every((m) => !ids.has(m.id))).toBe(true);
  });

  it('A 送圖片，B 收到，圖片網址不用登入就能打開', async () => {
    await sleep(1100);
    const id = newId();
    sentByA.push(id);
    const file = new File([TINY_PNG], 'tiny.png', { type: 'image/png' });
    expect(await a.sendImage(id, file)).toEqual({ ok: true });
    await waitFor(() => bNew.some((m) => m.id === id), 8000, 'B 收到圖片訊息');
    const message = bNew.find((m) => m.id === id);
    expect(message?.kind).toBe('image');
    expect(message?.image_path?.startsWith(`${a.userId}/`)).toBe(true);
    const response = await fetch(b.getImageUrl(message?.image_path ?? ''));
    expect(response.ok).toBe(true);
  });

  it('不是圖片或太大的檔案，在前端就被擋下', async () => {
    const pdf = new File([new Uint8Array(10)], 'a.pdf', { type: 'application/pdf' });
    expect(await a.sendImage(newId(), pdf)).toEqual({ ok: false, message: '只能傳 JPG、PNG、GIF、WebP' });
  });

  it('B 刪不掉 A 的訊息；A 刪除後 B 收到通知，圖片檔案也被刪掉', async () => {
    const imageMessage = bNew.find((m) => m.kind === 'image');
    expect(imageMessage).toBeDefined();
    const imageUrl = b.getImageUrl(imageMessage?.image_path ?? '');

    await b.deleteMessage(imageMessage?.id ?? '');
    await sleep(1000);
    expect((await fetch(imageUrl)).ok).toBe(true); // 還在

    await a.deleteMessage(imageMessage?.id ?? '');
    await waitFor(() => bDeleted.some((d) => d.id === imageMessage?.id), 8000, 'B 收到刪除通知');
    await sleep(1500);
    // 檔案本身已經被刪掉（換一個網址參數去要，伺服器就回找不到）。
    // 原本的網址會因為各地的快取（最多 5 分鐘）而暫時還能開，這裡不測那個。
    expect((await fetch(`${imageUrl}?check=${Date.now()}`)).ok).toBe(false);
  });

  it('B 按「離開」，A 立刻（3 秒內）收到', async () => {
    await b.leave();
    await waitFor(() => aUserLeft.some((left) => left.nickname === nameB), 3000, 'A 收到 B 離開');
  });

  it('B 離開後，同一個代號可以再被使用', async () => {
    const result = await b.join(nameB);
    expect(result.ok).toBe(true);
    await b.leave();
  });
});
