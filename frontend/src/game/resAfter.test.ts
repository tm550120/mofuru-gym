import { describe, expect, it } from 'vitest';
import { resAfter } from './rules';
import type { Bundle, Resources } from './types';

describe('resAfter（交換したあとの手札の枚数）', () => {
  const hand: Resources = { wood: 3, brick: 1, sheep: 0, wheat: 4, ore: 2 };
  const tests: Record<string, { args: { res: Resources; give: Bundle | null; get: Bundle | null }; expected: { want: Resources } }> = {
    'success: プレイヤーとの交換（出す・もらうが複数）': {
      args: { res: hand, give: { wood: 2, ore: 1 }, get: { sheep: 1, brick: 2 } },
      expected: { want: { wood: 1, brick: 3, sheep: 1, wheat: 4, ore: 1 } },
    },
    'success: 銀行との交換（4枚出して1枚もらう）': {
      args: { res: hand, give: { wheat: 4 }, get: { ore: 1 } },
      expected: { want: { wood: 3, brick: 1, sheep: 0, wheat: 0, ore: 3 } },
    },
    'success: 何も選んでいなければ今の手札のまま': {
      args: { res: hand, give: {}, get: null },
      expected: { want: hand },
    },
    'success: 足りないときは負の数になる（足りない印に使う）': {
      args: { res: hand, give: { sheep: 2 }, get: { wood: 1 } },
      expected: { want: { wood: 4, brick: 1, sheep: -2, wheat: 4, ore: 2 } },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const before = { ...tt.args.res };
      expect(resAfter(tt.args.res, tt.args.give, tt.args.get)).toEqual(tt.expected.want);
      expect(tt.args.res).toEqual(before); // 元の手札は書き換えない
    });
  }
});
