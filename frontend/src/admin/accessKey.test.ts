import { describe, expect, it } from 'vitest';
import { checkAccessKey, sha256Hex } from './accessKey';

describe('checkAccessKey（管理ページのアクセスキー）', () => {
  const tests: Record<string, { args: { input: string }; expected: { want: boolean } }> = {
    'success: 正しいキーで開く': { args: { input: '111111' }, expected: { want: true } },
    'success: 前後の空白は無視する': { args: { input: ' 111111 ' }, expected: { want: true } },
    'success: 違うキーでは開かない': { args: { input: '123456' }, expected: { want: false } },
    'success: 桁が足りないキーでは開かない': { args: { input: '11111' }, expected: { want: false } },
    'success: 空では開かない': { args: { input: '' }, expected: { want: false } },
    'success: 空白だけでは開かない': { args: { input: '   ' }, expected: { want: false } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, async () => { expect(await checkAccessKey(tt.args.input)).toBe(tt.expected.want); });
  }
});

describe('sha256Hex', () => {
  it('success: 既知の値のハッシュ', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
});
