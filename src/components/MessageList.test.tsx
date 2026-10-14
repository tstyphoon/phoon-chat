// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { Message } from '../types';
import { MessageList } from './MessageList';

beforeAll(() => {
  Element.prototype.scrollTo = function scrollTo() {};
});

afterEach(cleanup);

const ME = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

function message(n: number, user_id: string, nickname: string, minute: number): Message {
  return {
    id: `00000000-0000-4000-8000-00000000000${n}`,
    user_id,
    nickname,
    kind: 'text',
    text: `第${n}則`,
    image_path: null,
    created_at: new Date(Date.UTC(2026, 9, 14, 12, minute, 0)).toISOString(),
  };
}

function renderList(messages: Message[]) {
  return render(
    <MessageList
      messages={messages}
      pending={[]}
      notices={[]}
      userId={ME}
      loadingInitial={false}
      loadingOlder={false}
      hasMore={false}
      onLoadOlder={() => {}}
      getImageUrl={(path) => path}
      onOpenImage={() => {}}
      onDelete={() => {}}
      onRetry={() => {}}
    />,
  );
}

describe('訊息分組', () => {
  it('同一個人、同一個代號的連續訊息合併，只顯示一次代號', () => {
    renderList([message(1, ME, '小明', 0), message(2, ME, '小明', 1), message(3, ME, '小明', 2)]);
    expect(screen.getAllByText('小明').length).toBe(1);
  });

  it('同一個身分換了代號，要另起一組並顯示新代號（不會掛在舊代號底下）', () => {
    renderList([message(1, ME, '你', 0), message(2, ME, '你', 1), message(3, ME, '123', 2), message(4, ME, '123', 3)]);
    expect(screen.getAllByText('你').length).toBe(1);
    expect(screen.getAllByText('123').length).toBe(1);
  });

  it('不同的人即使代號一樣，也各自成一組', () => {
    renderList([message(1, ME, '小明', 0), message(2, OTHER, '小明', 1)]);
    expect(screen.getAllByText('小明').length).toBe(2);
  });

  it('間隔超過 10 分鐘，同一個人也重新顯示代號', () => {
    renderList([message(1, ME, '小明', 0), message(2, ME, '小明', 20)]);
    expect(screen.getAllByText('小明').length).toBe(2);
  });
});
