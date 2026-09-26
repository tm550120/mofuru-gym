import { describe, expect, it } from 'vitest';
import { makeBoard } from './board';
import { COST } from './constants';
import {
  afford, applyRoll, canEvolve, canSettle, checkWin, evolve, longestRoad, pay, total, updateLR, vp,
} from './rules';
import { findPath, mainPhaseGame, pathVertices, seededRng, seqRng, setRes } from './testHelpers';
import type { BuildKind, GameState, Resource, Resources } from './types';

describe('makeBoard', () => {
  it('success: 19マス・54交差点・72辺で、資源と数字の数が決まっている', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const b = makeBoard(seededRng(seed));
      expect(b.hexes).toHaveLength(19);
      expect(b.V).toHaveLength(54);
      expect(b.E).toHaveLength(72);
      const count = (t: string) => b.hexes.filter(h => h.type === t).length;
      expect([count('wood'), count('sheep'), count('wheat'), count('brick'), count('ore'), count('desert')]).toEqual([4, 4, 4, 3, 3, 1]);
      expect(b.hexes.find(h => h.type === 'desert')!.num).toBe(0);
      expect(b.hexes.filter(h => h.type !== 'desert').map(h => h.num).sort((x, y) => x - y))
        .toEqual([2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12]);
      // 6と8は隣り合わない
      const at = new Map(b.hexes.map(h => [h.q + ',' + h.r, h]));
      const hot = (n: number) => n === 6 || n === 8;
      for (const h of b.hexes) {
        if (!hot(h.num)) continue;
        for (const [dq, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]]) {
          const n = at.get((h.q + dq) + ',' + (h.r + dr));
          expect(n && hot(n.num)).toBeFalsy();
        }
      }
    }
  });
});

describe('applyRoll（サイコロの産出）', () => {
  type Setup = (g: GameState) => { hexType: Resource };
  const tests: Record<string, {
    args: { a: number; b: number };
    setup: Setup;
    expected: { gains: number[]; phase: GameState['phase']; logIncludes: string };
  }> = {
    'success: ジムは1枚、都市は2枚もらえる': {
      args: { a: 4, b: 4 },
      setup: g => {
        const h = g.hexes.find(x => x.type !== 'desert')!;
        h.num = 8;
        g.V[h.verts[0]].owner = 0;
        g.V[h.verts[3]].owner = 1; g.V[h.verts[3]].city = true;
        return { hexType: h.type as Resource };
      },
      expected: { gains: [1, 2, 0], phase: 'main', logIncludes: '🎲8：' },
    },
    'success: 同じ土地に2つ接していれば2回もらえる': {
      args: { a: 2, b: 3 },
      setup: g => {
        const h = g.hexes.find(x => x.type !== 'desert')!;
        h.num = 5;
        g.V[h.verts[0]].owner = 2; g.V[h.verts[3]].owner = 2;
        return { hexType: h.type as Resource };
      },
      expected: { gains: [0, 0, 2], phase: 'main', logIncludes: 'C' },
    },
    'success: 出目と違う数字の土地からはもらえない': {
      args: { a: 1, b: 2 },
      setup: g => {
        const h = g.hexes.find(x => x.type !== 'desert')!;
        h.num = 4;
        g.V[h.verts[0]].owner = 0;
        return { hexType: h.type as Resource };
      },
      expected: { gains: [0, 0, 0], phase: 'main', logIncludes: '収穫なし' },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      g.phase = 'roll';
      const { hexType } = tt.setup(g);
      applyRoll(g, tt.args.a, tt.args.b);
      expect(g.dice).toEqual([tt.args.a, tt.args.b]);
      expect(g.players.map(p => p.res[hexType])).toEqual(tt.expected.gains);
      expect(g.phase).toBe(tt.expected.phase);
      expect(g.log[0]).toContain(tt.expected.logIncludes);
    });
  }
});

describe('applyRoll（7）', () => {
  const tests: Record<string, {
    args: { hand: Partial<Resources>; mon: Resource | null; enemyGym: boolean };
    expected: { total: number; phase: GameState['phase'] };
  }> = {
    'success: 手札8枚以上は半分捨てる（進化前ならバトルなし）': {
      args: { hand: { wood: 5, ore: 4 }, mon: null, enemyGym: true },
      expected: { total: 5, phase: 'main' },
    },
    'success: 手札7枚以下は捨てない': {
      args: { hand: { wood: 7 }, mon: null, enemyGym: true },
      expected: { total: 7, phase: 'main' },
    },
    'success: 進化済みで挑戦できるジムがあればバトル': {
      args: { hand: {}, mon: 'brick', enemyGym: true },
      expected: { total: 0, phase: 'battle' },
    },
    'success: 進化済みでも相手のジムがなければバトルなし': {
      args: { hand: {}, mon: 'brick', enemyGym: false },
      expected: { total: 0, phase: 'main' },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      g.phase = 'roll';
      setRes(g, 0, tt.args.hand);
      g.players[0].mon = tt.args.mon;
      if (tt.args.enemyGym) g.V[10].owner = 1;
      applyRoll(g, 3, 4, seqRng([0]));
      expect(total(g.players[0])).toBe(tt.expected.total);
      expect(g.phase).toBe(tt.expected.phase);
    });
  }
});

describe('afford / pay（建設コスト）', () => {
  const tests: Record<string, {
    args: { kind: BuildKind; res: Partial<Resources> };
    expected: { afford: boolean; after?: Partial<Resources> };
  }> = {
    'success: 道は木材1・レンガ1': { args: { kind: 'road', res: { wood: 1, brick: 1 } }, expected: { afford: true, after: {} } },
    'success: ジムは木材・レンガ・羊毛・小麦を1枚ずつ': { args: { kind: 'settlement', res: { wood: 1, brick: 1, sheep: 1, wheat: 2 } }, expected: { afford: true, after: { wheat: 1 } } },
    'success: 都市は小麦2・鉱石3': { args: { kind: 'city', res: { wheat: 2, ore: 4 } }, expected: { afford: true, after: { ore: 1 } } },
    'failed: 道の材料が足りない': { args: { kind: 'road', res: { wood: 1 } }, expected: { afford: false } },
    'failed: ジムの材料が1つ足りない': { args: { kind: 'settlement', res: { wood: 1, brick: 1, sheep: 1 } }, expected: { afford: false } },
    'failed: 都市の鉱石が足りない': { args: { kind: 'city', res: { wheat: 2, ore: 2 } }, expected: { afford: false } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      setRes(g, 0, tt.args.res);
      expect(afford(g, 0, tt.args.kind)).toBe(tt.expected.afford);
      if (tt.expected.after) {
        pay(g, 0, tt.args.kind);
        expect(g.players[0].res).toEqual({ wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, ...tt.expected.after });
      }
    });
  }
  it('success: コスト表が README のルールどおり', () => {
    expect(COST).toEqual({
      road: { wood: 1, brick: 1 },
      settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
      city: { wheat: 2, ore: 3 },
    });
  });
});

describe('canSettle', () => {
  it('failed: 他の建物の隣には置けない', () => {
    const g = mainPhaseGame();
    const v = g.V[0];
    g.V[v.adj[0]].owner = 1;
    expect(canSettle(g, v.id, 0, true)).toBe(false);
  });
  it('failed: 本編では自分の道につながっていないと置けない', () => {
    const g = mainPhaseGame();
    expect(canSettle(g, 0, 0, false)).toBe(false);
    expect(canSettle(g, 0, 0, true)).toBe(true);
    g.E[g.V[0].edges[0]].owner = 0;
    expect(canSettle(g, 0, 0, false)).toBe(true);
  });
});

describe('evolve / canEvolve（進化）', () => {
  const tests: Record<string, {
    args: { res: Partial<Resources>; mon: Resource | null };
    expected: { canEvolve: boolean };
  }> = {
    'success: 同じ資源3枚で進化できる': { args: { res: { sheep: 3 }, mon: null }, expected: { canEvolve: true } },
    'failed: 同じ資源が2枚ずつでは進化できない': { args: { res: { wood: 2, brick: 2, sheep: 2 }, mon: null }, expected: { canEvolve: false } },
    'failed: 進化済みならもう進化できない': { args: { res: { ore: 5 }, mon: 'wood' }, expected: { canEvolve: false } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      setRes(g, 0, tt.args.res);
      g.players[0].mon = tt.args.mon;
      expect(canEvolve(g, 0)).toBe(tt.expected.canEvolve);
    });
  }
  it('success: 進化すると資源3枚を払ってタイプが決まる', () => {
    const g = mainPhaseGame();
    setRes(g, 0, { sheep: 4 });
    evolve(g, 0, 'sheep');
    expect(g.players[0].mon).toBe('sheep');
    expect(g.players[0].res.sheep).toBe(1);
    expect(g.log[0]).toBe('Aのモフルがクラウドモフル（風）に進化！');
  });
});

describe('vp / checkWin（得点と勝利）', () => {
  const tests: Record<string, {
    args: { settlements: number; cities: number; lr: boolean; champ: boolean };
    expected: { vp: number; win: boolean };
  }> = {
    'success: ジム1点・都市2点': { args: { settlements: 2, cities: 1, lr: false, champ: false }, expected: { vp: 4, win: false } },
    'success: 最長の道とチャンピオンは2点ずつ': { args: { settlements: 1, cities: 0, lr: true, champ: true }, expected: { vp: 5, win: false } },
    'success: 9点ではまだ勝ちではない': { args: { settlements: 3, cities: 1, lr: true, champ: true }, expected: { vp: 9, win: false } },
    'success: 10点で勝ち': { args: { settlements: 2, cities: 2, lr: true, champ: true }, expected: { vp: 10, win: true } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      let v = 0;
      for (let i = 0; i < tt.args.settlements; i++) g.V[v++].owner = 1;
      for (let i = 0; i < tt.args.cities; i++) { g.V[v].owner = 1; g.V[v++].city = true; }
      g.lr = tt.args.lr ? 1 : null;
      g.champ = tt.args.champ ? 1 : null;
      expect(vp(g, 1)).toBe(tt.expected.vp);
      expect(checkWin(g)).toBe(tt.expected.win);
      expect(g.phase).toBe(tt.expected.win ? 'over' : 'main');
      expect(g.winner).toBe(tt.expected.win ? 1 : null);
    });
  }
});

describe('longestRoad / updateLR（最長の道）', () => {
  it('success: 5本つながると最長の道（+2点）', () => {
    const g = mainPhaseGame();
    const path = findPath(g, 5);
    path.slice(0, 4).forEach(e => { g.E[e].owner = 0; });
    updateLR(g);
    expect(longestRoad(g, 0)).toBe(4);
    expect(g.lr).toBeNull();
    g.E[path[4]].owner = 0;
    updateLR(g);
    expect(g.lens[0]).toBe(5);
    expect(g.lr).toBe(0);
    expect(g.log[0]).toBe('Aが最長の道を獲得（+2点）');
  });
  it('success: 相手のジムで道が分断される', () => {
    const g = mainPhaseGame();
    const path = findPath(g, 5);
    path.forEach(e => { g.E[e].owner = 0; });
    const vs = pathVertices(g, path);
    g.V[vs[2]].owner = 1;
    expect(longestRoad(g, 0)).toBe(3);
  });
  it('success: 同じ長さでは今の持ち主のまま、長くなれば移る', () => {
    const g = mainPhaseGame();
    const path = findPath(g, 12);
    path.slice(0, 5).forEach(e => { g.E[e].owner = 0; });
    updateLR(g);
    expect(g.lr).toBe(0);
    // path[5] を空けて、B も 5本
    path.slice(6, 11).forEach(e => { g.E[e].owner = 1; });
    updateLR(g);
    expect(g.lens.slice(0, 2)).toEqual([5, 5]);
    expect(g.lr).toBe(0);
    // B が 6本になれば移る
    g.E[path[11]].owner = 1;
    updateLR(g);
    expect(g.lr).toBe(1);
  });
});
