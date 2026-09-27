/* BGM のステップシーケンサー（Web Audio API で合成）
 * 短い間隔のタイマーで「少し先（LOOKAHEAD 秒）までの音」を AudioContext の時刻で予約する。
 * 音の時刻は毎回「再生開始時刻＋ステップ数×1ステップの長さ」で計算するので、タイマーの揺れでずれがたまらない。
 * 曲の切り替えは短いクロスフェード。 */
import { bus, getCtx, peekCtx, resumeCtx } from '../context';
import { compileSong, loopSteps, nextStepAt, stepDuration, stepTime, type Drum, type NoteEvent } from './music';
import { SONGS, type TrackId } from './songs';

/** 何秒先まで予約するか・タイマーの間隔（ミリ秒）・クロスフェードの長さ（秒） */
const LOOKAHEAD = .15, TICK_MS = 25, FADE = .8;
/** タイマーがこれ以上遅れたら（バックグラウンドなど）、拍を保ったまま今の時刻へ飛ばす */
const LATE = .1;

type Player = {
  id: TrackId;
  events: NoteEvent[][];
  steps: number;
  dur: number;
  wave: OscillatorType;
  gain: GainNode;
  start: number;
  step: number;
  /** フェードアウト中なら終わる時刻 */
  endAt: number | null;
};

const compiled = new Map<TrackId, NoteEvent[][]>();
const eventsOf = (id: TrackId): NoteEvent[][] => {
  let e = compiled.get(id);
  if (!e) { e = compileSong(SONGS[id]); compiled.set(id, e); }
  return e;
};

let players: Player[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let noise: AudioBuffer | null = null;

function noiseBuffer(c: AudioContext): AudioBuffer {
  if (noise) return noise;
  const b = c.createBuffer(1, c.sampleRate, c.sampleRate), d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return (noise = b);
}

/** 旋律・ベースの1音 */
function note(c: AudioContext, out: GainNode, wave: OscillatorType, f: number, t: number, len: number, vol: number): void {
  const o = c.createOscillator(), g = c.createGain();
  o.type = wave; o.frequency.setValueAtTime(f, t);
  const end = t + Math.max(.05, len * .92);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + .006);
  g.gain.linearRampToValueAtTime(vol * .7, t + Math.min(.08, len / 2));
  g.gain.setValueAtTime(vol * .7, end - .03);
  g.gain.linearRampToValueAtTime(0, end);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(end + .02);
}

/** 打楽器（キックは音程の下がるサイン波、スネアとハイハットはノイズ） */
function drum(c: AudioContext, out: GainNode, d: Drum, t: number): void {
  const g = c.createGain(); g.connect(out);
  if (d === 'k') {
    const o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(45, t + .12);
    g.gain.setValueAtTime(.9, t); g.gain.exponentialRampToValueAtTime(.001, t + .15);
    o.connect(g); o.start(t); o.stop(t + .17);
    return;
  }
  const src = c.createBufferSource(), fl = c.createBiquadFilter();
  src.buffer = noiseBuffer(c);
  const len = d === 's' ? .12 : .04;
  fl.type = d === 's' ? 'bandpass' : 'highpass'; fl.frequency.value = d === 's' ? 1800 : 7000;
  g.gain.setValueAtTime(d === 's' ? .45 : .22, t); g.gain.exponentialRampToValueAtTime(.001, t + len);
  src.connect(fl); fl.connect(g);
  src.start(t, Math.random() * .5, len + .02);
}

function playStep(c: AudioContext, p: Player, i: number, t: number): void {
  const d = p.dur;
  for (const e of p.events[i]) {
    try {
      if (e.ch === 'drums') drum(c, p.gain, e.drum, t);
      else if (e.ch === 'lead') note(c, p.gain, p.wave, e.freq, t, e.len * d, .32);
      else note(c, p.gain, 'triangle', e.freq, t, e.len * d, .55);
    } catch { /* 鳴らせなくても続行 */ }
  }
}

function tick(): void {
  const c = peekCtx(); if (!c) return;
  const now = c.currentTime;
  players = players.filter(p => {
    if (p.endAt !== null && now >= p.endAt) { try { p.gain.disconnect(); } catch { /* 無視 */ } return false; }
    return true;
  });
  for (const p of players) {
    if (stepTime(p.start, p.step, p.dur) < now - LATE) p.step = nextStepAt(now, p.start, p.dur);
    for (let t = stepTime(p.start, p.step, p.dur); t < now + LOOKAHEAD; t = stepTime(p.start, p.step, p.dur)) {
      if (p.endAt !== null && t >= p.endAt) break;
      playStep(c, p, p.step % p.steps, t);
      p.step++;
    }
  }
  if (!players.length && timer) { clearInterval(timer); timer = null; }
}

function fadeOut(p: Player, now: number): void {
  if (p.endAt !== null) return;
  p.endAt = now + FADE;
  try {
    const g = p.gain.gain;
    g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(0, now + FADE);
  } catch { /* 無視 */ }
}

/** いま流れている（フェードアウト中でない）曲 */
export const currentTrack = (): TrackId | null => players.find(p => p.endAt === null)?.id ?? null;

/**
 * 曲を切り替える（null で止める）。同じ曲が流れていれば何もしない。
 * 止めるだけのときは AudioContext を新しく作らない。
 */
export function playTrack(id: TrackId | null): void {
  if (id === currentTrack()) return;
  const c = id ? getCtx() : peekCtx(); if (!c) return;
  const now = c.currentTime;
  players.forEach(p => fadeOut(p, now));
  if (id) {
    const out = bus('bgm'); if (!out) return;
    resumeCtx(c);
    try {
      const song = SONGS[id], gain = c.createGain();
      gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(song.gain, now + FADE);
      gain.connect(out);
      players.push({
        id, events: eventsOf(id), steps: loopSteps(song), dur: stepDuration(song.bpm, song.stepsPerBeat), wave: song.leadWave,
        gain, start: now + .05, step: 0, endAt: null,
      });
    } catch { /* 鳴らせなくても続行 */ }
  }
  if (!timer && players.length) timer = setInterval(tick, TICK_MS);
  tick();
}
