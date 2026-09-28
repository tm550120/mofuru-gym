import { describe, expect, it } from 'vitest';
import { GUEST_SAVE_TTL_MS, isUsableGuestSave, type GuestSave } from './save';

describe('isUsableGuestSave（「オンライン対戦に戻る」に使えるか）', () => {
  const now = 1_800_000_000_000;
  const base: GuestSave = { code: 'YYHG2', token: 'tok', name: 'ゲスト', seat: 1, at: now - 1000 };
  const tests: Record<string, { args: { s: GuestSave | null }; expected: { want: boolean } }> = {
    'success: 保存したばかりなら使える': { args: { s: base }, expected: { want: true } },
    'success: 期限の直前なら使える': { args: { s: { ...base, at: now - GUEST_SAVE_TTL_MS + 1 } }, expected: { want: true } },
    'success: 期限を過ぎたら使わない': { args: { s: { ...base, at: now - GUEST_SAVE_TTL_MS } }, expected: { want: false } },
    'success: 保存なし': { args: { s: null }, expected: { want: false } },
    'success: コードが空なら使わない': { args: { s: { ...base, code: '' } }, expected: { want: false } },
    'success: トークンが空なら使わない': { args: { s: { ...base, token: '' } }, expected: { want: false } },
    'success: 保存時刻が無い古い形式は使わない': { args: { s: { ...base, at: undefined as unknown as number } }, expected: { want: false } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(isUsableGuestSave(tt.args.s, now)).toBe(tt.expected.want); });
  }
});
