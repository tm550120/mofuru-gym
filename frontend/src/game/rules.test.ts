import { describe, expect, it } from 'vitest';
import { makeBoard } from './board';
import { COST } from './constants';
import {
  afford, applyRoll, canEvolve, canSettle, checkWin, evolve, longestRoad, pay, rawRoad, total, updateLR, vp,
} from './rules';
import { findPath, mainPhaseGame, pathVertices, seededRng, setRes } from './testHelpers';
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
    args: { hands: Partial<Resources>[]; mon: Resource | null; enemyGym: boolean; cpu?: number[]; cpuDiscard?: boolean };
    expected: { totals: number[]; phase: GameState['phase']; discard: Record<number, number> | null; afterDiscard: GameState['afterDiscard']; log?: string };
  }> = {
    'success: 手札8枚以上の人間は半分（切り捨て）を選ぶまで discard フェーズ': {
      args: { hands: [{ wood: 5, ore: 4 }, { sheep: 8 }, { wheat: 7 }], mon: null, enemyGym: true },
      expected: { totals: [9, 8, 7], phase: 'discard', discard: { 0: 4, 1: 4 }, afterDiscard: 'main', log: 'A・Bが捨てる資源を選んでいます' },
    },
    'success: 手札7枚以下なら誰も捨てずに main へ': {
      args: { hands: [{ wood: 7 }], mon: null, enemyGym: true },
      expected: { totals: [7, 0, 0], phase: 'main', discard: null, afterDiscard: 'main', log: 'Aのモフルは進化前なのでバトルなし' },
    },
    'success: CPU はその場で捨て、人間がいなければそのまま進む': {
      args: { hands: [{}, { ore: 9 }], mon: null, enemyGym: false, cpu: [1], cpuDiscard: true },
      expected: { totals: [0, 5, 0], phase: 'main', discard: null, afterDiscard: 'main' },
    },
    'success: CPU の捨て処理が渡されなければ CPU も discard フェーズで待つ': {
      args: { hands: [{}, { ore: 9 }], mon: null, enemyGym: false, cpu: [1] },
      expected: { totals: [0, 9, 0], phase: 'discard', discard: { 1: 4 }, afterDiscard: 'main' },
    },
    'success: 進化済みで挑戦できるジムがあればバトル': {
      args: { hands: [], mon: 'brick', enemyGym: true },
      expected: { totals: [0, 0, 0], phase: 'battle', discard: null, afterDiscard: 'battle' },
    },
    'success: 捨てる人がいれば、バトルは全員が捨て終わってから': {
      args: { hands: [{}, { sheep: 10 }], mon: 'brick', enemyGym: true },
      expected: { totals: [0, 10, 0], phase: 'discard', discard: { 1: 5 }, afterDiscard: 'battle' },
    },
    'success: 進化済みでも相手のジムがなければバトルなし': {
      args: { hands: [], mon: 'brick', enemyGym: false },
      expected: { totals: [0, 0, 0], phase: 'main', discard: null, afterDiscard: 'main', log: '挑戦できるジムがない' },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      g.phase = 'roll';
      tt.args.hands.forEach((h, i) => setRes(g, i, h));
      (tt.args.cpu || []).forEach(i => { g.players[i].type = 'cpu'; });
      g.players[0].mon = tt.args.mon;
      if (tt.args.enemyGym) g.V[10].owner = 1;
      const discarded: [number, number][] = [];
      const cpuDiscard = tt.args.cpuDiscard ? (gg: GameState, i: number, d: number) => { discarded.push([i, d]); gg.players[i].res.ore -= d; } : undefined;
      applyRoll(g, 3, 4, cpuDiscard);
      expect(g.dice).toEqual([3, 4]);
      expect(g.rollN).toBe(1);
      expect(g.players.map(total)).toEqual(tt.expected.totals);
      expect(g.phase).toBe(tt.expected.phase);
      expect(g.discard).toEqual(tt.expected.discard);
      expect(g.afterDiscard).toBe(tt.expected.afterDiscard);
      expect(g.log[g.log.length - 1]).toBe('🎲7！ Aが7を出した');
      if (tt.expected.log) expect(g.log[0]).toBe(tt.expected.log);
      if (tt.args.cpuDiscard) expect(discarded).toEqual([[1, 4]]);
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

describe('longestRoad / updateLR（最長の道：ジム〜ジムの間の道）', () => {
  /* 一本道の頂点 vs[0..12] と辺 path[0..11] の上に、道 [i, j) とジムを置いて確かめる */
  type Gym = { at: number; owner: number; city?: boolean };
  const tests: Record<string, {
    args: { roads: [number, number, number][]; gyms: Gym[] };
    expected: { lens: number[]; lr: number | null; raw0?: number };
  }> = {
    'success: ジム〜ジム5本で最長の道': {
      args: { roads: [[0, 5, 0]], gyms: [{ at: 0, owner: 0 }, { at: 5, owner: 0 }] },
      expected: { lens: [5, 0], lr: 0, raw0: 5 },
    },
    'success: 片方だけジムの5本は対象外（0）': {
      args: { roads: [[0, 5, 0]], gyms: [{ at: 0, owner: 0 }] },
      expected: { lens: [0, 0], lr: null, raw0: 5 },
    },
    'success: ジム〜ジム4本は対象外': {
      args: { roads: [[0, 4, 0]], gyms: [{ at: 0, owner: 0 }, { at: 4, owner: 0 }] },
      expected: { lens: [4, 0], lr: null },
    },
    'success: 道が伸びていても数えるのはジム〜都市の間': {
      args: { roads: [[0, 7, 0]], gyms: [{ at: 0, owner: 0 }, { at: 5, owner: 0, city: true }] },
      expected: { lens: [5, 0], lr: 0, raw0: 7 },
    },
    'success: 途中に相手のジムがあると途切れる': {
      args: { roads: [[0, 6, 0]], gyms: [{ at: 0, owner: 0 }, { at: 6, owner: 0 }, { at: 3, owner: 1 }] },
      expected: { lens: [0, 0], lr: null, raw0: 3 },
    },
    'success: 途中に自分のジムがあっても通れる': {
      args: { roads: [[0, 7, 0]], gyms: [{ at: 0, owner: 0 }, { at: 2, owner: 0 }, { at: 7, owner: 0 }] },
      expected: { lens: [7, 0], lr: 0 },
    },
    'success: 道がなければ0': {
      args: { roads: [], gyms: [{ at: 0, owner: 0 }] },
      expected: { lens: [0, 0], lr: null, raw0: 0 },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame(1, [{ name: 'A', type: 'local' }, { name: 'B', type: 'remote' }]);
      const path = findPath(g, 12), vs = pathVertices(g, path);
      tt.args.roads.forEach(([i, j, p]) => path.slice(i, j).forEach(e => { g.E[e].owner = p; }));
      tt.args.gyms.forEach(x => { g.V[vs[x.at]].owner = x.owner; g.V[vs[x.at]].city = !!x.city; });
      updateLR(g);
      expect(g.lens).toEqual(tt.expected.lens);
      expect(longestRoad(g, 0)).toBe(tt.expected.lens[0]);
      expect(g.lr).toBe(tt.expected.lr);
      if (tt.expected.raw0 !== undefined) expect(rawRoad(g, 0)).toBe(tt.expected.raw0);
      if (tt.expected.lr !== null) expect(g.log[0]).toBe(`${g.players[tt.expected.lr].name}が最長の道を獲得（+2点）`);
    });
  }
  it('success: 同じ長さなら先に取った人のまま、長くなれば移る', () => {
    const g = mainPhaseGame();
    const path = findPath(g, 12), vs = pathVertices(g, path);
    path.slice(0, 5).forEach(e => { g.E[e].owner = 0; });
    g.V[vs[0]].owner = 0; g.V[vs[5]].owner = 0;
    updateLR(g);
    expect(g.lr).toBe(0);
    // path[5] を空けて、B も ジム〜ジム 5本
    path.slice(6, 11).forEach(e => { g.E[e].owner = 1; });
    g.V[vs[6]].owner = 1; g.V[vs[11]].owner = 1;
    updateLR(g);
    expect(g.lens.slice(0, 2)).toEqual([5, 5]);
    expect(g.lr).toBe(0);
    // B が ジム〜ジム 6本になれば移る
    g.E[path[11]].owner = 1; g.V[vs[12]].owner = 1;
    updateLR(g);
    expect(g.lens[1]).toBe(6);
    expect(g.lr).toBe(1);
    expect(g.log[0]).toBe('Bが最長の道を獲得（+2点）');
  });
  it('success: 持ち主の道が5本未満になれば最長の道を失う', () => {
    const g = mainPhaseGame();
    const path = findPath(g, 5), vs = pathVertices(g, path);
    path.forEach(e => { g.E[e].owner = 0; });
    g.V[vs[0]].owner = 0; g.V[vs[5]].owner = 0;
    updateLR(g);
    expect(g.lr).toBe(0);
    g.V[vs[5]].owner = null;
    updateLR(g);
    expect(g.lr).toBeNull();
  });
});
