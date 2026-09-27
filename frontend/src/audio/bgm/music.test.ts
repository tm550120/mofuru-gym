import { describe, expect, it } from 'vitest';
import { compileSong, loopSeconds, loopSteps, nextStepAt, noteFreq, parseLine, stepDuration, stepTime, type Song } from './music';
import { SONGS, TRACK_IDS } from './songs';

describe('noteFreq（音名 → 周波数）', () => {
  const tests: Record<string, { args: { name: string }; expected: { want: number | null } }> = {
    'success: A4 は 440Hz': { args: { name: 'A4' }, expected: { want: 440 } },
    'success: A5 は1オクターブ上で 880Hz': { args: { name: 'A5' }, expected: { want: 880 } },
    'success: A3 は1オクターブ下で 220Hz': { args: { name: 'A3' }, expected: { want: 220 } },
    'success: C4（中央のド）は約 261.63Hz': { args: { name: 'C4' }, expected: { want: 261.626 } },
    'success: シャープ（F#4）は約 369.99Hz': { args: { name: 'F#4' }, expected: { want: 369.994 } },
    'success: フラット（Bb3）は A#3 と同じ約 233.08Hz': { args: { name: 'Bb3' }, expected: { want: 233.082 } },
    'success: 読めない音名は null': { args: { name: 'H4' }, expected: { want: null } },
    'success: オクターブが無いと null': { args: { name: 'C' }, expected: { want: null } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const got = noteFreq(tt.args.name);
      if (tt.expected.want === null) expect(got).toBeNull();
      else expect(got).toBeCloseTo(tt.expected.want, 2);
    });
  }
});

describe('stepDuration（1ステップの秒数）', () => {
  const tests: Record<string, { args: { bpm: number; spb: number }; expected: { want: number } }> = {
    'success: 120 BPM の8分音符は 0.25 秒': { args: { bpm: 120, spb: 2 }, expected: { want: .25 } },
    'success: 150 BPM の16分音符は 0.1 秒': { args: { bpm: 150, spb: 4 }, expected: { want: .1 } },
    'success: 60 BPM の4分音符は 1 秒': { args: { bpm: 60, spb: 1 }, expected: { want: 1 } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(stepDuration(tt.args.bpm, tt.args.spb)).toBeCloseTo(tt.expected.want, 10); });
  }
});

describe('stepTime / nextStepAt（ステップの時刻）', () => {
  it('success: 時刻は開始時刻＋ステップ数×長さで、何ステップ進めてもずれない', () => {
    expect(stepTime(2, 0, .1)).toBe(2);
    expect(stepTime(2, 1000, .1)).toBeCloseTo(102, 10);
  });
  const tests: Record<string, { args: { now: number; start: number; dur: number }; expected: { want: number } }> = {
    'success: 開始前なら0番目から': { args: { now: 1, start: 2, dur: .25 }, expected: { want: 0 } },
    'success: ちょうど拍の上ならそのステップ': { args: { now: 3, start: 2, dur: .25 }, expected: { want: 4 } },
    'success: 拍の途中なら次のステップ': { args: { now: 3.1, start: 2, dur: .25 }, expected: { want: 5 } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(nextStepAt(tt.args.now, tt.args.start, tt.args.dur)).toBe(tt.expected.want); });
  }
});

describe('parseLine（楽譜 → ステップごとの音）', () => {
  it('success: 音符は後ろの「-」の数だけ長くなり、休符と「-」は音を出さない', () => {
    const got = parseLine('lead', ['C5 - - . E5', 'G5 -']);
    expect(got.length).toBe(7);
    expect(got[0]).toEqual({ ch: 'lead', freq: noteFreq('C5'), len: 3 });
    expect(got[1]).toBeNull(); expect(got[3]).toBeNull();
    expect(got[4]).toEqual({ ch: 'lead', freq: noteFreq('E5'), len: 1 });
    expect(got[5]).toEqual({ ch: 'lead', freq: noteFreq('G5'), len: 2 });
  });
  it('success: 打楽器はキック・スネア・ハイハット', () => {
    expect(parseLine('drums', ['k . s h'])).toEqual([{ ch: 'drums', drum: 'k' }, null, { ch: 'drums', drum: 's' }, { ch: 'drums', drum: 'h' }]);
  });
  const tests: Record<string, { args: { ch: 'lead' | 'drums'; line: string }; expected: { msg: string } }> = {
    'failed: 読めない音名': { args: { ch: 'lead', line: 'C5 X9' }, expected: { msg: '音名が読めません: X9' } },
    'failed: 打楽器に音名を書いた': { args: { ch: 'drums', line: 'k C5' }, expected: { msg: '打楽器の記号が読めません: C5' } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(() => parseLine(tt.args.ch, [tt.args.line])).toThrow(tt.expected.msg); });
  }
});

describe('compileSong / loopSteps / loopSeconds（1周の長さ）', () => {
  const song = (bass: string): Song => ({
    bpm: 120, stepsPerBeat: 2, leadWave: 'square', gain: 1,
    lead: ['C5 - E5 .'], bass: [bass], drums: ['k . s .'],
  });
  it('success: 4ステップ・120 BPM の8分音符なら1周 1 秒', () => {
    const s = song('C3 . G2 .');
    expect(loopSteps(s)).toBe(4);
    expect(loopSeconds(s)).toBeCloseTo(1, 10);
    const ev = compileSong(s);
    expect(ev.length).toBe(4);
    expect(ev[0].map(e => e.ch)).toEqual(['lead', 'bass', 'drums']);
    expect(ev[3]).toEqual([]);
  });
  it('failed: チャンネルの長さがそろっていない', () => {
    expect(() => compileSong(song('C3 . G2'))).toThrow('bass の長さ 3 が旋律の長さ 4 と違います');
  });
});

describe('曲データ（SONGS）', () => {
  type expected = { minBpm: number; maxBpm: number };
  const tests: Record<string, { args: { id: (typeof TRACK_IDS)[number] }; expected: expected }> = {
    'success: タイトルはゆったり': { args: { id: 'title' }, expected: { minBpm: 70, maxBpm: 95 } },
    'success: ゲーム中は中くらいの速さ': { args: { id: 'game' }, expected: { minBpm: 100, maxBpm: 130 } },
    'success: ジムバトルは速い': { args: { id: 'battle' }, expected: { minBpm: 140, maxBpm: 180 } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const s = SONGS[tt.args.id];
      expect(() => compileSong(s)).not.toThrow();
      expect(s.bpm).toBeGreaterThanOrEqual(tt.expected.minBpm);
      expect(s.bpm).toBeLessThanOrEqual(tt.expected.maxBpm);
      // 1周は 15〜30 秒、小節（4拍）の区切りでループする
      expect(loopSeconds(s)).toBeGreaterThanOrEqual(15);
      expect(loopSeconds(s)).toBeLessThanOrEqual(30);
      expect(loopSteps(s) % (s.stepsPerBeat * 4)).toBe(0);
    });
  }
  it('success: 3曲そろっている', () => { expect(TRACK_IDS).toEqual(['title', 'game', 'battle']); });
});
