/* 効果音（Web Audio API で合成。音声ファイルは使わない）
 * 試験機能（features.ts の 'sound'）がオフの端末では一切鳴らさず、AudioContext も作らない。
 * AudioContext は BGM と共有（context.ts）。使えない環境では何もしない（例外を投げない）。 */
import { settings } from '../app/settings';
import { isFeatureOn } from '../features';
import { bus, duckBgm, getCtx, resumeCtx, unlockOnGesture } from './context';
import type { BattleSound } from './outcome';

let preview = false;
/** 管理ページ（テスト台）用：試験機能・ユーザー設定に関係なく鳴らす */
export function setSoundPreview(on: boolean): void { preview = on; }

/** 効果音を鳴らしてよいか：試験機能がオンかつユーザー設定がオン。管理ページのプレビュー中は常に鳴らす */
export const soundAllowed = (feature: boolean, userOn: boolean, previewOn: boolean): boolean => previewOn || (feature && userOn);

/** いまこの端末で効果音を鳴らしてよいか */
export const canPlaySound = (): boolean => soundAllowed(isFeatureOn('sound'), settings.sound, preview);

/** 鳴らせる状態の AudioContext（鳴らさない設定・使えない・閉じているなら null） */
function ready(): AudioContext | null {
  if (!canPlaySound()) return null;
  const c = getCtx(); if (!c || !bus('sfx')) return null;
  resumeCtx(c);
  if (c.state === 'closed') return null;
  // BGM が流れていれば少し小さくして、効果音を聞こえやすくする
  duckBgm();
  return c;
}

/** 1音：周波数 f を t 秒後から len 秒（短いアタック＋減衰）。slideTo を渡すと音程を滑らせる */
function tone(c: AudioContext, f: number, t: number, len: number, type: OscillatorType = 'square', vol = .5, slideTo?: number): void {
  try {
    const o = c.createOscillator(), g = c.createGain(), s = c.currentTime + t;
    o.type = type; o.frequency.setValueAtTime(f, s);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, s + len);
    g.gain.setValueAtTime(0, s);
    g.gain.linearRampToValueAtTime(vol, s + .008);
    g.gain.setValueAtTime(vol, s + len * .6);
    g.gain.exponentialRampToValueAtTime(.0001, s + len);
    o.connect(g); g.connect(bus('sfx')!);
    o.start(s); o.stop(s + len + .02);
  } catch { /* 鳴らせなくても続行 */ }
}

/** 半音数 → 周波数（A4=440Hz からの半音数） */
const hz = (n: number): number => 440 * Math.pow(2, n / 12);
const G4 = hz(-2), C5 = hz(3), E5 = hz(7), G5 = hz(10), A5 = hz(12), C6 = hz(15), E6 = hz(19), G6 = hz(22), C7 = hz(27);

/** バトル開始：短い上昇アルペジオ */
export function sfxBattleStart(): void {
  const c = ready(); if (!c) return;
  [G4, C5, E5, G5].forEach((f, i) => tone(c, f, i * .055, .09, 'square', .32));
  tone(c, C6, .22, .18, 'square', .28);
}

let lastTick = 0;
/** サイコロを振っている間のカラカラ音（演出の1コマごとに呼ぶ） */
export function sfxDiceTick(): void {
  const c = ready(); if (!c) return;
  const now = performance.now(); if (now - lastTick < 40) return; lastTick = now;
  const f = 700 + Math.random() * 500;
  tone(c, f, 0, .035, 'triangle', .35, f * .6);
}

/** 勝ち：明るいジングル */
function win(c: AudioContext): void {
  [C6, E6, G6].forEach((f, i) => tone(c, f, i * .09, .1, 'square', .28));
  tone(c, C7, .27, .12, 'square', .28);
  tone(c, G6, .4, .09, 'square', .24);
  tone(c, C7, .5, .38, 'square', .28);
  tone(c, C5, .5, .38, 'triangle', .4);
}
/** 負け：下がっていく音 */
function lose(c: AudioContext): void {
  [hz(-2), hz(-3), hz(-4)].forEach((f, i) => tone(c, f, i * .17, .15, 'square', .26));
  tone(c, hz(-5), .51, .5, 'square', .26, hz(-9));
}
/** 観戦：結果が出たことを知らせる短いチャイム */
function watch(c: AudioContext): void {
  tone(c, E5, 0, .12, 'triangle', .45);
  tone(c, A5, .1, .28, 'triangle', .45);
}

/** バトル結果の効果音 */
export function sfxResult(kind: BattleSound): void {
  const c = ready(); if (!c) return;
  if (kind === 'win') win(c); else if (kind === 'lose') lose(c); else watch(c);
}

/**
 * スマホの自動再生制限対策：最初のユーザー操作で AudioContext を作って再開する（context.ts）。
 * 試験機能がオフの端末では何もしない。
 */
export function initAudioUnlock(): void {
  // 試験機能がオフなら AudioContext を作らない（リスナーも付けない）
  if (!preview && !isFeatureOn('sound')) return;
  unlockOnGesture();
}
