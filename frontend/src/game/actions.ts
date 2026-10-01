/* 人間プレイヤー（この端末 or リモート）の操作を検証して反映する。
   ホスト／CPU対戦の端末だけが実行する。リモートから来た値は信用せず、ここで検証する */
import { battle } from './battle';
import { ICON, isResource } from './constants';
import { defaultRng } from './random';
import {
  advanceTurn, afford, canCity, canEvolve, canRoad, canSettle, cancelOffer, checkWin, doDiscard, evolve, giveInitial, isCpu, log, makeOffer, pay,
  placeRoad, placeSettlement, respondOffer, roll, type CpuDiscard,
} from './rules';
import type { Action, GameState, Rng } from './types';

/**
 * 操作の結果。呼び出し側はこれを見て次の処理をする。
 * - false: 無効な操作（状態は変わっていない）
 * - 'update': 状態が変わった（描画・同期する）
 * - 'setup': 初期配置の1手が終わった（次の初期配置へ進める）
 * - 'turn': ターンが終わり次の人に移った（CPU なら CPU の手番を始める）
 */
export type ActResult = false | 'update' | 'setup' | 'turn';

/**
 * cpuDiscard: サイコロで7が出たときに CPU が捨てる処理（cpu/ai.ts の cpuDiscard）。
 * 省略すると CPU も discard フェーズで待つ
 */
export function applyAction(g: GameState | null, p: number, a: Action | null | undefined, rng: Rng = defaultRng, cpuDiscard?: CpuDiscard): ActResult {
  if (!g || !a || g.phase === 'over' || !g.players[p] || isCpu(g, p)) return false;
  /* 自分の番でなくてもできる操作：7のときに捨てる、交換の提案に答える */
  if (a.t === 'discard') return doDiscard(g, p, a.r) ? 'update' : false;
  if (a.t === 'respond') return respondOffer(g, p, !!a.ok) ? 'update' : false;
  if (g.cur !== p || g.busy) return false;
  if (a.t === 'cancelOffer') { if (!g.offer || g.offer.from !== p) return false; cancelOffer(g); return 'update'; }
  if (g.offer) return false;
  const pl = g.players[p], main = g.phase === 'main';
  const raw = a as { v?: unknown; e?: unknown };
  const vOk = Number.isInteger(raw.v) && (raw.v as number) >= 0 && (raw.v as number) < g.V.length;
  const eOk = Number.isInteger(raw.e) && (raw.e as number) >= 0 && (raw.e as number) < g.E.length;
  const v = raw.v as number, e = raw.e as number;
  switch (a.t) {
    case 'settle':
      if (!vOk) return false;
      if (g.phase === 'setup') {
        if (g.setupStep !== 'settlement' || !canSettle(g, v, p, true)) return false;
        placeSettlement(g, v, p); if (g.setupIdx >= g.players.length) giveInitial(g, v, p); else log(g, `${pl.name}がジムを置いた`);
        g.setupStep = 'road'; return 'update';
      }
      if (!main || !afford(g, p, 'settlement') || !canSettle(g, v, p, false)) return false;
      pay(g, p, 'settlement'); placeSettlement(g, v, p); log(g, `${pl.name}がジムを建てた（+1点）`); checkWin(g); return 'update';
    case 'road':
      if (!eOk) return false;
      if (g.phase === 'setup') {
        if (g.setupStep !== 'road' || !canRoad(g, e, p)) return false;
        placeRoad(g, e, p); g.setupIdx++; g.setupStep = 'settlement'; return 'setup';
      }
      if (!main || !afford(g, p, 'road') || !canRoad(g, e, p)) return false;
      pay(g, p, 'road'); placeRoad(g, e, p); log(g, `${pl.name}が道を建てた`); checkWin(g); return 'update';
    case 'city':
      if (!vOk || !main || !canCity(g, v, p) || !afford(g, p, 'city')) return false;
      pay(g, p, 'city'); g.V[v].city = true; log(g, `${pl.name}が都市を建てた（+1点、守り+1）`); checkWin(g); return 'update';
    case 'roll':
      if (g.phase !== 'roll') return false;
      roll(g, rng, cpuDiscard); return 'update';
    case 'battle': {
      if (!vOk || g.phase !== 'battle') return false;
      const o = g.V[v].owner; if (o === null || o === p) return false;
      battle(g, p, v, rng); g.phase = 'main'; checkWin(g); return 'update';
    }
    case 'skip':
      if (g.phase !== 'battle') return false;
      log(g, `${pl.name}は挑戦を見送った`); g.phase = 'main'; return 'update';
    case 'end':
      if (!main) return false;
      advanceTurn(g); return 'turn';
    case 'trade':
      if (!main || !isResource(a.give) || !isResource(a.get) || a.give === a.get || pl.res[a.give] < 4) return false;
      pl.res[a.give] -= 4; pl.res[a.get]++; log(g, `${pl.name}が銀行で${ICON[a.give]}×4→${ICON[a.get]}に交換`); return 'update';
    case 'offer':
      if (!main || !makeOffer(g, p, a.to, a.give, a.want)) return false;
      return 'update';
    case 'evolve':
      if (!main || !isResource(a.r) || !canEvolve(g, p) || pl.res[a.r] < 3) return false;
      evolve(g, p, a.r); return 'update';
  }
  return false;
}
