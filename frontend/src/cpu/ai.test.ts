import { describe, expect, it } from 'vitest';
import { mainPhaseGame, seqRng, setRes } from '../game/testHelpers';
import type { Mon } from '../game/types';
import { aiAct, aiPickType, pickBattleTarget } from './ai';

describe('pickBattleTarget', () => {
  const tests: Record<string, {
    args: { am: Mon; dm: Mon; city: boolean };
    expected: { want: number | null };
  }> = {
    'success: 勝率40%以上なら挑む': { args: { am: 'sheep', dm: 'brick', city: false }, expected: { want: 4 } },
    'success: 勝率40%未満なら見送る': { args: { am: 'brick', dm: 'sheep', city: true }, expected: { want: null } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      g.players[1].type = 'cpu';
      g.players[1].mon = tt.args.am;
      g.players[0].mon = tt.args.dm;
      g.V[4].owner = 0; g.V[4].city = tt.args.city;
      expect(pickBattleTarget(g, 1, seqRng([0]))).toBe(tt.expected.want);
    });
  }
});

describe('aiPickType', () => {
  it('success: 相手に有利なタイプを選ぶ', () => {
    const g = mainPhaseGame();
    setRes(g, 1, { sheep: 3, wood: 3 });
    g.players[0].mon = 'brick'; // 風(sheep)が炎(brick)に強い
    expect(aiPickType(g, 1, seqRng([0]))).toBe('sheep');
  });
  it('success: 3枚そろった資源がなければ null', () => {
    const g = mainPhaseGame();
    setRes(g, 1, { sheep: 2, wood: 2 });
    expect(aiPickType(g, 1, seqRng([0]))).toBeNull();
  });
});

describe('aiAct', () => {
  it('success: 都市の材料があれば都市を建てる', () => {
    const g = mainPhaseGame();
    g.V[2].owner = 1;
    setRes(g, 1, { wheat: 2, ore: 3 });
    expect(aiAct(g, 1, seqRng([0]))).toBe(true);
    expect(g.V[2].city).toBe(true);
  });
  it('success: 何もできなければ false', () => {
    const g = mainPhaseGame();
    setRes(g, 1, {});
    expect(aiAct(g, 1, seqRng([0]))).toBe(false);
  });
});
