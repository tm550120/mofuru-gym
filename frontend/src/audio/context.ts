/* 効果音と BGM で共有する AudioContext と、音量のバス（効果音用・BGM 用）
 * AudioContext は必要になったときに1つだけ作る。使えない環境では null を返す（例外を投げない）。 */

type Ctor = typeof AudioContext;
let ctx: AudioContext | null = null;
let failed = false;
const buses: Partial<Record<Bus, GainNode>> = {};

export type Bus = 'sfx' | 'bgm';
/** バスごとの音量。BGM は効果音よりはっきり小さくする */
export const BUS_GAIN: Record<Bus, number> = { sfx: .3, bgm: .12 };

/** AudioContext を返す（なければ作る） */
export function getCtx(): AudioContext | null {
  if (ctx || failed) return ctx;
  try {
    const w = window as unknown as { AudioContext?: Ctor; webkitAudioContext?: Ctor };
    const C = w.AudioContext || w.webkitAudioContext;
    if (!C) { failed = true; return null; }
    ctx = new C();
  } catch { failed = true; ctx = null; }
  return ctx;
}

/** すでに作られている AudioContext（作らない） */
export const peekCtx = (): AudioContext | null => ctx;

/** バスのゲイン（なければ作って出力につなぐ） */
export function bus(kind: Bus): GainNode | null {
  const c = getCtx(); if (!c) return null;
  let g = buses[kind];
  if (!g) {
    try { g = c.createGain(); g.gain.value = BUS_GAIN[kind]; g.connect(c.destination); buses[kind] = g; }
    catch { return null; }
  }
  return g;
}

/** 止まっていれば再開を試みる */
export function resumeCtx(c: AudioContext): void {
  try { if (c.state === 'suspended') c.resume().catch(() => {}); } catch { /* 無視 */ }
}

/** 効果音のあいだ BGM を小さくする割合と、戻るまでの秒数 */
const DUCK_LEVEL = .35, DUCK_HOLD = 1.1;
/** 効果音を鳴らすときに呼ぶ：BGM を少しのあいだ小さくして、効果音が聞こえるようにする（BGM が無ければ何もしない） */
export function duckBgm(): void {
  const g = buses.bgm; if (!ctx || !g) return;
  try {
    const now = ctx.currentTime, p = g.gain;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(BUS_GAIN.bgm * DUCK_LEVEL, now, .03);
    p.setTargetAtTime(BUS_GAIN.bgm, now + DUCK_HOLD, .25);
  } catch { /* 無視 */ }
}

/* ---- 最初のユーザー操作で音を出せるようにする（スマホの自動再生制限対策） ---- */
let listening = false, unlocked = false;
const waiting: (() => void)[] = [];
const EVS = ['pointerdown', 'touchend', 'keydown'] as const;

/** 最初のユーザー操作があったか */
export const gestureDone = (): boolean => unlocked;

/**
 * 最初のユーザー操作で AudioContext を作って再開する。再開できたらリスナーを外す。
 * 何度呼んでもリスナーは1組だけ。onUnlocked は最初の操作のあとに1回呼ぶ（すでに操作済みならすぐ呼ぶ）。
 */
export function unlockOnGesture(onUnlocked?: () => void): void {
  if (onUnlocked) { if (unlocked) onUnlocked(); else waiting.push(onUnlocked); }
  if (listening) return;
  listening = true;
  const off = (): void => EVS.forEach(e => document.removeEventListener(e, unlock, true));
  function unlock(): void {
    const first = !unlocked; unlocked = true;
    const c = getCtx();
    if (c) {
      try {
        // iOS Safari はユーザー操作中に1回鳴らすと解除される（無音の短いバッファ）
        const src = c.createBufferSource(); src.buffer = c.createBuffer(1, 1, 22050); src.connect(c.destination); src.start(0);
        if (c.state === 'running') off();
        else c.resume().then(() => { if (c.state === 'running') off(); }).catch(() => {});
      } catch { /* 無視 */ }
    } else off();
    if (first) waiting.splice(0).forEach(f => { try { f(); } catch { /* 無視 */ } });
  }
  EVS.forEach(e => document.addEventListener(e, unlock, true));
}
