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

  it('太快送第二則會被擋並顯示提示', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('你的代號'), 'Amy2');
    await user.click(screen.getByRole('button', { name: '進入聊天室' }));
    const box = await screen.findByLabelText('訊息內容', {}, { timeout: 3000 });

    await user.type(box, '第一則');
    await user.click(screen.getByRole('button', { name: '送出' }));
    await user.type(box, '第二則');
    await user.click(screen.getByRole('button', { name: '送出' }));
    expect(await screen.findByText('送太快了，請稍等一下')).toBeTruthy();
  }, 20000);
});
