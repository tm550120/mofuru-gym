/* テスト用のヘルパー（本番コードからは使わない） */
import { createGame } from './rules';
import type { GameState, Resource, Resources, Rng, Seat } from './types';

/** 再現できる疑似乱数（mulberry32） */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 決まった値を順番に返す乱数（尽きたら先頭に戻る） */
export function seqRng(values: number[]): Rng {
  let i = 0;
  return () => values[i++ % values.length];
}

/** サイコロの目 d（1〜6）が出る乱数値 */
export const face = (d: number): number => (d - 1) / 6 + 0.001;

const SEATS: Seat[] = [
  { name: 'A', type: 'local' },
  { name: 'B', type: 'remote' },
  { name: 'C', type: 'remote' },
];

/** 初期配置を飛ばして本編（main フェーズ・A の番）から始まる状態。盤面の数字はすべて 0 にする */
export function mainPhaseGame(seed = 1, seats: Seat[] = SEATS): GameState {
  const g = createGame(seats, seededRng(seed));
  g.phase = 'main';
  g.setupIdx = g.order.length;
  g.cur = 0;
  g.log = [];
  g.hexes.forEach(h => { h.num = 0; });
  return g;
}

export function setRes(g: GameState, p: number, res: Partial<Resources>): void {
  g.players[p].res = { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0, ...res };
}

/** 盤面上で長さ n の一本道（辺 ID の列）を探す */
export function findPath(g: GameState, n: number): number[] {
  const walk = (v: number, usedV: Set<number>, path: number[]): number[] | null => {
    if (path.length === n) return path;
    for (const eid of g.V[v].edges) {
      const e = g.E[eid], w = e.a === v ? e.b : e.a;
      if (usedV.has(w)) continue;
      usedV.add(w);
      const r = walk(w, usedV, [...path, eid]);
      if (r) return r;
      usedV.delete(w);
    }
    return null;
  };
  for (const v of g.V) {
    const r = walk(v.id, new Set([v.id]), []);
    if (r) return r;
  }
  throw new Error('path not found');
}

/** 辺の列が通る頂点（両端を含む）を順に返す */
export function pathVertices(g: GameState, edges: number[]): number[] {
  if (!edges.length) return [];
  const first = g.E[edges[0]], second = edges[1] !== undefined ? g.E[edges[1]] : null;
  let v = second && (first.a === second.a || first.a === second.b) ? first.b : first.a;
  const vs = [v];
  for (const eid of edges) { const e = g.E[eid]; v = e.a === v ? e.b : e.a; vs.push(v); }
  return vs;
}

export const RES_TYPES: Resource[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
