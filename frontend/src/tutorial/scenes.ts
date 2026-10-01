/* チュートリアルの図に使う盤面（DOM に依存しない）。
 * 説明と食い違わないよう、図は本物のルール（game/）と CPU の初期配置（cpu/ai）で作る。
 * 乱数は固定なので、いつ開いても同じ図になる。 */
import { pickSetupRoad, pickSetupSettlement } from '../cpu/ai';
import { winProb } from '../game/battle';
import { createGame, enemyGyms, finishSetupIfDone, giveInitial, placeRoad, placeSettlement, roadSpots, settleSpots, updateLR } from '../game/rules';
import type { GameState, Rng, Seat } from '../game/types';

/** 図の中の「あなた」の席（CPU 対戦と同じ席0＝赤） */
export const ME = 0;
const SEATS: Seat[] = [{ name: 'あなた', type: 'local' }, { name: 'CPU 青', type: 'cpu' }, { name: 'CPU 橙', type: 'cpu' }];
const SEED = 7;

/** 再現できる疑似乱数（mulberry32） */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 辺 e の、交差点 v ではないほうの端 */
const other = (g: GameState, e: number, v: number): number => (g.E[e].a === v ? g.E[e].b : g.E[e].a);

/** 始まったばかりの島（あなたが先攻。まだ何も置かれていない） */
function freshGame(rng: Rng = seeded(SEED)): GameState {
  return createGame(SEATS, [0, 1, 2], rng);
}

/** 初期配置①：最初のジムを置く交差点を選ぶところ。dots はジムを置ける交差点 */
export function sceneFirstGym(): { g: GameState; dots: number[] } {
  const g = freshGame();
  return { g, dots: settleSpots(g, ME, true) };
}

/** 初期配置②：ジムを置いたあと、つながる道を選ぶところ。roads は道を置ける辺 */
export function sceneFirstRoad(): { g: GameState; gym: number; roads: number[] } {
  const rng = seeded(SEED), g = freshGame(rng);
  const gym = pickSetupSettlement(g, ME, rng);
  placeSettlement(g, gym, ME); g.setupStep = 'road';
  return { g, gym, roads: roadSpots(g, ME) };
}

/** 初期配置が全員終わって、あなたの最初の番が来たところ（画面の見かたの図） */
export function sceneFirstTurn(): GameState {
  const rng = seeded(SEED), g = freshGame(rng), n = g.players.length;
  g.order.forEach((p, k) => {
    const v = pickSetupSettlement(g, p, rng);
    placeSettlement(g, v, p); if (k >= n) giveInitial(g, v, p);
    placeRoad(g, pickSetupRoad(g, p, rng), p); g.setupIdx++;
  });
  finishSetupIfDone(g);
  return g;
}

/**
 * ジムを建てる条件：自分のジムから道を2本伸ばしたところ。
 * dots はジムを建てられる交差点、blocked は建物のとなりなので建てられない交差点
 */
export function sceneBuildGym(): { g: GameState; gym: number; dots: number[]; blocked: number[] } {
  const { g, gym, roads } = sceneFirstRoad();
  /* 2本先の交差点が島の内側（接する土地が多い）になる道を選ぶ */
  const twoRoads = roads.flatMap(e1 => {
    const mid = other(g, e1, gym);
    return g.V[mid].edges.filter(e2 => e2 !== e1).map(e2 => ({ es: [e1, e2], score: g.V[other(g, e2, mid)].hexes.length }));
  });
  const best = twoRoads.reduce((b, x) => (x.score > b.score ? x : b));
  g.phase = 'main'; g.lastSettle = null;
  best.es.forEach(e => placeRoad(g, e, ME));
  return { g, gym, dots: settleSpots(g, ME, false), blocked: g.V[gym].adj.slice() };
}

/** 最長の道：自分のジムから別の自分のジムまで、道が5本つながったところ。path は道（辺）を端から順に */
export function sceneLongestRoad(): { g: GameState; path: number[]; ends: [number, number] } {
  const g = freshGame(), N = 5;
  let path: number[] = [], ends: [number, number] = [0, 0], bs = -1;
  /* 5本の一本道のうち、両端がいちばん離れる（まっすぐな）もの。同じなら島の真ん中に近いもの */
  const walk = (start: number, v: number, seen: Set<number>, es: number[]): void => {
    if (es.length === N) {
      const a = g.V[start], b = g.V[v];
      const s = Math.hypot(a.x - b.x, a.y - b.y) - Math.hypot((a.x + b.x) / 2, (a.y + b.y) / 2) / 100;
      if (s > bs) { bs = s; path = es.slice(); ends = [start, v]; }
      return;
    }
    g.V[v].edges.forEach(e => {
      const w = other(g, e, v); if (seen.has(w)) return;
      seen.add(w); es.push(e); walk(start, w, seen, es); es.pop(); seen.delete(w);
    });
  };
  g.V.forEach(v => walk(v.id, v.id, new Set([v.id]), []));
  g.phase = 'main';
  ends.forEach(v => { g.V[v].owner = ME; });
  path.forEach(e => { g.E[e].owner = ME; });
  updateLR(g);
  return { g, path, ends };
}

/**
 * 7を出して挑戦するジムを選ぶところ。あなたは炎、CPU 青は草（あなたが相性有利）、CPU 橙は進化前。
 * 青と橙はジムを1つずつ都市にしてある。targets は挑戦できるジムと勝率（％）
 */
export function sceneBattlePick(): { g: GameState; targets: { v: number; pc: number }[] } {
  const g = sceneFirstTurn();
  g.players[ME].mon = 'brick'; g.players[1].mon = 'wood';
  [1, 2].forEach(p => { const v = g.V.find(x => x.owner === p); if (v) v.city = true; });
  g.phase = 'battle';
  return { g, targets: enemyGyms(g, ME).map(v => ({ v, pc: Math.round(winProb(g, ME, v) * 100) })) };
}
