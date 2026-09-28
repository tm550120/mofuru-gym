import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '../testStorage';
import { soundAllowed } from './sfx';

afterEach(() => { vi.unstubAllGlobals(); });

describe('soundAllowed（効果音を鳴らしてよいか）', () => {
  type args = { userOn: boolean; preview: boolean };
  const tests: Record<string, { args: args; expected: { want: boolean } }> = {
    'success: 効果音オンなら鳴らす': { args: { userOn: true, preview: false }, expected: { want: true } },
    'success: 効果音オフなら鳴らさない': { args: { userOn: false, preview: false }, expected: { want: false } },
    'success: 管理ページのプレビュー中は効果音オフでも鳴らす': { args: { userOn: false, preview: true }, expected: { want: true } },
    'success: プレビュー中で効果音オンでも鳴らす': { args: { userOn: true, preview: true }, expected: { want: true } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(soundAllowed(tt.args.userOn, tt.args.preview)).toBe(tt.expected.want); });
  }
});

/** 呼ばれた回数だけ数える AudioContext の代わり */
function fakeAudio() {
  const count = { ctx: 0, osc: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {} });
  class FakeCtx {
    state = 'running'; currentTime = 0; destination = {};
    constructor() { count.ctx++; }
    createGain() { return { gain: param(), connect() {} }; }
    createOscillator() { count.osc++; return { type: 'square', frequency: param(), connect() {}, start() {}, stop() {} }; }
    createBuffer() { return {}; }
    createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
    resume() { return Promise.resolve(); }
  }
  return { count, FakeCtx };
}

describe('効果音の呼び出し（ユーザー設定による抑止）', () => {
  type setup = { stored: Record<string, string>; preview: boolean; gesture: boolean };
  type expected = { ctx: number; played: boolean; listeners: number };
  const tests: Record<string, { setup: setup; expected: expected }> = {
    'success: 効果音が未設定（初期値オン）なら、最初の操作のあとに AudioContext を1つ作って鳴らす': {
      setup: { stored: {}, preview: false, gesture: true }, expected: { ctx: 1, played: true, listeners: 3 },
    },
    'success: 最初のユーザー操作の前は鳴らさず AudioContext も作らない': {
      setup: { stored: {}, preview: false, gesture: false }, expected: { ctx: 0, played: false, listeners: 3 },
    },
    'success: 効果音オンなら鳴らす': {
      setup: { stored: { 'mofuru-sound': '1' }, preview: false, gesture: true }, expected: { ctx: 1, played: true, listeners: 3 },
    },
    'success: 効果音オフなら鳴らさず AudioContext も作らない（タップ時の準備だけ登録）': {
      setup: { stored: { 'mofuru-sound': '0' }, preview: false, gesture: false }, expected: { ctx: 0, played: false, listeners: 3 },
    },
    'success: 古い試験機能のキーがオフで残っていても効果音オンなら鳴らす': {
      setup: { stored: { 'mofuru-feature-sound': '0', 'mofuru-sound': '1' }, preview: false, gesture: true }, expected: { ctx: 1, played: true, listeners: 3 },
    },
    'success: 管理ページのプレビュー中は効果音オフでも鳴らす': {
      setup: { stored: { 'mofuru-sound': '0' }, preview: true, gesture: true }, expected: { ctx: 1, played: true, listeners: 3 },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, async () => {
      const { count, FakeCtx } = fakeAudio();
      const handlers = new Map<string, () => void>();
      const addEventListener = vi.fn((e: string, f: () => void) => { handlers.set(e, f); });
      vi.stubGlobal('localStorage', fakeStorage(tt.setup.stored));
      vi.stubGlobal('window', { AudioContext: FakeCtx });
      vi.stubGlobal('document', { addEventListener, removeEventListener: vi.fn() });
      vi.resetModules();
      const m = await import('./sfx');
      m.setSoundPreview(tt.setup.preview);
      m.initAudioUnlock();
      if (tt.setup.gesture) handlers.get('pointerdown')?.();
      m.sfxBattleStart(); m.sfxDiceTick(); m.sfxResult('win'); m.sfxResult('lose'); m.sfxResult('watch');
      expect(count.ctx).toBe(tt.expected.ctx);
      expect(count.osc > 0).toBe(tt.expected.played);
      expect(addEventListener).toHaveBeenCalledTimes(tt.expected.listeners);
    });
  }
});
