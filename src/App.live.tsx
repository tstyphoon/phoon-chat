// @vitest-environment jsdom
// 整個畫面接上真正的 Supabase：進入、送訊息、刪除、離開。
// 執行：npm run test:live（需要 .env.local，VITE_BACKEND 要是 supabase）

import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WebSocket from 'ws';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import App from './App';
import { getBackendKind } from './config';
import { newId } from './utils/id';

beforeAll(() => {
  // jsdom 沒有的瀏覽器功能，補上最簡單的版本
  Element.prototype.scrollTo = function scrollTo() {};
  // 模擬瀏覽器（jsdom）的事件類別和 Node 內建的 WebSocket 不相容（真正的瀏覽器沒這個問題），
  // 測試裡改用專門給 Node 用的 ws。
  (globalThis as unknown as { WebSocket: unknown }).WebSocket = WebSocket;
});

afterEach(cleanup);

describe('畫面接上 Supabase', () => {
  it('使用的是 Supabase 後端', () => {
    expect(getBackendKind()).toBe('supabase');
  });

  it('進入、送出訊息、刪除、離開', async () => {
    const user = userEvent.setup();
    const nickname = `畫面測試${newId().slice(0, 4)}`;
    const body = `連線測試畫面${newId().slice(0, 6)}`;
    render(<App />);

    await user.type(screen.getByLabelText('你的代號'), nickname);
    await user.click(screen.getByRole('button', { name: '進入聊天室' }));

    const box = await screen.findByLabelText('訊息內容', {}, { timeout: 20000 });
    await waitFor(() => expect(screen.queryAllByText('載入最近的訊息…').length).toBe(0), { timeout: 10000 });
    expect(screen.getAllByText(/1 人在線/).length).toBeGreaterThan(0);

    await user.type(box, body);
    await user.click(screen.getByRole('button', { name: '送出' }));
    expect(await screen.findByText(body, {}, { timeout: 10000 })).toBeTruthy();
    await waitFor(() => expect(screen.queryAllByText('傳送中…').length).toBe(0), { timeout: 10000 });

    // 刪除自己的訊息
    await user.click(await screen.findByRole('button', { name: '刪除這則訊息' }));
    await user.click(screen.getByRole('button', { name: '刪除' }));
    await waitFor(() => expect(screen.queryByText(body)).toBeNull(), { timeout: 10000 });

    // 離開，回到輸入代號的畫面，而且代號已經記住
    await user.click(screen.getAllByRole('button', { name: /^離開/ })[0]);
    expect(await screen.findByRole('button', { name: '進入聊天室' })).toBeTruthy();
    expect((screen.getByLabelText('你的代號') as HTMLInputElement).value).toBe(nickname);
  }, 90000);

  it('連續很快送兩則：自動排隊，兩則都送達（資料庫的頻率限制不會擋），HTML 原樣顯示成文字', async () => {
    const user = userEvent.setup();
    const nickname = `畫面測試${newId().slice(0, 4)}`;
    const first = `連續測試甲${newId().slice(0, 6)}`;
    const html = `<b>x</b><img src=x onerror=alert(1)>${newId().slice(0, 4)}`;
    render(<App />);

    // 輸入框會預先填入上一個測試記住的代號，先清掉再輸入
    await user.clear(screen.getByLabelText('你的代號'));
    await user.type(screen.getByLabelText('你的代號'), nickname);
    await user.click(screen.getByRole('button', { name: '進入聊天室' }));
    const box = await screen.findByLabelText('訊息內容', {}, { timeout: 20000 });
    await waitFor(() => expect(screen.queryAllByText('載入最近的訊息…').length).toBe(0), { timeout: 10000 });

    await user.type(box, first);
    await user.click(screen.getByRole('button', { name: '送出' }));
    await user.type(box, html);
    await user.click(screen.getByRole('button', { name: '送出' }));

    expect(await screen.findByText(first, {}, { timeout: 10000 })).toBeTruthy();
    expect(await screen.findByText(html, {}, { timeout: 10000 })).toBeTruthy();
    await waitFor(() => expect(screen.queryAllByText('傳送中…').length).toBe(0), { timeout: 10000 });
    expect(screen.queryAllByText(/未送出/).length).toBe(0);
    expect(document.querySelector('img[src="x"]')).toBeNull();

    // 清掉測試訊息
    for (const text of [html, first]) {
      const line = screen.getByText(text).closest('.line') as HTMLElement;
      const remove = line.querySelector('button[aria-label="刪除這則訊息"]') as HTMLElement;
      await user.click(remove);
      await user.click(screen.getByRole('button', { name: '刪除' }));
      await waitFor(() => expect(screen.queryByText(text)).toBeNull(), { timeout: 10000 });
    }

    await user.click(screen.getAllByRole('button', { name: /^離開/ })[0]);
    expect(await screen.findByRole('button', { name: '進入聊天室' })).toBeTruthy();
  }, 90000);
});
