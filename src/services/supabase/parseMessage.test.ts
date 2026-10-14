import { describe, expect, it } from 'vitest';
import { parseMessage } from './parseMessage';

const USER = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const AT = '2026-10-14T12:00:00.123456+00:00';

const text = (extra: Record<string, unknown> = {}) => ({
  id: ID,
  user_id: USER,
  nickname: 'Amy',
  kind: 'text',
  text: '你好',
  image_path: null,
  created_at: AT,
  ...extra,
});

const image = (extra: Record<string, unknown> = {}) => ({
  id: ID,
  user_id: USER,
  nickname: 'Amy',
  kind: 'image',
  text: null,
  image_path: `${USER}/${ID}.png`,
  created_at: AT,
  ...extra,
});

describe('parseMessage：合格的訊息', () => {
  it('文字訊息原樣通過，created_at 維持資料庫給的字串', () => {
    expect(parseMessage(text())).toEqual(text());
  });

  it('圖片訊息原樣通過', () => {
    expect(parseMessage(image())).toEqual(image());
  });

  it('文字剛好 500 字可以，emoji 以字元計算', () => {
    expect(parseMessage(text({ text: 'a'.repeat(500) }))).not.toBeNull();
    expect(parseMessage(text({ text: '😀'.repeat(500) }))).not.toBeNull();
  });
});

describe('parseMessage：不合格就回傳 null', () => {
  it.each([
    ['不是物件', null],
    ['字串', 'hello'],
    ['id 不是 uuid', text({ id: 'abc' })],
    ['id 不是字串', text({ id: 123 })],
    ['user_id 不是 uuid', text({ user_id: 'abc' })],
    ['代號不是字串', text({ nickname: 42 })],
    ['代號是空白', text({ nickname: '   ' })],
    ['代號超過 24 字', text({ nickname: 'a'.repeat(25) })],
    ['種類不是 text 或 image', text({ kind: 'video' })],
    ['沒有種類', text({ kind: undefined })],
    ['時間格式錯誤', text({ created_at: 'yesterday' })],
    ['時間不是字串', text({ created_at: 1700000000000 })],
    ['文字訊息沒有文字', text({ text: null })],
    ['文字訊息只有空白', text({ text: '  \n ' })],
    ['文字訊息的文字不是字串', text({ text: { html: '<b>x</b>' } })],
    ['文字超過 500 字', text({ text: 'a'.repeat(501) })],
    ['文字訊息還帶著圖片路徑', text({ image_path: `${USER}/${ID}.png` })],
    ['圖片訊息還帶著文字', image({ text: '多出來的字' })],
    ['圖片訊息沒有路徑', image({ image_path: null })],
    ['圖片路徑不是字串', image({ image_path: 5 })],
    ['圖片路徑不在送出者的資料夾', image({ image_path: `99999999-9999-4999-8999-999999999999/${ID}.png` })],
    ['圖片路徑沒有資料夾', image({ image_path: `${ID}.png` })],
    ['圖片路徑用 .. 跳出資料夾', image({ image_path: `${USER}/../x.png` })],
    ['圖片路徑多一層資料夾', image({ image_path: `${USER}/a/${ID}.png` })],
    ['圖片副檔名是 svg', image({ image_path: `${USER}/${ID}.svg` })],
    ['圖片副檔名是 html', image({ image_path: `${USER}/${ID}.html` })],
  ])('%s', (_name, row) => {
    expect(parseMessage(row)).toBeNull();
  });
});
