import { describe, expect, it } from 'vitest';
import { validateNickname, nicknameKey, countChars } from './nickname';
import { hasExcessiveRepeat, SendGuard } from './message';
import { validateImage } from './image';

describe('代號規則', () => {
  it('空白不行，前後空白會被去掉', () => {
    expect(validateNickname('   ').ok).toBe(false);
    expect(validateNickname('  阿福  ')).toEqual({ ok: true, nickname: '阿福' });
  });

  it('1 到 12 個字', () => {
    expect(validateNickname('一二三四五六七八九十甲乙').ok).toBe(true);
    expect(validateNickname('一二三四五六七八九十甲乙丙').ok).toBe(false);
  });

  it('emoji 算一個字', () => {
    expect(countChars('🐱🐱🐱')).toBe(3);
    expect(validateNickname('🐱貓貓').ok).toBe(true);
  });

  it('字數算法和資料庫一樣：組合 emoji 由好幾個字元組成，會算成好幾個', () => {
    const family = '👨‍👩‍👧‍👦';
    expect(countChars(family)).toBe(7);
    // 一個家庭 emoji（7）可以，兩個（14）超過 12 字，不會再通過前端卻被資料庫（24 字元）拒絕
    expect(validateNickname(family).ok).toBe(true);
    expect(validateNickname(family.repeat(2)).ok).toBe(false);
    expect(validateNickname(family.repeat(4)).ok).toBe(false);
  });

  it('保留字不能用，不分大小寫', () => {
    for (const word of ['系統', '管理員', 'admin', 'ADMIN', 'Admin ', 'System']) {
      expect(validateNickname(word).ok).toBe(false);
    }
  });

  it('大小寫視為同一個代號', () => {
    expect(nicknameKey('Amy')).toBe(nicknameKey('amy'));
  });

  it('不能含看不見的控制字元', () => {
    expect(validateNickname('a​b').ok).toBe(false);
    expect(validateNickname('a\nb').ok).toBe(false);
  });
});

describe('重複內容檢測', () => {
  it('單則內同一個詞剛好 10 次可以，11 次不行', () => {
    expect(hasExcessiveRepeat('你好'.repeat(10))).toBe(false);
    expect(hasExcessiveRepeat('你好'.repeat(11))).toBe(true);
  });

  it('用空白隔開的同一個詞也算', () => {
    expect(hasExcessiveRepeat(Array(10).fill('hello').join(' '))).toBe(false);
    expect(hasExcessiveRepeat(Array(11).fill('hello').join(' '))).toBe(true);
  });

  it('正常句子不會被誤判', () => {
    expect(hasExcessiveRepeat('今天下雨好大，大家有帶傘嗎？')).toBe(false);
    expect(hasExcessiveRepeat('哈哈哈哈哈')).toBe(false);
  });
});

describe('發送限制', () => {
  it('空白與超過 500 字不能送', () => {
    const guard = new SendGuard();
    expect(guard.check('   ').ok).toBe(false);
    // 用不重複的字，避免被「重複內容」規則先擋下
    const varied = (length: number) =>
      Array.from({ length }, (_, i) => String.fromCharCode(0x4e00 + i)).join('');
    expect(guard.check(varied(500)).ok).toBe(true);
    expect(guard.check(varied(501)).ok).toBe(false);
  });

  it('一秒內連續送會被擋', () => {
    const guard = new SendGuard();
    guard.record('a', 10_000);
    const early = guard.check('b', 10_500);
    expect(early.ok).toBe(false);
    expect(guard.check('b', 11_000).ok).toBe(true);
  });

  it('算得出還要等多久才能送下一則，排定的送出時間也算數', () => {
    const guard = new SendGuard();
    expect(guard.waitMs(10_000)).toBe(0);
    guard.record('a', 10_000);
    expect(guard.waitMs(10_300)).toBe(700);
    expect(guard.waitMs(11_000)).toBe(0);
    // 排好在 11_000 送出的第二則，第三則要再等到 12_000
    guard.record('b', 11_000);
    expect(guard.waitMs(10_400)).toBe(1_600);
    // 先送的不會被後來的往前拉：lastSentAt 不會倒退
    guard.record('c', 10_200);
    expect(guard.waitMs(10_400)).toBe(1_600);
  });

  it('排隊送出時可以略過「太快」的檢查，其他規則（空白、太長、重複）照樣擋', () => {
    const guard = new SendGuard();
    guard.record('a', 10_000);
    expect(guard.check('b', 10_100).ok).toBe(false);
    expect(guard.check('b', 11_000, { ignoreRate: true }).ok).toBe(true);
    expect(guard.check('b', 10_100, { ignoreRate: true }).ok).toBe(true);
    expect(guard.check('   ', 10_100, { ignoreRate: true }).ok).toBe(false);
    expect(guard.check('你好'.repeat(11), 10_100, { ignoreRate: true }).ok).toBe(false);
  });

  it('30 秒內相同內容：第 5 則可以送，第 6 則被擋', () => {
    const guard = new SendGuard();
    let now = 1_000_000;
    for (let i = 1; i <= 5; i++) {
      expect(guard.check('你好', now).ok).toBe(true);
      guard.record('你好', now);
      now += 1_500;
    }
    const sixth = guard.check('你好', now);
    expect(sixth.ok).toBe(false);
    // 超過 30 秒窗口後又可以送
    expect(guard.check('你好', now + 31_000).ok).toBe(true);
  });
});

describe('圖片規則', () => {
  const MB = 1024 * 1024;
  it('接受四種圖片格式', () => {
    expect(validateImage({ name: 'a.jpg', type: 'image/jpeg', size: MB }).ok).toBe(true);
    expect(validateImage({ name: 'a.png', type: 'image/png', size: MB }).ok).toBe(true);
    expect(validateImage({ name: 'a.gif', type: 'image/gif', size: MB }).ok).toBe(true);
    expect(validateImage({ name: 'a.webp', type: 'image/webp', size: MB }).ok).toBe(true);
  });

  it('貼上的截圖沒有檔名也可以', () => {
    expect(validateImage({ name: 'image', type: 'image/png', size: MB }).ok).toBe(true);
  });

  it('PDF、SVG 不行', () => {
    expect(validateImage({ name: 'a.pdf', type: 'application/pdf', size: MB }).ok).toBe(false);
    expect(validateImage({ name: 'a.svg', type: 'image/svg+xml', size: 1000 }).ok).toBe(false);
  });

  it('副檔名偽裝也擋', () => {
    expect(validateImage({ name: 'a.png', type: 'text/html', size: 1000 }).ok).toBe(false);
    expect(validateImage({ name: 'a.exe', type: 'image/png', size: 1000 }).ok).toBe(false);
  });

  it('5 MB 剛好可以，超過不行', () => {
    expect(validateImage({ name: 'a.png', type: 'image/png', size: 5 * MB }).ok).toBe(true);
    expect(validateImage({ name: 'a.png', type: 'image/png', size: 5 * MB + 1 }).ok).toBe(false);
  });
});
