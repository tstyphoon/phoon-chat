// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import App from './App';

beforeAll(() => {
  // jsdom 沒有的瀏覽器功能，補上最簡單的版本
  Element.prototype.scrollTo = function scrollTo() {};
});

afterEach(cleanup);

describe('整個流程（階段一，假後端）', () => {
  it('輸入代號進入聊天室、送出訊息、刪除自己的訊息、離開', async () => {
    const user = userEvent.setup();
    render(<App />);

    // 進入畫面：沒輸入時不能按
    const enter = screen.getByRole('button', { name: '進入聊天室' });
    expect((enter as HTMLButtonElement).disabled).toBe(true);

    // 保留字會顯示原因
    await user.type(screen.getByLabelText('你的代號'), 'admin');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect((enter as HTMLButtonElement).disabled).toBe(true);

    // 換成正常代號
    await user.clear(screen.getByLabelText('你的代號'));
    await user.type(screen.getByLabelText('你的代號'), '小明');
    expect((enter as HTMLButtonElement).disabled).toBe(false);
    await user.click(enter);

    // 進入聊天室
    const box = await screen.findByLabelText('訊息內容', {}, { timeout: 3000 });
    expect(screen.getAllByText(/人在線/).length).toBeGreaterThan(0);
    // 假歷史有 130 則，所以一開始還有更早的訊息可以載入
    await waitFor(() => expect(screen.queryAllByText('載入最近的訊息…').length).toBe(0));
    expect(screen.queryAllByText('沒有更早的訊息了').length).toBe(0);

    // 送出訊息
    await user.type(box, '大家好');
    await user.click(screen.getByRole('button', { name: '送出' }));
    expect(await screen.findByText('大家好', {}, { timeout: 3000 })).toBeTruthy();

    // 刪除自己的訊息
    await user.click(await screen.findByRole('button', { name: '刪除這則訊息' }));
    await user.click(screen.getByRole('button', { name: '刪除' }));
    await waitFor(() => expect(screen.queryByText('大家好')).toBeNull());

    // 離開
    await user.click(screen.getAllByRole('button', { name: /^離開/ })[0]);
    expect(await screen.findByRole('button', { name: '進入聊天室' })).toBeTruthy();
  }, 20000);

  it('太快送第二則不會被丟掉：自動排隊，等間隔夠了就送出，HTML 字串原樣顯示成文字', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('你的代號'), 'Amy2');
    await user.click(screen.getByRole('button', { name: '進入聊天室' }));
    const box = await screen.findByLabelText('訊息內容', {}, { timeout: 3000 });
    const html = '<b>x</b><img src=x onerror=alert(1)>';

    await user.type(box, '第一則');
    await user.click(screen.getByRole('button', { name: '送出' }));
    // 馬上送第二則（不到 1 秒）：不會被擋，輸入框清空，自動排隊
    await user.type(box, html);
    await user.click(screen.getByRole('button', { name: '送出' }));
    expect((box as HTMLTextAreaElement).value).toBe('');
    expect(screen.queryByText('送太快了，請稍等一下')).toBeNull();

    // 兩則都會出現，而且 HTML 是文字，沒有變成真的標籤
    expect(await screen.findByText('第一則', {}, { timeout: 3000 })).toBeTruthy();
    expect(await screen.findByText(html, {}, { timeout: 5000 })).toBeTruthy();
    expect(document.querySelector('img[src="x"]')).toBeNull();
    expect(screen.queryByText('x', { selector: 'b' })).toBeNull();
    await waitFor(() => expect(screen.queryAllByText('傳送中…').length).toBe(0), { timeout: 5000 });
  }, 20000);

  it('連續狂按送出：最多排隊等 3 秒，再多就請使用者稍等，輸入內容保留', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('你的代號'), 'Amy3');
    await user.click(screen.getByRole('button', { name: '進入聊天室' }));
    const box = await screen.findByLabelText('訊息內容', {}, { timeout: 3000 });

    const words = ['甲訊息', '乙訊息', '丙訊息', '丁訊息', '戊訊息'];
    for (const word of words) {
      await user.type(box, word);
      await user.click(screen.getByRole('button', { name: '送出' }));
    }
    // 前面排得下的送出去了，排不下的會顯示提示，並保留輸入內容
    expect(await screen.findByText('送太快了，請稍等一下')).toBeTruthy();
    expect((box as HTMLTextAreaElement).value).not.toBe('');
  }, 20000);
});
