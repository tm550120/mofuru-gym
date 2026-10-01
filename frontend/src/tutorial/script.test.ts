import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_CPU } from '../app/save';
import { act, newGame, setDirector } from '../app/session';
import { app } from '../app/state';
import { applyAction } from '../game/actions';
import { winProb } from '../game/battle';
import { canRoad, canSettle, citySpots, total, vp } from '../game/rules';
import type { GameState } from '../game/types';
import { fakeStorage } from '../testStorage';
import { BATTLE_DICE, BATTLE_GYM, CHAPTERS, CITY_GYM, DICE, GYM1, GYM2, GYM3, ME, ROAD1, ROAD3, SEATS, SEQ, STEPS, boardRng, makeDirector, type Step } from './script';

/* 台本を、画面なしで本物の進行（app/session）とルール（game/）に通す。
   CPU の待ち時間は偽のタイマーで進める */
let ls: Storage;
const SAVED = '{"keep":"me"}';

function start(): GameState {
  app.mode = 'tutorial'; app.me = ME;
  setDirector(makeDirector());
  newGame(SEATS, SEQ, boardRng());
  return app.G!;
}
/** 手順を1つ進める：tap は操作を送り、wait は CPU の動きが終わるまで時間を進める */
async function run(g: GameState, s: Step): Promise<void> {
  if (s.action) expect(act(ME, s.action), `合法な操作のはず: ${s.text}`).toBe(true);
  if (s.kind === 'wait') {
    for (let i = 0; i < 400 && !s.done!(g); i++) await vi.advanceTimersByTimeAsync(250);
  }
  if (s.done) expect(s.done(g), `済んだことになるはず: ${s.text}`).toBe(true);
}

beforeEach(() => {
  vi.useFakeTimers();
  ls = fakeStorage({ [SAVE_CPU]: SAVED, 'mofuru-speed': 'fast' });
  vi.stubGlobal('localStorage', ls);
});
afterEach(() => {
  app.G = null; app.mode = null; setDirector(null);
  vi.useRealTimers(); vi.unstubAllGlobals();
});

describe('ガイド付きチュートリアルの台本', () => {
  it('success: すべての手順が本物のルールで合法で、最後まで通る。説明どおりの結果になる', async () => {
    const g = start();
    for (const s of STEPS) {
      await run(g, s);
      const me = g.players[ME], a = s.after;
      if (!a) continue;
      if (a.res) expect(me.res, s.text).toEqual(a.res);
      if (a.vp !== undefined) expect(vp(g, ME), s.text).toBe(a.vp);
      if (a.mon !== undefined) expect(me.mon, s.text).toBe(a.mon);
      if (a.badges !== undefined) expect(me.badges, s.text).toBe(a.badges);
      if (a.log) expect(g.log.slice(0, 6).some(l => l.includes(a.log!)), `${s.text} / ${g.log.slice(0, 6).join(' | ')}`).toBe(true);
    }
    expect(g.phase).not.toBe('over');
    expect(g.rollN).toBe(DICE.length);
    expect(g.players.map(p => p.name)).toEqual(['あなた', 'CPU 青', 'CPU 橙']);
  });

  it('success: サイコロは台本の順に、台本の人が振る', async () => {
    const g = start();
    const seen: [number, number, number][] = [];
    let n = 0;
    const watch = (): void => { if (g.rollN > n) { n = g.rollN; seen.push([g.cur, g.dice[0], g.dice[1]]); } };
    for (const s of STEPS) {
      if (s.action) { act(ME, s.action); watch(); }
      if (s.kind === 'wait') for (let i = 0; i < 400 && !s.done!(g); i++) { await vi.advanceTimersByTimeAsync(250); watch(); }
    }
    expect(seen).toEqual(DICE);
  });

  it('success: 説明文で言っている場面の中身（置ける場所・捨て札・バトル）が実際の状態と合っている', async () => {
    const g = start();
    const at = (pred: (s: Step) => boolean): number => { const i = STEPS.findIndex(pred); expect(i).toBeGreaterThanOrEqual(0); return i; };
    const upTo = async (i: number, from: number): Promise<void> => { for (let k = from; k < i; k++) await run(g, STEPS[k]); };

    /* 最初のジムは 🌲5・🧱5・🧱12、2つ目は 🌾9・🪨3・🪨4 に接する */
    const land = (v: number): string[] => g.V[v].hexes.map(h => g.hexes[h].type + g.hexes[h].num).sort();
    expect(land(GYM1)).toEqual(['brick12', 'brick5', 'wood5']);
    expect(land(GYM2)).toEqual(['ore3', 'ore4', 'wheat9']);
    expect(land(GYM3)).toEqual(['brick12', 'brick8', 'sheep10']);

    /* 道を建てる手順：その辺に置ける */
    const iRoad = at(s => s.action?.t === 'road' && s.action.e === ROAD3);
    await upTo(iRoad, 0);
    expect(g.phase).toBe('main');
    expect(canRoad(g, ROAD3, ME)).toBe(true);

    /* ジムを建てる手順：道の先で、ほかの建物から離れている */
    const iGym = at(s => s.action?.t === 'settle' && s.action.v === GYM3);
    await upTo(iGym, iRoad);
    expect(canSettle(g, GYM3, ME, false)).toBe(true);
    expect(g.log.some(l => l.includes('交換成立：あなたの🪨とCPU 青の🧱'))).toBe(true);

    /* 7 を振る直前：CPU 橙は10枚（半分の5枚を捨てる）、あなたは5枚、CPU 青は7枚以下 */
    const iSeven = at(s => s.action?.t === 'roll' && s.ch === 9);
    await upTo(iSeven, iGym);
    expect(g.players.map(total)).toEqual([5, 6, 10]);
    await run(g, STEPS[iSeven]);
    expect(g.dice[0] + g.dice[1]).toBe(7);
    expect(g.phase).toBe('battle');
    expect(g.players.map(total)).toEqual([5, 6, 5]);

    /* バトル：あなたは草（進化+2）、CPU 青は進化前。5+2 対 2 であなたの勝ち、🌲を奪う */
    expect(Math.round(winProb(g, ME, BATTLE_GYM) * 100)).toBe(72);
    await run(g, STEPS[iSeven + 1]); await run(g, STEPS[iSeven + 2]);
    const b = g.battle!;
    expect([b.a, b.d, b.ra, b.rd, b.ta, b.td, b.win]).toEqual([ME, 1, BATTLE_DICE[0], BATTLE_DICE[1], 7, 2, ME]);
    expect(b.text).toContain('🌲木材を1枚奪った');
    expect(g.players[ME].mon).toBe('wood');

    /* 都市：自分のジムを都市にできる */
    expect(citySpots(g, ME)).toContain(CITY_GYM);
  });

  it('success: 画面だけの手順（操作を送らない tap）は、対象と「済んだ」の目印を持つ', () => {
    for (const s of STEPS) {
      expect(s.ch).toBeGreaterThanOrEqual(1); expect(s.ch).toBeLessThanOrEqual(CHAPTERS.length);
      if (s.kind === 'tap') { expect(s.target, s.text).toBeTruthy(); expect(!!s.done || !!s.doneSel, s.text).toBe(true); }
      if (s.kind === 'wait') expect(s.done, s.text).toBeTruthy();
    }
    expect(new Set(STEPS.map(s => s.ch)).size).toBe(CHAPTERS.length);
  });

  it('success: 台本にない操作は、本物のルールで弾かれるか、台本の「済んだ」を満たさない', () => {
    const g = start();
    expect(applyAction(g, ME, { t: 'roll' })).toBe(false);
    expect(applyAction(g, ME, { t: 'road', e: 0 })).toBe(false);
    expect(STEPS.find(s => s.kind === 'tap')!.done!(g)).toBe(false);
  });

  it('success: チュートリアルを最後まで進めても、保存データ・設定を書き換えない', async () => {
    const g = start();
    const set = vi.spyOn(ls, 'setItem'), del = vi.spyOn(ls, 'removeItem');
    for (const s of STEPS) await run(g, s);
    expect(set).not.toHaveBeenCalled();
    expect(del).not.toHaveBeenCalled();
    expect(ls.getItem(SAVE_CPU)).toBe(SAVED);
    expect(ls.getItem('mofuru-speed')).toBe('fast');
  });

  it('success: 台本は CPU 対戦では使われない（mode が tutorial のときだけ）', async () => {
    app.mode = 'cpu'; app.me = ME;
    const d = makeDirector();
    const picks = vi.spyOn(d, 'pickSetupSettlement'), rng = vi.fn(d.rng!);
    d.rng = rng;
    setDirector(d);
    newGame(SEATS, SEQ, boardRng());
    const g = app.G!;
    expect(act(ME, { t: 'settle', v: GYM1 })).toBe(true);
    expect(act(ME, { t: 'road', e: ROAD1 })).toBe(true);
    for (let i = 0; i < 400 && !(g.setupIdx === 5 && !g.busy); i++) await vi.advanceTimersByTimeAsync(250);
    /* CPU は本物の思考で置き、通常どおり保存される */
    expect(g.V.filter(v => v.owner === 1 || v.owner === 2).length).toBe(4);
    expect(picks).not.toHaveBeenCalled();
    expect(rng).not.toHaveBeenCalled();
    expect(ls.getItem(SAVE_CPU)).not.toBe(SAVED);
  });
});
