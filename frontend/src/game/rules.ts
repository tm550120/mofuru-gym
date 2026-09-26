/* ゲームのルール（DOM に依存しない純粋なロジック）。状態 g を直接書き換える */
import { makeBoard } from './board';
import { COLORS, COST, GOAL, ICON, MON_NAME, RES, TYPE_JA } from './constants';
import { defaultRng, die } from './random';
import type { BuildKind, GameState, Mon, Player, Resource, Rng, Seat } from './types';

export const monName = (m: Mon | undefined): string => MON_NAME[m || 'none'];

export function log(g: GameState, t: string): void { g.log.unshift(t); g.log = g.log.slice(0, 3); }

/** 新しいゲーム状態を作る（初期配置フェーズから） */
export function createGame(seats: Seat[], rng: Rng = defaultRng): GameState {
  const b = makeBoard(rng), idx = seats.map((_, i) => i);
  const g: GameState = {
    ...b, gid: Date.now() + '-' + rng().toString(36).slice(2, 6),
    players: seats.map((s, i) => ({ name: s.name, type: s.type, color: COLORS[i], mon: null, badges: 0, disconnected: false, res: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 } })),
    cur: 0, phase: 'setup', setupStep: 'settlement', order: [...idx, ...idx.slice().reverse()], setupIdx: 0, lastSettle: null,
    dice: [1, 1], lr: null, champ: null, lens: idx.map(() => 0), busy: false, log: [], battle: null, winner: null,
  };
  log(g, '島が見つかった。最初のジムを置こう');
  return g;
}

export const isCpu = (g: GameState, p: number): boolean => g.players[p].type === 'cpu';
export const total = (p: Player): number => RES.reduce((s, r) => s + p.res[r], 0);
const costEntries = (c: BuildKind) => Object.entries(COST[c]) as [Resource, number][];
export const afford = (g: GameState, p: number, c: BuildKind): boolean => costEntries(c).every(([r, n]) => g.players[p].res[r] >= n);
export const pay = (g: GameState, p: number, c: BuildKind): void => costEntries(c).forEach(([r, n]) => { g.players[p].res[r] -= n; });

/** 得点：ジム1点、都市2点、最長の道2点、チャンピオン2点 */
export function vp(g: GameState, p: number): number {
  let s = 0; g.V.forEach(v => { if (v.owner === p) s += v.city ? 2 : 1; });
  return s + (g.lr === p ? 2 : 0) + (g.champ === p ? 2 : 0);
}
export function canSettle(g: GameState, v: number, p: number, setup: boolean): boolean {
  const x = g.V[v]; if (!x || x.owner !== null) return false;
  if (x.adj.some(a => g.V[a].owner !== null)) return false;
  return setup || x.edges.some(e => g.E[e].owner === p);
}
export function canRoad(g: GameState, e: number, p: number): boolean {
  const ed = g.E[e]; if (!ed || ed.owner !== null) return false;
  if (g.phase === 'setup') return ed.a === g.lastSettle || ed.b === g.lastSettle;
  return [ed.a, ed.b].some(v => {
    const x = g.V[v];
    if (x.owner === p) return true;
    return x.owner === null && x.edges.some(o => o !== e && g.E[o].owner === p);
  });
}
export const settleSpots = (g: GameState, p: number, setup: boolean): number[] => g.V.filter(v => canSettle(g, v.id, p, setup)).map(v => v.id);
export const roadSpots = (g: GameState, p: number): number[] => g.E.filter(e => canRoad(g, e.id, p)).map(e => e.id);
export const citySpots = (g: GameState, p: number): number[] => g.V.filter(v => v.owner === p && !v.city).map(v => v.id);
export const enemyGyms = (g: GameState, p: number): number[] => g.V.filter(v => v.owner !== null && v.owner !== p).map(v => v.id);
export const canEvolve = (g: GameState, p: number): boolean => !g.players[p].mon && RES.some(r => g.players[p].res[r] >= 3);

export function longestRoad(g: GameState, p: number): number {
  let best = 0;
  const dfs = (v: number, used: Set<number>, len: number): void => {
    best = Math.max(best, len); const x = g.V[v];
    if (len > 0 && x.owner !== null && x.owner !== p) return;
    for (const eid of x.edges) {
      const e = g.E[eid];
      if (e.owner === p && !used.has(eid)) { used.add(eid); dfs(e.a === v ? e.b : e.a, used, len + 1); used.delete(eid); }
    }
  };
  g.E.forEach(e => { if (e.owner === p) { dfs(e.a, new Set(), 0); dfs(e.b, new Set(), 0); } });
  return best;
}
/** 最長の道（5本以上）の持ち主を更新する。並んだ場合は今の持ち主のまま */
export function updateLR(g: GameState): void {
  g.lens = g.players.map((_, i) => longestRoad(g, i));
  let h = g.lr; if (h !== null && g.lens[h] < 5) h = null;
  g.players.forEach((_, i) => { if (g.lens[i] >= 5 && (h === null || g.lens[i] > g.lens[h])) h = i; });
  if (h !== g.lr && h !== null) log(g, `${g.players[h].name}が最長の道を獲得（+2点）`);
  g.lr = h;
}
/** 10点に達した人がいればゲーム終了にして true を返す */
export function checkWin(g: GameState): boolean {
  for (let i = 0; i < g.players.length; i++) if (vp(g, i) >= GOAL) {
    g.phase = 'over'; g.winner = i; g.busy = false;
    return true;
  }
  return false;
}

export function placeSettlement(g: GameState, v: number, p: number): void { g.V[v].owner = p; g.lastSettle = v; updateLR(g); }
export function placeRoad(g: GameState, e: number, p: number): void { g.E[e].owner = p; updateLR(g); }
export function giveInitial(g: GameState, v: number, p: number): void {
  const got: Resource[] = [];
  g.V[v].hexes.forEach(h => { const t = g.hexes[h].type; if (t !== 'desert') { g.players[p].res[t]++; got.push(t); } });
  log(g, `${g.players[p].name}：初期資源 ${got.map(t => ICON[t]).join('') || 'なし'}`);
}
/** 同じ資源3枚でモフルを進化させる */
export function evolve(g: GameState, p: number, r: Resource): void {
  const pl = g.players[p]; pl.res[r] -= 3; pl.mon = r;
  log(g, `${pl.name}のモフルが${monName(r)}（${TYPE_JA[r]}）に進化！`);
}

/** サイコロを振って結果を反映する */
export function roll(g: GameState, rng: Rng = defaultRng): void {
  applyRoll(g, die(rng), die(rng), rng);
}
/** 出目 a, b を反映する（7なら手札8枚以上は半分捨ててバトル判定、それ以外は資源の産出） */
export function applyRoll(g: GameState, a: number, b: number, rng: Rng = defaultRng): void {
  const s = a + b;
  g.dice = [a, b]; const p = g.cur, pl = g.players[p];
  if (s === 7) {
    log(g, `${pl.name}が🎲7！`);
    g.players.forEach(q => {
      const n = total(q); if (n > 7) {
        const d = Math.floor(n / 2);
        for (let k = 0; k < d; k++) { const pool = RES.flatMap(r => Array<Resource>(q.res[r]).fill(r)); q.res[pool[Math.floor(rng() * pool.length)]]--; }
        log(g, `${q.name}は手札が多いので${d}枚捨てた`);
      }
    });
    if (!pl.mon) { log(g, `${pl.name}のモフルは進化前なのでバトルなし`); g.phase = 'main'; }
    else if (!enemyGyms(g, p).length) { log(g, '挑戦できるジムがない'); g.phase = 'main'; }
    else g.phase = 'battle';
  } else {
    const gains: Partial<Record<Resource, number>>[] = g.players.map(() => ({}));
    g.hexes.forEach(h => {
      if (h.num !== s || h.type === 'desert') return;
      const t = h.type;
      h.verts.forEach(v => { const x = g.V[v]; if (x.owner !== null) { const n = x.city ? 2 : 1; g.players[x.owner].res[t] += n; gains[x.owner][t] = (gains[x.owner][t] || 0) + n; } });
    });
    const parts = gains.map((gn, i) => { const t = (Object.entries(gn) as [Resource, number][]).map(([r, n]) => ICON[r] + (n > 1 ? '×' + n : '')).join(''); return t ? `${g.players[i].name}${t}` : ''; }).filter(Boolean);
    log(g, `🎲${s}：${parts.join('、') || '収穫なし'}`);
    g.phase = 'main';
  }
}

/** 次の人の番へ進める */
export function advanceTurn(g: GameState): void {
  g.cur = (g.cur + 1) % g.players.length; g.phase = 'roll'; g.busy = false;
}
/** 初期配置が全員分終わっていれば本編を始めて true を返す */
export function finishSetupIfDone(g: GameState): boolean {
  if (g.setupIdx < g.order.length) return false;
  g.phase = 'roll'; g.cur = 0; g.lastSettle = null; g.busy = false; log(g, `準備完了。${g.players[0].name}から始めます`);
  return true;
}
