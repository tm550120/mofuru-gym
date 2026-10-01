import { describe, expect, it } from 'vitest';
import { applyAction, type ActResult } from './actions';
import { MAX_CITIES, MAX_GYMS } from './constants';
import { canCity, canSettle, citiesLeft, citySpots, createGame, finishSetupIfDone, gymsLeft, roadSpots, settleSpots } from './rules';
import { mainPhaseGame, placeBuildings, seededRng, setRes } from './testHelpers';
import type { Action, GameState, Seat } from './types';

/** 席 p の道の先に、ジムを置ける交差点を1つ用意する */
function prepareSettleSpot(g: GameState, p: number): number {
  for (const v of g.V) {
    if (v.owner !== null || v.adj.some(a => g.V[a].owner !== null)) continue;
    g.E[v.edges[0]].owner = p;
    return v.id;
  }
  throw new Error('no spot');
}

const GYM_RES = { wood: 1, brick: 1, sheep: 1, wheat: 1 };
const CITY_RES = { wheat: 2, ore: 3 };

describe('ジム・都市の上限（applyAction）', () => {
  const tests: Record<string, {
    args: { action: (g: GameState, ctx: { spot: number; gyms: number[] }) => Action };
    setup: { gyms: number; cities: number; toCity?: boolean; res: Partial<Record<'wood' | 'brick' | 'sheep' | 'wheat' | 'ore', number>> };
    expected: { want: ActResult; gymsLeft: number; citiesLeft: number };
  }> = {
    'success: ジムが上限未満（4個）なら5個目を建てられる': {
      args: { action: (_, c) => ({ t: 'settle', v: c.spot }) },
      setup: { gyms: MAX_GYMS - 1, cities: 0, res: GYM_RES },
      expected: { want: 'update', gymsLeft: 0, citiesLeft: MAX_CITIES },
    },
    'failed: ジムが5個あると6個目は建てられない': {
      args: { action: (_, c) => ({ t: 'settle', v: c.spot }) },
      setup: { gyms: MAX_GYMS, cities: 0, res: GYM_RES },
      expected: { want: false, gymsLeft: 0, citiesLeft: MAX_CITIES },
    },
    'success: ジム5個のうち1つを都市にすると、ジムの枠が空いてまた建てられる': {
      args: { action: (_, c) => ({ t: 'settle', v: c.spot }) },
      setup: { gyms: MAX_GYMS, cities: 0, toCity: true, res: GYM_RES },
      expected: { want: 'update', gymsLeft: 0, citiesLeft: MAX_CITIES - 1 },
    },
    'success: 都市が3個なら4個目にできる': {
      args: { action: (_, c) => ({ t: 'city', v: c.gyms[0] }) },
      setup: { gyms: 1, cities: MAX_CITIES - 1, res: CITY_RES },
      expected: { want: 'update', gymsLeft: MAX_GYMS, citiesLeft: 0 },
    },
    'failed: 都市が4個あると5個目の都市にはできない': {
      args: { action: (_, c) => ({ t: 'city', v: c.gyms[0] }) },
      setup: { gyms: 1, cities: MAX_CITIES, res: CITY_RES },
      expected: { want: false, gymsLeft: MAX_GYMS - 1, citiesLeft: 0 },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const g = mainPhaseGame();
      placeBuildings(g, 0, tt.setup.cities, true);
      const gyms = placeBuildings(g, 0, tt.setup.gyms);
      if (tt.setup.toCity) { setRes(g, 0, CITY_RES); expect(applyAction(g, 0, { t: 'city', v: gyms[1] })).toBe('update'); }
      const spot = prepareSettleSpot(g, 0);
      setRes(g, 0, tt.setup.res);

      expect(applyAction(g, 0, tt.args.action(g, { spot, gyms }))).toBe(tt.expected.want);
      expect(gymsLeft(g, 0)).toBe(tt.expected.gymsLeft);
      expect(citiesLeft(g, 0)).toBe(tt.expected.citiesLeft);
    });
  }
});

describe('ジム・都市の上限（置ける場所の一覧）', () => {
  it('success: ジムが上限のときは置ける交差点が無く、ほかの人には影響しない', () => {
    const g = mainPhaseGame();
    placeBuildings(g, 0, MAX_GYMS);
    const spot = prepareSettleSpot(g, 0);
    g.E[g.V[spot].edges[1]].owner = 1;
    expect(canSettle(g, spot, 0, false)).toBe(false);
    expect(settleSpots(g, 0, false)).toEqual([]);
    expect(canSettle(g, spot, 1, false)).toBe(true);
    // 道は上限と関係なく置ける
    expect(roadSpots(g, 0).length).toBeGreaterThan(0);
  });
  it('success: 都市が上限のときは都市にできるジムが無い', () => {
    const g = mainPhaseGame();
    placeBuildings(g, 0, MAX_CITIES, true);
    const [gym] = placeBuildings(g, 0, 1);
    expect(canCity(g, gym, 0)).toBe(false);
    expect(citySpots(g, 0)).toEqual([]);
  });
});

describe('ジム・都市の上限（初期配置）', () => {
  it('success: 初期配置の2個もジムの数に含まれる', () => {
    const seats: Seat[] = [{ name: 'A', type: 'local' }, { name: 'B', type: 'local' }, { name: 'C', type: 'local' }];
    const g = createGame(seats, undefined, seededRng(3));
    while (g.phase === 'setup') {
      const p = g.order[g.setupIdx];
      g.cur = p;
      expect(applyAction(g, p, { t: 'settle', v: settleSpots(g, p, true)[0] })).toBe('update');
      expect(applyAction(g, p, { t: 'road', e: roadSpots(g, p)[0] })).toBe('setup');
      finishSetupIfDone(g);
    }
    expect(g.players.map((_, i) => gymsLeft(g, i))).toEqual([MAX_GYMS - 2, MAX_GYMS - 2, MAX_GYMS - 2]);
  });
});

describe('ジム・都市の上限（上限を超えた盤面を読み込んだとき）', () => {
  it('success: 例外にならず、それ以上は建てられないだけ', () => {
    const src = mainPhaseGame();
    placeBuildings(src, 0, MAX_CITIES + 1, true);
    const gyms = placeBuildings(src, 0, MAX_GYMS + 2);
    const spot = prepareSettleSpot(src, 0);
    // 保存・同期と同じく JSON を通す
    const g = JSON.parse(JSON.stringify(src)) as GameState;
    expect(gymsLeft(g, 0)).toBe(0);
    expect(citiesLeft(g, 0)).toBe(0);
    setRes(g, 0, { wood: 9, brick: 9, sheep: 9, wheat: 9, ore: 9 });
    expect(applyAction(g, 0, { t: 'settle', v: spot })).toBe(false);
    expect(applyAction(g, 0, { t: 'city', v: gyms[0] })).toBe(false);
    // 道はふつうに建てられる
    expect(applyAction(g, 0, { t: 'road', e: roadSpots(g, 0)[0] })).toBe('update');
  });
});
