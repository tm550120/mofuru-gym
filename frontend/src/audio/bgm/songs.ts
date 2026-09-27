/* BGM の曲データ（このゲームのためのオリジナル曲。チップチューン風：矩形波・三角波・ノイズ）
 * 記法は music.ts を参照。1小節 = 4拍。 */
import type { Song } from './music';

export type TrackId = 'title' | 'game' | 'battle';

/** タイトル：ゆったり（ヘ長調・84 BPM・8分音符・8小節 ≒ 23秒） */
const title: Song = {
  bpm: 84, stepsPerBeat: 2, leadWave: 'triangle', gain: 1,
  lead: [
    'A4 - C5 - F5 - E5 D5', // F
    'C5 - - - A4 - - -', // Dm
    'Bb4 - D5 - F5 - G5 F5', // Bb
    'E5 - - - C5 - - -', // C
    'A4 - C5 - F5 - A5 G5', // F
    'E5 - - - C5 - D5 E5', // Am
    'D5 - C5 Bb4 C5 - E5 -', // Bb C
    'F5 - - - - - . .', // F
  ],
  bass: [
    'F2 - C3 - F2 - C3 -',
    'D3 - A2 - D3 - A2 -',
    'Bb2 - F3 - Bb2 - F3 -',
    'C3 - G2 - C3 - G2 -',
    'F2 - C3 - F2 - C3 -',
    'A2 - E3 - A2 - E3 -',
    'Bb2 - F3 - C3 - G2 -',
    'F2 - C3 - F2 - - -',
  ],
  drums: [
    'k . h . . . h .', 'k . h . . . h .', 'k . h . . . h .', 'k . h . . . h .',
    'k . h . . . h .', 'k . h . . . h .', 'k . h . . . h .', 'k . h . . . . .',
  ],
};

/** ゲーム中（島の開拓）：明るく中くらいの速さ（ハ長調・112 BPM・8分音符・8小節 ≒ 17秒） */
const game: Song = {
  bpm: 112, stepsPerBeat: 2, leadWave: 'square', gain: .8,
  lead: [
    'E5 G5 C6 - G5 - E5 G5', // C
    'D5 - G5 - B5 - A5 G5', // G
    'A5 - E5 - C5 E5 A5 -', // Am
    'F5 - A5 - G5 F5 E5 D5', // F
    'E5 G5 C6 - G5 - E5 C5', // C
    'D5 - B4 - D5 G5 F5 D5', // G
    'C5 - F5 E5 D5 - B4 D5', // F G
    'C5 - E5 - C5 - . .', // C
  ],
  bass: [
    'C3 . C4 . C3 . C4 .',
    'G2 . G3 . G2 . G3 .',
    'A2 . A3 . A2 . A3 .',
    'F2 . F3 . F2 . F3 .',
    'C3 . C4 . C3 . C4 .',
    'G2 . G3 . G2 . G3 .',
    'F2 . F3 . G2 . G3 .',
    'C3 . G2 . C3 - . .',
  ],
  drums: [
    'k . h . s . h h', 'k . h . s . h h', 'k . h . s . h h', 'k . h . s . h h',
    'k . h . s . h h', 'k . h . s . h h', 'k . h . s . h h', 'k . h . s . s s',
  ],
};

/** ジムバトル：速くて緊張感がありつつ楽しい（イ短調・150 BPM・16分音符・12小節 ≒ 19秒）。効果音が聞こえるよう少し小さめ */
const battleBass = (lo: string, hi: string): string => `${lo} . ${hi} . `.repeat(4).trim();
const battle: Song = {
  bpm: 150, stepsPerBeat: 4, leadWave: 'square', gain: .7,
  lead: [
    'A4 . C5 . E5 . A5 - G5 - E5 . C5 . E5 .', // Am
    'F5 - - . E5 . C5 . A4 . C5 . F5 . E5 .', // F
    'D5 - - . G5 - - . B5 - A5 . G5 . D5 .', // G
    'E5 - - - G#5 - - - B5 - - - G#5 . E5 .', // E
    'A4 . C5 . E5 . A5 - G5 - E5 . C5 . E5 .', // Am
    'F5 - - . E5 . C5 . A4 . C5 . F5 . E5 .', // F
    'F5 - - . D5 . F5 . A5 - - . G5 . F5 .', // Dm
    'E5 . G#5 . B5 . E6 - - - D6 . B5 . G#5 .', // E
    'C6 - A5 - F5 - A5 - C6 - - - A5 . C6 .', // F
    'D6 - B5 - G5 - B5 - D6 - - - B5 . G5 .', // G
    'E6 - - . C6 . A5 . E6 - - . D6 . C6 .', // Am
    'B5 - - - G#5 - - - E5 - - - . . . .', // E
  ],
  bass: [
    battleBass('A2', 'A3'), battleBass('F2', 'F3'), battleBass('G2', 'G3'), battleBass('E2', 'E3'),
    battleBass('A2', 'A3'), battleBass('F2', 'F3'), battleBass('D2', 'D3'), battleBass('E2', 'E3'),
    battleBass('F2', 'F3'), battleBass('G2', 'G3'), battleBass('A2', 'A3'), 'E2 . E3 . E2 . E3 . E2 . E2 . E2 - - .',
  ],
  drums: [
    ...Array<string>(11).fill('k . h . s . h . k k h . s . h h'),
    'k . h . s . h . k . s . s s s s',
  ],
};

export const SONGS: Record<TrackId, Song> = { title, game, battle };

export const TRACK_IDS = Object.keys(SONGS) as TrackId[];
