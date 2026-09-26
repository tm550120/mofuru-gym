/* CPU の思考（DOM に依存しない）。待ち時間などの進行は app/session.ts が担う */
import { winProb } from '../game/battle';
import { BEATS, COST, ICON, PIPS, RES } from '../game/constants';
import { defaultRng } from '../game/random';
import {
  afford, canEvolve, citySpots, enemyGyms, evolve, isCpu, log, pay, placeRoad, placeSettlement, roadSpots, settleSpots, total, vp,
} from '../game/rules';
import type { GameState, Resource, Rng } from '../game/types';

/** 交差点 v の価値（出やすさ＋資源の種類の多さ） */
export function vScore(g: GameState, v: number, p?: number, rng: Rng = defaultRng): number {
  const x = g.V[v]; const kinds = new Set<string>(); let s = 0;
  x.hexes.forEach(h => { const hx = g.hexes[h]; if (hx.type === 'desert') return; s += PIPS[hx.num]; kinds.add(hx.type); });
  const own = new Set<string>(); if (p !== undefined) g.V.forEach(o => { if (o.owner === p) o.hexes.forEach(h => own.add(g.hexes[h].type)); });
  kinds.forEach(k => { s += own.has(k) ? .3 : 1.2; });
  return s + rng() * .4;
}
function openSpot(g: GameState, v: number): boolean { const x = g.V[v]; return x.owner === null && !x.adj.some(a => g.V[a].owner !== null); }
export function roadScore(g: GameState, e: number, p: number, rng: Rng = defaultRng): number {
  const ed = g.E[e]; let best = 0;
  [ed.a, ed.b].forEach(v => {
    if (g.V[v].owner === p) return;
    if (openSpot(g, v)) best = Math.max(best, vScore(g, v, p, rng));
    g.V[v].adj.forEach(n => { if (openSpot(g, n)) best = Math.max(best, vScore(g, n, p, rng) * .7); });
  });
  return best + rng() * .3;
}
/** 進化するタイプを選ぶ（相手に有利なタイプを優先） */
export function aiPickType(g: GameState, p: number, rng: Rng = defaultRng): Resource | null {
  const pl = g.players[p]; let best: Resource | null = null, bs = -1e9;
  RES.forEach(r => {
    if (pl.res[r] < 3) return; let s = (pl.res[r] - 3) * .6 + rng() * .5;
    g.players.forEach((q, i) => { if (i === p || !q.mon) return; if (BEATS[r] === q.mon) s += 2; if (BEATS[q.mon] === r) s -= 2; });
    if (s > bs) { bs = s; best = r; }
  });
  return best;
}

/** 初期配置でジムを置く交差点 */
export function pickSetupSettlement(g: GameState, p: number, rng: Rng = defaultRng): number {
  const spots = settleSpots(g, p, true);
  return spots.reduce((b, x) => vScore(g, x, p, rng) > vScore(g, b, p, rng) ? x : b, spots[0]);
}
/** 初期配置で道を置く辺 */
export function pickSetupRoad(g: GameState, p: number, rng: Rng = defaultRng): number {
  const rs = roadSpots(g, p);
  return rs.reduce((b, e) => roadScore(g, e, p, rng) > roadScore(g, b, p, rng) ? e : b, rs[0]);
}

/** 7を出したときに挑戦するジム（勝率40%未満なら null＝見送り） */
export function pickBattleTarget(g: GameState, p: number, rng: Rng = defaultRng): number | null {
  const leaderScore = (i: number) => vp(g, i) + (isCpu(g, i) ? 0 : .5);
  let best: number | null = null, bs = -1;
  enemyGyms(g, p).forEach(v => { const s = winProb(g, p, v) + leaderScore(g.V[v].owner as number) * .02 + rng() * .01; if (s > bs) { bs = s; best = v; } });
  if (best !== null && winProb(g, p, best) >= .4) return best;
  return null;
}
/** CPU の1手（建設・進化・交換）。何かしたら true */
export function aiAct(g: GameState, p: number, rng: Rng = defaultRng): boolean {
  const pl = g.players[p], name = pl.name;
  const cs = citySpots(g, p);
  if (afford(g, p, 'city') && cs.length) { const v = cs.reduce((b, x) => vScore(g, x, undefined, rng) > vScore(g, b, undefined, rng) ? x : b); pay(g, p, 'city'); g.V[v].city = true; log(g, `${name}が都市を建てた`); return true; }
  const ss = settleSpots(g, p, false);
  if (afford(g, p, 'settlement') && ss.length) { const v = ss.reduce((b, x) => vScore(g, x, p, rng) > vScore(g, b, p, rng) ? x : b); pay(g, p, 'settlement'); placeSettlement(g, v, p); log(g, `${name}がジムを建てた`); return true; }
  if (afford(g, p, 'road') && (ss.length === 0 || (g.lr !== p && g.lens[p] >= 4 && rng() < .5))) {
    const rs = roadSpots(g, p);
    if (rs.length) { const e = rs.reduce((b, x) => roadScore(g, x, p, rng) > roadScore(g, b, p, rng) ? x : b); pay(g, p, 'road'); placeRoad(g, e, p); log(g, `${name}が道を建てた`); return true; }
  }
  if (canEvolve(g, p) && (total(pl) >= 7 || RES.some(r => pl.res[r] >= 4))) { const r = aiPickType(g, p, rng); if (r) { evolve(g, p, r); return true; } }
  const goals: ('city' | 'settlement' | 'road')[] = []; if (cs.length && pl.res.ore >= 2) goals.push('city');
  goals.push(ss.length ? 'settlement' : 'road'); if (cs.length) goals.push('city');
  for (const goal of goals) {
    const c = COST[goal]; const miss = RES.filter(r => pl.res[r] < (c[r] || 0));
    if (!miss.length || miss.length > 2) continue;
    const giver = RES.find(r => pl.res[r] - (c[r] || 0) >= 4);
    if (giver) { pl.res[giver] -= 4; pl.res[miss[0]]++; log(g, `${name}が銀行で${ICON[giver]}×4→${ICON[miss[0]]}に交換`); return true; }
  }
  return false;
}
