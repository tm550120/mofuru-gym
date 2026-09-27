import { describe, expect, it } from 'vitest';
import { battleSound, type BattleSound } from '../audio/outcome';
import { DEMO_ME, demoBattle, demoGame } from './demo';

describe('demoBattle（演出テスト用のバトル結果）', () => {
  const g = demoGame(), names = g.players.map(p => p.name);
  const tests: Record<string, { args: { kind: BattleSound }; expected: { want: BattleSound } }> = {
    'success: 勝ちのデモは自分が勝つ': { args: { kind: 'win' }, expected: { want: 'win' } },
    'success: 負けのデモは自分が負ける': { args: { kind: 'lose' }, expected: { want: 'lose' } },
    'success: 観戦のデモは自分が関わらない': { args: { kind: 'watch' }, expected: { want: 'watch' } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const b = demoBattle(tt.args.kind, 1, names);
      expect(battleSound(b, DEMO_ME)).toBe(tt.expected.want);
      expect(b.win === b.a ? b.ta > b.td : b.td >= b.ta).toBe(true);
      expect(g.players[b.a]).toBeDefined();
      expect(g.players[b.d]).toBeDefined();
    });
  }
});
