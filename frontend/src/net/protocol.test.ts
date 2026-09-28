import { describe, expect, it } from 'vitest';
import { CODE_ALPHABET, CODE_LENGTH, genCode, normalizeRoomCode, roomCodeError } from './protocol';

describe('normalizeRoomCode（入力・貼り付け → 部屋コード）', () => {
  const tests: Record<string, { args: { raw: string }; expected: { want: string } }> = {
    'success: そのままのコード': { args: { raw: 'YYHG2' }, expected: { want: 'YYHG2' } },
    'success: 小文字は大文字にする': { args: { raw: 'yyhg2' }, expected: { want: 'YYHG2' } },
    'success: 前後・途中の空白や改行を除く': { args: { raw: ' yy hg2\n' }, expected: { want: 'YYHG2' } },
    'success: 全角英数字は半角にする': { args: { raw: 'ｙｙｈｇ２' }, expected: { want: 'YYHG2' } },
    'success: 全角大文字も半角にする': { args: { raw: 'ＹＹＨＧ２' }, expected: { want: 'YYHG2' } },
    'success: 「部屋コード：」付きで貼り付け': { args: { raw: '部屋コード：YYHG2' }, expected: { want: 'YYHG2' } },
    'success: 招待リンクを貼り付け': { args: { raw: 'https://tm550120.github.io/mofuru-gym/?room=WDHE5' }, expected: { want: 'WDHE5' } },
    'success: 共有メッセージ全体を貼り付け': {
      args: { raw: 'モフルジムで対戦しよう！ 部屋コード：WDHE5 https://tm550120.github.io/mofuru-gym/?room=WDHE5' },
      expected: { want: 'WDHE5' },
    },
    'success: 前のコードのあとに新しいコードを打つと、新しいコードになる': { args: { raw: 'YYHG2WDHE5' }, expected: { want: 'WDHE5' } },
    'success: 前のコードのあとに1文字打った途中': { args: { raw: 'YYHG2W' }, expected: { want: 'YHG2W' } },
    'success: 5文字未満はそのまま': { args: { raw: 'abc' }, expected: { want: 'ABC' } },
    'success: 空文字': { args: { raw: '' }, expected: { want: '' } },
    'success: 日本語だけなら空': { args: { raw: 'ぶへや' }, expected: { want: '' } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(normalizeRoomCode(tt.args.raw)).toBe(tt.expected.want); });
  }
});

describe('roomCodeError（部屋コードの検証）', () => {
  const tests: Record<string, { args: { code: string }; expected: { wantErr: boolean; msg?: RegExp } }> = {
    'success: 正しいコード': { args: { code: 'YYHG2' }, expected: { wantErr: false } },
    'failed: 5文字未満': { args: { code: 'YYHG' }, expected: { wantErr: true, msg: /5文字/ } },
    'failed: 空': { args: { code: '' }, expected: { wantErr: true, msg: /5文字/ } },
    'failed: O（オー）を含む': { args: { code: 'YOHG2' }, expected: { wantErr: true, msg: /I・O・0・1/ } },
    'failed: 0（ゼロ）を含む': { args: { code: 'Y0HG2' }, expected: { wantErr: true, msg: /I・O・0・1/ } },
    'failed: I と 1 を含む': { args: { code: 'YIH12' }, expected: { wantErr: true, msg: /I・O・0・1/ } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const err = roomCodeError(tt.args.code);
      if (!tt.expected.wantErr) { expect(err).toBeNull(); return; }
      expect(err).not.toBeNull();
      expect(err).toMatch(tt.expected.msg as RegExp);
    });
  }
});

describe('genCode（部屋コードの生成）', () => {
  it('success: 生成したコードは整えても変わらず、検証も通る', () => {
    let x = 0; const rng = (): number => { x = (x + 0.137) % 1; return x; };
    for (let i = 0; i < 50; i++) {
      const c = genCode(rng);
      expect(c).toHaveLength(CODE_LENGTH);
      expect([...c].every(ch => CODE_ALPHABET.includes(ch))).toBe(true);
      expect(normalizeRoomCode(c)).toBe(c);
      expect(roomCodeError(c)).toBeNull();
    }
  });
});
