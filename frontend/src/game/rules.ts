/* ゲームのルール（DOM に依存しない純粋なロジック）。状態 g を直接書き換える */
import { makeBoard } from './board';
import { COLORS, COST, GOAL, ICON, MON_NAME, RES, TYPE_JA } from './constants';
import { defaultRng, die, shuffle } from './random';
import type { BuildKind, Bundle, GameState, Mon, OfferTarget, Player, Resource, Rng, Seat } from './types';

export const monName = (m: Mon | undefined): string => MON_NAME[m || 'none'];

/** ログを追加する（新しい順に最大40件） */
export function log(g: GameState, t: string): void { g.log.unshift(t); g.log = g.log.slice(0, 40); g.logN = (g.logN || 0) + 1; }

/** 資源の組を「🌲×2🧱」のような表示にする */
export const fmtRes = (o: Bundle | null | undefined): string => RES.filter(r => o && o[r]).map(r => ICON[r] + (o![r]! > 1 ? '×' + o![r] : '')).join('') || 'なし';
export const sumRes = (o: Bundle | null | undefined): number => RES.reduce((s, r) => s + ((o && o[r]) || 0), 0);

/** 手番の順が席番号の並べ替えになっていれば true */
const isPermutation = (seq: readonly number[] | undefined, n: number): seq is number[] =>
  !!seq && seq.length === n && [...seq].sort((a, b) => a - b).every((x, i) => x === i);

/**
 * CPU 対戦の手番の順。o はあなた（席0）が何番目か：'1'|'2'|'3'、'r' はランダム。
 * 席0=あなた、席1,2=CPU
 */
export type CpuOrder = '1' | '2' | '3' | 'r';
export function cpuSeq(o: CpuOrder, rng: Rng = defaultRng): number[] {
  if (o === '2') return [1, 0, 2];
  if (o === '3') return [1, 2, 0];
  if (o === 'r') return shuffle([0, 1, 2], rng);
  return [0, 1, 2];
}

/** 新しいゲーム状態を作る（初期配置フェーズから）。seq は手番の順（席番号の配列、不正なら席順） */
export function createGame(seats: Seat[], seq?: number[], rng: Rng = defaultRng): GameState {
  const b = makeBoard(rng), idx = seats.map((_, i) => i);
  const order = isPermutation(seq, idx.length) ? seq.slice() : idx.slice();
  const g: GameState = {
    ...b, gid: Date.now() + '-' + rng().toString(36).slice(2, 6),
    players: seats.map((s, i) => ({ name: s.name, type: s.type, color: COLORS[i], mon: null, badges: 0, disconnected: false, res: { wood: 0, brick: 0, sheep: 0, wheat: 0, ore: 0 } })),
    seq: order.slice(), cur: order[0], phase: 'setup', setupStep: 'settlement', order: [...order, ...order.slice().reverse()], setupIdx: 0, lastSettle: null,
    dice: [1, 1], rollN: 0, lr: null, champ: null, lens: idx.map(() => 0), busy: false, log: [], logN: 0, battle: null, winner: null,
    discard: null, afterDiscard: null, offer: null, offerN: 0, turnN: 0, cpuTradeTurn: -1,
  };
  log(g, `手番：${order.map(i => g.players[i].name).join(' → ')}`);
  log(g, '島が見つかった。最初のジムを置こう');
  return g;
}

export const isCpu = (g: GameState, p: number): boolean => !!g.players[p] && g.players[p].type === 'cpu';
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

/**
 * 最長の道：自分のジム/都市から、別の自分のジム/都市まで、自分の道だけで途切れずにつながった道の本数（最大）。
 * 同じ道は2回通らない。途中に相手の建物があると途切れる。両端がジムでない道は数えない（0）。
 */
export function longestRoad(g: GameState, p: number): number {
  let best = 0;
  const dfs = (start: number, v: number, used: Set<number>, len: number): void => {
    const x = g.V[v];
    if (len > 0 && x.owner === p && v !== start) best = Math.max(best, len);
    if (len > 0 && x.owner !== null && x.owner !== p) return;
    for (const eid of x.edges) {
      const e = g.E[eid];
      if (e.owner === p && !used.has(eid)) { used.add(eid); dfs(start, e.a === v ? e.b : e.a, used, len + 1); used.delete(eid); }
    }
  };
  g.V.forEach(v => { if (v.owner === p) dfs(v.id, v.id, new Set(), 0); });
  return best;
}
/** CPU の作戦用：両端を問わない道の長さ（相手の建物で途切れる） */
export function rawRoad(g: GameState, p: number): number {
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

/**
 * 7のときに CPU が捨てる処理（席 i が d 枚）。CPU の思考は cpu/ai.ts にあるので、呼び出し側から渡す。
 * 渡されなければ CPU も人間と同じく discard フェーズで待つ（進行側が後から処理する）
 */
export type CpuDiscard = (g: GameState, i: number, d: number) => void;

/** サイコロを振って結果を反映する */
export function roll(g: GameState, rng: Rng = defaultRng, cpuDiscard?: CpuDiscard): void {
  applyRoll(g, die(rng), die(rng), cpuDiscard);
}
/**
 * 出目 a, b を反映する。
 * 7なら手札8枚以上の人は半分（切り捨て）を捨てる：CPU はその場で、人間は自分で選ぶ（全員終わるまで discard フェーズ）。
 * その後、出した人が進化済みで相手のジムがあればバトル。7以外は資源の産出
 */
export function applyRoll(g: GameState, a: number, b: number, cpuDiscard?: CpuDiscard): void {
  const s = a + b;
  g.dice = [a, b]; g.rollN = (g.rollN || 0) + 1; const p = g.cur, pl = g.players[p];
  if (s === 7) {
    log(g, `🎲7！ ${pl.name}が7を出した`);
    const discard: Record<number, number> = {};
    g.discard = discard;
    g.players.forEach((q, i) => {
      const n = total(q); if (n > 7) {
        const d = Math.floor(n / 2);
        if (isCpu(g, i) && cpuDiscard) cpuDiscard(g, i, d); else discard[i] = d;
      }
    });
    if (!pl.mon) { log(g, `${pl.name}のモフルは進化前なのでバトルなし`); g.afterDiscard = 'main'; }
    else if (!enemyGyms(g, p).length) { log(g, '挑戦できるジムがない'); g.afterDiscard = 'main'; }
    else g.afterDiscard = 'battle';
    const wait = Object.keys(discard).map(Number);
    if (wait.length) { g.phase = 'discard'; log(g, `${wait.map(i => g.players[i].name).join('・')}が捨てる資源を選んでいます`); }
    else { g.discard = null; g.phase = g.afterDiscard; }
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

/** 7のときに、席 p が選んだ資源 sel を捨てる。枚数がちょうどでなければ false */
export function doDiscard(g: GameState, p: number, sel: unknown): boolean {
  if (g.phase !== 'discard' || !g.discard || !g.discard[p] || !sel || typeof sel !== 'object') return false;
  const q = g.players[p], need = g.discard[p], o = sel as Record<string, unknown>;
  for (const r of RES) { const n = o[r] || 0; if (!Number.isInteger(n) || (n as number) < 0 || (n as number) > q.res[r]) return false; }
  const b = sel as Bundle;
  if (sumRes(b) !== need) return false;
  const lost: Bundle = {}; RES.forEach(r => { const n = b[r] || 0; if (n) { q.res[r] -= n; lost[r] = n; } });
  log(g, `${q.name}は${fmtRes(lost)}を捨てた`);
  delete g.discard[p]; finishDiscard(g); return true;
}
/** 全員が捨て終わっていれば、次のフェーズ（バトル or main）へ進める */
export function finishDiscard(g: GameState): void {
  if (g.phase === 'discard' && (!g.discard || !Object.keys(g.discard).length)) { g.discard = null; g.phase = g.afterDiscard || 'main'; }
}

/* ---------- プレイヤー同士の交換 ---------- */
/** 席 p が資源の組 o をすべて持っていれば true */
export const hasRes = (g: GameState, p: number, o: Bundle | null | undefined): boolean => RES.every(r => g.players[p].res[r] >= ((o && o[r]) || 0));
/** リモートから来た資源の組を検証して整える（不正・空なら null） */
export function cleanBundle(o: unknown): Bundle | null {
  if (!o || typeof o !== 'object') return null; const src = o as Record<string, unknown>, r: Bundle = {};
  for (const k of RES) { const v = src[k]; if (v === undefined || v === 0) continue; if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 19) return null; r[k] = v as number; }
  return sumRes(r) ? r : null;
}
/** 席 p が交換を提案する（to: 'all' か席番号）。不正なら false */
export function makeOffer(g: GameState, p: number, to: unknown, giveIn: unknown, wantIn: unknown): boolean {
  const give = cleanBundle(giveIn), want = cleanBundle(wantIn);
  if (!give || !want || RES.some(r => give[r] && want[r]) || !hasRes(g, p, give)) return false;
  let targets: number[];
  if (to === 'all') targets = g.players.map((_, i) => i).filter(i => i !== p);
  else if (Number.isInteger(to) && (to as number) >= 0 && (to as number) < g.players.length && to !== p) targets = [to as number];
  else return false;
  const target = to as OfferTarget;
  g.offerN = (g.offerN || 0) + 1;
  g.offer = { id: g.offerN, from: p, to: target, give, want, resp: Object.fromEntries(targets.map(i => [i, 'pending' as const])) };
  log(g, `🤝 ${g.players[p].name}が${target === 'all' ? 'みんな' : g.players[target].name}に交換を提案：${fmtRes(give)} → ${fmtRes(want)}`);
  return true;
}
/** 席 p が交換の提案に答える。最初に受けた人と成立、全員に断られたら不成立。答えられないときは false */
export function respondOffer(g: GameState, p: number, ok: boolean): boolean {
  const o = g.offer; if (!o || o.resp[p] !== 'pending') return false;
  const q = g.players[p], f = g.players[o.from];
  if (ok) {
    if (!hasRes(g, p, o.want)) return false;
    if (!hasRes(g, o.from, o.give)) { log(g, `${f.name}の資源が足りないので交換は取り消し`); g.offer = null; return true; }
    RES.forEach(r => { const gv = o.give[r] || 0, w = o.want[r] || 0; f.res[r] += w - gv; q.res[r] += gv - w; });
    log(g, `🤝 交換成立：${f.name}の${fmtRes(o.give)}と${q.name}の${fmtRes(o.want)}`);
    g.offer = null;
  } else {
    o.resp[p] = 'decline'; log(g, `${q.name}は交換を断った`);
    if (Object.values(o.resp).every(x => x === 'decline')) { log(g, '交換は成立しなかった'); g.offer = null; }
  }
  return true;
}
/** 提案者が交換の提案を取り下げる */
export function cancelOffer(g: GameState): void { if (g.offer) { log(g, `${g.players[g.offer.from].name}は交換の提案を取り下げた`); g.offer = null; } }

/** 次の人の番へ進める（手番の順 seq に従う） */
export function advanceTurn(g: GameState): void {
  if (g.offer) cancelOffer(g);
  const i = g.seq.indexOf(g.cur);
  g.cur = g.seq[(i + 1) % g.seq.length]; g.phase = 'roll'; g.busy = false; g.turnN = (g.turnN || 0) + 1;
  log(g, `▶ ${g.players[g.cur].name}の番`);
}
/** 初期配置が全員分終わっていれば本編を始めて true を返す */
export function finishSetupIfDone(g: GameState): boolean {
  if (g.setupIdx < g.order.length) return false;
  const f = g.seq[0];
  g.phase = 'roll'; g.cur = f; g.lastSettle = null; g.busy = false; log(g, `準備完了。${g.players[f].name}から始めます`);
  return true;
}
