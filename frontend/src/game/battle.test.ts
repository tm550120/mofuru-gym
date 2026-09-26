import { describe, expect, it } from 'vitest';
import { adv, battle, bonuses, updateChamp, winProb } from './battle';
import { BEATS } from './constants';
import { face, mainPhaseGame, RES_TYPES, seqRng, setRes } from './testHelpers';
import type { Bonus, Mon, Resource } from './types';

describe('adv（タイプ相性 風→炎→草→岩→光→風）', () => {
  // 左が右に強い
  const cycle: Resource[] = ['sheep', 'brick', 'wood', 'ore', 'wheat'];
  it('success: 相性表が 風>炎>草>岩>光>風', () => {
    cycle.forEach((x, i) => expect(BEATS[x]).toBe(cycle[(i + 1) % cycle.length]));
  });
  const tests: Record<string, { args: { x: Mon; y: Mon }; expected: { want: number } }> = {
    'success: 風は炎に強い': { args: { x: 'sheep', y: 'brick' }, expected: { want: 1 } },
    'success: 炎は草に強い': { args: { x: 'brick', y: 'wood' }, expected: { want: 1 } },
    'success: 草は岩に強い': { args: { x: 'wood', y: 'ore' }, expected: { want: 1 } },
    'success: 岩は光に強い': { args: { x: 'ore', y: 'wheat' }, expected: { want: 1 } },
    'success: 光は風に強い': { args: { x: 'wheat', y: 'sheep' }, expected: { want: 1 } },
    'success: 逆向き（炎→風）は有利ではない': { args: { x: 'brick', y: 'sheep' }, expected: { want: 0 } },
    'success: 同じタイプは有利ではない': { args: { x: 'wood', y: 'wood' }, expected: { want: 0 } },
    'success: 相手が進化前なら相性ボーナスなし': { args: { x: 'sheep', y: null }, expected: { want: 0 } },
    'success: 自分が進化前なら相性ボーナスなし': { args: { x: null, y: 'brick' }, expected: { want: 0 } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(adv(tt.args.x, tt.args.y)).toBe(tt.expected.want); });
  }
  it('success: どのタイプもちょうど1つに強く、1つに弱い', () => {
    for (const x of RES_TYPES) {
      expect(RES_TYPES.filter(y => adv(x, y)).length).toBe(1);
      expect(RES_TYPES.filter(y => adv(y, x)).length).toBe(1);
    }
  });
});

describe('bonuses / winProb（バトルのボーナスと勝率）', () => {
  const tests: Record<string, {
    args: { me: Mon; opp: Mon; city: boolean };
    expected: { want: Bonus[] };
  }> = {
    'success: 進化前・都市でなければボーナスなし': { args: { me: null, opp: null, city: false }, expected: { want: [] } },
    'success: 進化+2・相性+1': { args: { me: 'sheep', opp: 'brick', city: false }, expected: { want: [['進化', 2], ['相性', 1]] } },
    'success: 都市ジムの守り+1': { args: { me: 'brick', opp: 'sheep', city: true }, expected: { want: [['進化', 2], ['都市', 1]] } },
    'success: 進化前でも都市なら+1': { args: { me: null, opp: 'wood', city: true }, expected: { want: [['都市', 1]] } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(bonuses(tt.args.me, tt.args.opp, tt.args.city)).toEqual(tt.expected.want); });
  }

  const probs: Record<string, { args: { am: Mon; dm: Mon; city: boolean }; expected: { want: number } }> = {
    'success: 同条件なら 15/36（同点はジムの勝ち）': { args: { am: 'wood', dm: 'wood', city: false }, expected: { want: 15 / 36 } },
    'success: 進化済み vs 進化前は 26/36': { args: { am: 'wood', dm: null, city: false }, expected: { want: 26 / 36 } },
    'success: 相性有利なら 21/36': { args: { am: 'sheep', dm: 'brick', city: false }, expected: { want: 21 / 36 } },
    'success: 相性不利の都市ジムには 6/36': { args: { am: 'brick', dm: 'sheep', city: true }, expected: { want: 6 / 36 } },
  };
  for (const [name, tt] of Object.entries(probs)) {
    it(name, () => {
      const g = mainPhaseGame();
      g.players[0].mon = tt.args.am;
      g.players[1].mon = tt.args.dm;
      g.V[5].owner = 1; g.V[5].city = tt.args.city;
      expect(winProb(g, 0, 5)).toBeCloseTo(tt.expected.want, 10);
    });
  }
});

describe('battle', () => {
  const tests: Record<string, {
    args: { ra: number; rd: number; am: Mon; dm: Mon; city: boolean };
    expected: { win: number; ta: number; td: number; badges: number[]; mons: Mon[]; textIncludes: string };
  }> = {
    'success: 挑戦者が勝つと相手の資源を奪い、ジム側は進化前に戻る': {
      args: { ra: 5, rd: 5, am: 'sheep', dm: 'brick', city: false },
      expected: { win: 0, ta: 8, td: 7, badges: [1, 0, 0], mons: ['sheep', null], textIncludes: 'Aの勝ち！' },
    },
    'success: 同点ならジムの勝ちで、挑戦者が進化前に戻る': {
      args: { ra: 3, rd: 3, am: 'wood', dm: 'wood', city: false },
      expected: { win: 1, ta: 5, td: 5, badges: [0, 1, 0], mons: [null, 'wood'], textIncludes: '同点なのでジムの勝ち。Bの勝ち！' },
    },
    'success: 都市ジムは守り+1': {
      args: { ra: 6, rd: 5, am: 'wood', dm: 'wood', city: true },
      expected: { win: 1, ta: 8, td: 8, badges: [0, 1, 0], mons: [null, 'wood'], textIncludes: '同点なのでジムの勝ち' },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      g.players[0].mon = tt.args.am;
      g.players[1].mon = tt.args.dm;
      setRes(g, 0, { wood: 1 });
      setRes(g, 1, { ore: 1 });
      g.V[5].owner = 1; g.V[5].city = tt.args.city;
      battle(g, 0, 5, seqRng([face(tt.args.ra), face(tt.args.rd), 0]));
      const b = g.battle!;
      expect(b.id).toBe(1);
      expect(b.win).toBe(tt.expected.win);
      expect([b.ta, b.td]).toEqual([tt.expected.ta, tt.expected.td]);
      expect(g.players.map(p => p.badges)).toEqual(tt.expected.badges);
      expect([g.players[0].mon, g.players[1].mon]).toEqual(tt.expected.mons);
      expect(b.text).toContain(tt.expected.textIncludes);
      // 負けた側の資源が1枚勝った側へ移る
      const loser = tt.expected.win === 0 ? 1 : 0;
      expect(total(g.players[loser].res)).toBe(0);
      expect(total(g.players[tt.expected.win].res)).toBe(2);
    });
  }
  it('success: 負けた側が資源を持っていなければ奪えない', () => {
    const g = mainPhaseGame();
    g.players[0].mon = 'wood';
    g.V[5].owner = 1;
    battle(g, 0, 5, seqRng([face(6), face(1)]));
    expect(g.battle!.text).toContain('Bは資源を持っていなかった。');
    expect(g.players[0].badges).toBe(1);
  });
});

describe('updateChamp（バッジとチャンピオン）', () => {
  const tests: Record<string, {
    args: { badges: number[]; champ: number | null };
    expected: { champ: number | null; changed: boolean };
  }> = {
    'success: 最初に3個集めた人がチャンピオン': { args: { badges: [3, 2, 0], champ: null }, expected: { champ: 0, changed: true } },
    'success: 2個ではまだチャンピオンなし': { args: { badges: [2, 2, 2], champ: null }, expected: { champ: null, changed: false } },
    'success: 同数では移らない': { args: { badges: [3, 3, 0], champ: 0 }, expected: { champ: 0, changed: false } },
    'success: より多く集めた人に移る': { args: { badges: [3, 4, 0], champ: 0 }, expected: { champ: 1, changed: true } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      tt.args.badges.forEach((n, i) => { g.players[i].badges = n; });
      g.champ = tt.args.champ;
      const text = updateChamp(g);
      expect(g.champ).toBe(tt.expected.champ);
      expect(text !== '').toBe(tt.expected.changed);
      if (tt.expected.changed) expect(text).toBe(`${g.players[tt.expected.champ!].name}がチャンピオンに（+2点）`);
    });
  }
  it('success: バトルで3個目のバッジを取るとチャンピオンになり +2点', () => {
    const g = mainPhaseGame();
    g.players[0].mon = 'sheep';
    g.players[0].badges = 2;
    g.V[5].owner = 1;
    battle(g, 0, 5, seqRng([face(6), face(1)]));
    expect(g.champ).toBe(0);
    expect(g.battle!.text).toContain('Aがチャンピオンに（+2点）');
  });
});

function total(r: Record<Resource, number>): number {
  return RES_TYPES.reduce((s, k) => s + r[k], 0);
}
