/* ゲームの進行（初期配置・ターン・CPU の手番）。ホスト／CPU対戦の端末で動く。
   描画や通信は main.ts で hooks に差し込む（このモジュールは DOM に触れない） */
import { applyAction } from '../game/actions';
import { battle } from '../game/battle';
import { advanceTurn, checkWin, createGame, finishSetupIfDone, giveInitial, isCpu, log, placeRoad, placeSettlement, roll } from '../game/rules';
import type { Action, Seat } from '../game/types';
import { aiAct, pickBattleTarget, pickSetupRoad, pickSetupSettlement } from '../cpu/ai';
import { app } from './state';

export const hooks = {
  /** 画面を描き直す */
  render: (): void => {},
  /** （ホスト）全員へ状態を送る */
  broadcast: (): void => {},
  /** （ゲスト）ホストへ操作を送る */
  sendAction: (_a: Action): void => {},
  /** 新しいゲームを始めるときに、この端末の表示状態を初期化する */
  resetLocalUI: (): void => {},
  /** バトル演出が閉じられるまで待つ */
  waitBattleClosed: (): Promise<void> => Promise.resolve(),
};

export const sleep = (ms: number): Promise<void> => new Promise(r => setTimeout(r, ms));

/** 状態を変えたら呼ぶ：ホストなら全員へ送信し、描画する */
export function update(): void { if (app.mode === 'host') hooks.broadcast(); hooks.render(); }

/** seats: 席0から順番 */
export function newGame(seats: Seat[]): void {
  app.G = createGame(seats);
  hooks.resetLocalUI();
  void stepSetup();
}

/** 人間プレイヤー（この端末 or リモート）の操作を検証して実行する */
export function act(p: number, a: Action): boolean {
  const r = applyAction(app.G, p, a);
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
  return !!G && G.cur === app.me && !G.busy && !app.pending && G.phase !== 'over' && !isCpu(G, app.me);
};

/* ---------- flow ---------- */
export async function stepSetup(): Promise<void> {
  const g = app.G; if (!g) return;
  const n = g.players.length;
  if (finishSetupIfDone(g)) {
    if (isCpu(g, 0)) void aiTurn(0); else update(); return;
  }
  const p = g.order[g.setupIdx]; g.cur = p;
  if (!isCpu(g, p)) { g.busy = false; update(); return; }
  g.busy = true; update(); await sleep(650); if (app.G !== g) return;
  if (g.setupStep === 'settlement') {
    const v = pickSetupSettlement(g, p);
    placeSettlement(g, v, p); if (g.setupIdx >= n) giveInitial(g, v, p); else log(g, `${g.players[p].name}がジムを置いた`);
    g.setupStep = 'road'; update(); await sleep(450); if (app.G !== g) return;
  }
  placeRoad(g, pickSetupRoad(g, p), p);
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
/** 途中から CPU に交代した席でも続きから動けるようにする */
export function resumeCpu(p: number): void {
  const g = app.G;
  if (!g || g.phase === 'over' || g.cur !== p || g.busy) return;
  if (g.phase === 'setup') void stepSetup(); else void aiTurn(p);
}

/* CPU の手番でバトル演出の終わりを待つ（オンラインでは他の人を待たせないよう一定時間） */
function battleWait(): Promise<void> {
  if (app.mode !== 'cpu') return sleep(3000);
  return hooks.waitBattleClosed();
}

export async function aiTurn(p: number): Promise<void> {
  const g = app.G; if (!g) return;
  g.busy = true; update(); await sleep(700); if (app.G !== g || g.cur !== p) return;
  if (g.phase === 'roll') { roll(g); update(); await sleep(800); if (app.G !== g) return; }
  if (g.phase === 'battle') {
    const best = pickBattleTarget(g, p);
    if (best !== null) {
      battle(g, p, best); g.phase = 'main'; if (checkWin(g)) { update(); return; } update();
      await battleWait(); if (app.G !== g) return;
    } else { log(g, `${g.players[p].name}は挑戦を見送った`); g.phase = 'main'; }
    update(); await sleep(500); if (app.G !== g) return;
  }
  for (let i = 0; i < 14; i++) {
    if (!aiAct(g, p)) break;
    if (checkWin(g)) { update(); return; } update();
    await sleep(700); if (app.G !== g) return;
  }
  g.busy = false; endTurn();
}
