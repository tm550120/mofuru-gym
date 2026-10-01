/* ゲームの進行（初期配置・ターン・CPU の手番・CPU の応答）。ホスト／CPU対戦の端末で動く。
   描画や通信は main.ts で hooks に差し込む（このモジュールは DOM に触れない） */
import { applyAction } from '../game/actions';
import { battle } from '../game/battle';
import {
  advanceTurn, cancelOffer, checkWin, createGame, finishDiscard, finishSetupIfDone, giveInitial, isCpu, log, placeRoad, placeSettlement,
  respondOffer, roll, type CpuDiscard,
} from '../game/rules';
import type { Action, GameState, Offer, Rng, Seat } from '../game/types';
import { aiAct, cpuDiscard, cpuLikes, pickBattleTarget, pickSetupRoad, pickSetupSettlement } from '../cpu/ai';
import { saveCpu, type CpuSave } from './save';
import { D } from './settings';
import { app } from './state';

export const hooks = {
  /** 画面を描き直す */
  render: (): void => {},
  /** （ホスト）全員へ状態を送る */
  broadcast: (): void => {},
  /** （ホスト）状態を保存する */
  saveHost: (): void => {},
  /** （ゲスト）ホストへ操作を送る */
  sendAction: (_a: Action): void => {},
  /** 新しいゲームを始めるときに、この端末の表示状態を初期化する */
  resetLocalUI: (): void => {},
  /** 読み込んだ状態から表示を始めるとき：過去の演出を再生しないように表示状態を合わせる */
  adoptLoaded: (): void => {},
  /** バトル演出が閉じられるまで待つ */
  waitBattleClosed: (): Promise<void> => Promise.resolve(),
};

export const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/**
 * 乱数と CPU の行動の差し替え口。通常は本物（Math.random と cpu/ai.ts）を使う。
 * ガイド付きチュートリアル（app.mode === 'tutorial'）のときだけ、setDirector で渡した台本に差し替わる
 */
export interface Director {
  /** サイコロ・バトルの乱数（undefined なら Math.random） */
  rng: Rng | undefined;
  pickSetupSettlement: (g: GameState, p: number) => number;
  pickSetupRoad: (g: GameState, p: number) => number;
  pickBattleTarget: (g: GameState, p: number) => number | null;
  aiAct: (g: GameState, p: number) => boolean;
  cpuLikes: (g: GameState, i: number, o: Offer) => boolean;
  cpuDiscard: CpuDiscard;
}
const realDirector: Director = {
  rng: undefined,
  pickSetupSettlement: (g, p) => pickSetupSettlement(g, p),
  pickSetupRoad: (g, p) => pickSetupRoad(g, p),
  pickBattleTarget: (g, p) => pickBattleTarget(g, p),
  aiAct: (g, p) => aiAct(g, p),
  cpuLikes: (g, i, o) => cpuLikes(g, i, o),
  cpuDiscard: (g, i, d) => cpuDiscard(g, i, d),
};
let scripted: Director | null = null;
/** チュートリアルの台本を渡す（null で外す）。通常プレイ・オンライン対戦では使われない */
export function setDirector(d: Director | null): void { scripted = d; }
const dir = (): Director => (app.mode === 'tutorial' && scripted) || realDirector;
/** この端末だけで進む対戦（CPU 対戦・チュートリアル） */
const isSolo = (): boolean => app.mode === 'cpu' || app.mode === 'tutorial';

/** 7のときの CPU の捨て札（その場で選ぶ） */
const discardNow: CpuDiscard = (g, i, d) => dir().cpuDiscard(g, i, d);

/** 状態は変更のたびに保存するので、リロードしても盤面・サイコロ・バトル結果は変わらない（チュートリアルは保存しない） */
function saveGame(): void {
  const G = app.G; if (!G) return;
  if (app.mode === 'cpu') saveCpu(G, app.me);
  else if (app.mode === 'host') hooks.saveHost();
}
/** 状態を変えたら呼ぶ：保存 → ホストなら全員へ送信 → 描画 → CPUの応答待ちがあれば予約 */
export function update(): void { saveGame(); if (app.mode === 'host') hooks.broadcast(); hooks.render(); scheduleDuties(); }

/** seats: 席0から順番（色は席番号で決まる）。seq: 手番の順（席番号の配列）。rng: 島を作る乱数（省略時は Math.random） */
export function newGame(seats: Seat[], seq?: number[], rng?: Rng): void {
  app.G = createGame(seats, seq, rng);
  hooks.resetLocalUI();
  void stepSetup();
}
/** 保存しておいた CPU 対戦を、同じ盤面・同じ状態から再開する */
export function resumeCpuGame(s: CpuSave): void {
  app.mode = 'cpu'; app.me = s.ME || 0; app.G = s.G;
  hooks.adoptLoaded();
  const G = s.G;
  G.busy = false; if (G.offer) G.offer = null;
  update();
  if (G.phase !== 'over' && isCpu(G, G.cur)) resumeCpu(G.cur);
}

/** 人間プレイヤー（この端末 or リモート）の操作を検証して実行する */
export function act(p: number, a: Action): boolean {
  const r = applyAction(app.G, p, a, dir().rng, discardNow);
  if (!r) return false;
  if (r === 'setup') void stepSetup();
  else if (r === 'turn') startTurn();
  else update();
  return true;
}
/** この端末からの操作：ゲストはホストへ送り、それ以外はその場で実行 */
export function doAction(a: Action): void {
  if (app.mode === 'guest') { app.pending = true; hooks.sendAction(a); hooks.render(); return; }
  act(app.me, a);
}
export const myTurn = (): boolean => {
  const G = app.G;
  return !!G && G.cur === app.me && !G.busy && !app.pending && !G.offer && G.phase !== 'over' && !isCpu(G, app.me);
};

/* ---------- flow ---------- */
/** 条件が満たされるまで待つ（ゲームが入れ替わったら false） */
export function waitFor(g: GameState, cond: () => boolean, timeout?: number): Promise<boolean> {
  return new Promise(res => {
    const t0 = Date.now();
    const tick = (): void => {
      if (app.G !== g) { res(false); return; }
      if (cond()) { res(true); return; }
      if (timeout && Date.now() - t0 > timeout) { res(false); return; }
      setTimeout(tick, 250);
    };
    tick();
  });
}

export async function stepSetup(): Promise<void> {
  const g = app.G; if (!g) return;
  const n = g.players.length;
  if (finishSetupIfDone(g)) {
    if (isCpu(g, g.cur)) void aiTurn(g.cur); else update(); return;
  }
  const p = g.order[g.setupIdx]; g.cur = p;
  if (!isCpu(g, p)) { g.busy = false; update(); return; }
  g.busy = true; update(); await sleep(D(1000)); if (app.G !== g) return;
  if (g.setupStep === 'settlement') {
    const v = dir().pickSetupSettlement(g, p);
    placeSettlement(g, v, p); if (g.setupIdx >= n) giveInitial(g, v, p); else log(g, `${g.players[p].name}がジムを置いた`);
    g.setupStep = 'road'; update(); await sleep(D(900)); if (app.G !== g) return;
  }
  placeRoad(g, dir().pickSetupRoad(g, p), p);
  g.setupIdx++; g.setupStep = 'settlement'; void stepSetup();
}
/** 今の手番の人が CPU なら CPU の手番を始め、そうでなければ描画する */
function startTurn(): void {
  const g = app.G; if (!g) return;
  if (isCpu(g, g.cur)) void aiTurn(g.cur); else update();
}
export function endTurn(): void {
  const g = app.G; if (!g) return;
  advanceTurn(g); startTurn();
}
/** 途中から CPU に交代した席・続きから再開したときでも動けるようにする */
export function resumeCpu(p: number): void {
  const g = app.G;
  if (!g || g.phase === 'over' || g.cur !== p || g.busy) return;
  if (g.phase === 'setup') void stepSetup(); else void aiTurn(p);
}

/* CPU が答える必要のあるもの（交代した席の捨て札、交換の提案への返事）を少し間を置いて1つずつ処理 */
let dutyT: ReturnType<typeof setTimeout> | null = null;
export function clearDuties(): void { if (dutyT) clearTimeout(dutyT); dutyT = null; }
export function scheduleDuties(): void {
  const G = app.G;
  if ((!isSolo() && app.mode !== 'host') || !G || dutyT || G.phase === 'over') return;
  const disc = G.phase === 'discard' && !!G.discard && Object.keys(G.discard).some(i => isCpu(G, +i));
  const off = !!G.offer && Object.keys(G.offer.resp).some(i => G.offer!.resp[+i] === 'pending' && isCpu(G, +i));
  if (!disc && !off) return;
  const g = G;
  dutyT = setTimeout(() => {
    dutyT = null; if (app.G !== g) return;
    if (g.phase === 'discard' && g.discard) {
      const dc = g.discard, i = Object.keys(dc).map(Number).find(k => isCpu(g, k));
      if (i !== undefined) { dir().cpuDiscard(g, i, dc[i]); delete dc[i]; finishDiscard(g); update(); return; }
    }
    if (g.offer) {
      const o = g.offer, i = Object.keys(o.resp).map(Number).find(k => o.resp[k] === 'pending' && isCpu(g, k));
      if (i !== undefined) { respondOffer(g, i, dir().cpuLikes(g, i, o)); update(); return; }
    }
    scheduleDuties();
  }, D(1100));
}

/* CPU の手番でバトル演出の終わりを待つ（オンラインでは他の人を待たせないよう一定時間） */
function battleWait(): Promise<void> {
  if (!isSolo()) return sleep(D(3000));
  return hooks.waitBattleClosed();
}

export async function aiTurn(p: number): Promise<void> {
  const g = app.G; if (!g) return;
  g.busy = true; update(); await sleep(D(1000)); if (app.G !== g || g.cur !== p) return;
  if (g.phase === 'roll') { roll(g, dir().rng, discardNow); update(); await sleep(D(1500)); if (app.G !== g) return; }
  if (g.phase === 'discard') {
    await waitFor(g, () => g.phase !== 'discard'); if (app.G !== g) return;
    await sleep(D(700)); if (app.G !== g) return;
  }
  if (g.phase === 'battle') {
    const best = dir().pickBattleTarget(g, p);
    if (best !== null) {
      battle(g, p, best, dir().rng); g.phase = 'main'; if (checkWin(g)) { update(); return; } update();
      await battleWait(); if (app.G !== g) return;
    } else { log(g, `${g.players[p].name}は挑戦を見送った`); g.phase = 'main'; }
    update(); await sleep(D(900)); if (app.G !== g) return;
  }
  for (let i = 0; i < 14; i++) {
    if (!dir().aiAct(g, p)) break;
    if (checkWin(g)) { update(); return; } update();
    if (g.offer) {
      const id = g.offer.id;
      await waitFor(g, () => !g.offer || g.offer.id !== id, 45000); if (app.G !== g) return;
      if (g.offer && g.offer.id === id) { cancelOffer(g); update(); }
    }
    await sleep(D(1100)); if (app.G !== g) return;
  }
  await sleep(D(300)); if (app.G !== g) return;
  g.busy = false; endTurn();
}
