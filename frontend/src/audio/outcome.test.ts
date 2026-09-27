import { describe, expect, it } from 'vitest';
import { battleSound, type BattleSound } from './outcome';

describe('battleSound（バトル結果 → 効果音）', () => {
  type args = { b: { a: number; d: number; win: number }; me: number };
  type expected = { want: BattleSound };
  const tests: Record<string, { args: args; expected: expected }> = {
    'success: 挑戦者の自分が勝つと勝ちジングル': { args: { b: { a: 0, d: 1, win: 0 }, me: 0 }, expected: { want: 'win' } },
    'success: 挑戦者の自分が負けると負けの音': { args: { b: { a: 0, d: 1, win: 1 }, me: 0 }, expected: { want: 'lose' } },
    'success: ジム側の自分が守り切ると勝ちジングル': { args: { b: { a: 2, d: 0, win: 0 }, me: 0 }, expected: { want: 'win' } },
    'success: ジム側の自分が負けると負けの音': { args: { b: { a: 2, d: 0, win: 2 }, me: 0 }, expected: { want: 'lose' } },
    'success: 自分が関わらないバトルは観戦の音': { args: { b: { a: 1, d: 2, win: 1 }, me: 0 }, expected: { want: 'watch' } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(battleSound(tt.args.b, tt.args.me)).toBe(tt.expected.want); });
  }
});
