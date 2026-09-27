/* BGM の楽譜とタイミングの計算（DOM・音に依存しない）
 *
 * 楽譜は1ステップ1トークンの文字列で書く（空白区切り）。
 *   音符 : 'C5' 'F#4' 'Bb3' など（音名＋オクターブ。A4 = 440Hz）
 *   '.'  : 休符
 *   '-'  : 直前の音をのばす
 *   打楽器: 'k'（キック）'s'（スネア）'h'（ハイハット）
 */

/** 楽器のチャンネル */
export type Channel = 'lead' | 'bass' | 'drums';
export type Drum = 'k' | 's' | 'h';

export type Song = {
  /** テンポ（1分あたりの拍数） */
  bpm: number;
  /** 1拍あたりのステップ数（2 = 8分音符、4 = 16分音符） */
  stepsPerBeat: number;
  /** 各チャンネルの楽譜（小節ごとの文字列の配列。つなげて1周） */
  lead: string[];
  bass: string[];
  drums: string[];
  /** 旋律の音色 */
  leadWave: OscillatorType;
  /** 曲全体の音量（1 が基準） */
  gain: number;
};

/** 1ステップで鳴らす音 */
export type NoteEvent = { ch: 'lead' | 'bass'; freq: number; len: number } | { ch: 'drums'; drum: Drum };

const SEMI: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** 音名 → 周波数（Hz）。読めない音名は null */
export function noteFreq(name: string): number | null {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) return null;
  const semi = SEMI[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
  const midi = (Number(m[3]) + 1) * 12 + semi;
  return 440 * Math.pow(2, (midi - 69) / 12);
}

/** 1ステップの長さ（秒） */
export const stepDuration = (bpm: number, stepsPerBeat: number): number => 60 / bpm / stepsPerBeat;

/** 楽譜（小節の配列）をトークンの列にする */
export const tokens = (bars: string[]): string[] => bars.join(' ').split(/\s+/).filter(Boolean);

/** 1周のステップ数（旋律の長さ） */
export const loopSteps = (song: Song): number => tokens(song.lead).length;

/** 1周の長さ（秒） */
export const loopSeconds = (song: Song): number => loopSteps(song) * stepDuration(song.bpm, song.stepsPerBeat);

/** 再生開始時刻 start から数えて step 番目のステップを鳴らす時刻（毎回 start から計算するのでずれがたまらない） */
export const stepTime = (start: number, step: number, dur: number): number => start + step * dur;

/** 時刻 now 以降で最初に来るステップの番号（タイマーが遅れたときに、拍を保ったまま追いつくため） */
export const nextStepAt = (now: number, start: number, dur: number): number => Math.max(0, Math.ceil((now - start) / dur - 1e-9));

/**
 * 1チャンネルの楽譜を、ステップごとの音にする。
 * 音符は後ろに続く '-' の数だけ長くなる（len はステップ数）。読めないトークンは Error。
 */
export function parseLine(ch: Channel, line: string[]): (NoteEvent | null)[] {
  const t = tokens(line);
  return t.map((tok, i) => {
    if (tok === '.' || tok === '-') return null;
    if (ch === 'drums') {
      if (tok === 'k' || tok === 's' || tok === 'h') return { ch, drum: tok };
      throw new Error(`打楽器の記号が読めません: ${tok}`);
    }
    const freq = noteFreq(tok);
    if (freq === null) throw new Error(`音名が読めません: ${tok}`);
    let len = 1; while (t[i + len] === '-') len++;
    return { ch, freq, len };
  });
}

/** 曲を「ステップごとに鳴らす音の一覧」にする。チャンネルの長さがそろっていなければ Error */
export function compileSong(song: Song): NoteEvent[][] {
  const n = loopSteps(song);
  const lines = (['lead', 'bass', 'drums'] as const).map(ch => {
    const ev = parseLine(ch, song[ch]);
    if (ev.length !== n) throw new Error(`${ch} の長さ ${ev.length} が旋律の長さ ${n} と違います`);
    return ev;
  });
  return [...Array(n)].map((_, i) => lines.map(l => l[i]).filter((e): e is NoteEvent => e !== null));
}
