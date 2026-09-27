import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '../testStorage';
import { soundAllowed } from './sfx';

afterEach(() => { vi.unstubAllGlobals(); });

describe('soundAllowed（効果音を鳴らしてよいか）', () => {
  type args = { feature: boolean; userOn: boolean; preview: boolean };
  const tests: Record<string, { args: args; expected: { want: boolean } }> = {
    'success: 試験機能オン・効果音オンなら鳴らす': { args: { feature: true, userOn: true, preview: false }, expected: { want: true } },
    'success: 試験機能オフなら効果音オンでも鳴らさない': { args: { feature: false, userOn: true, preview: false }, expected: { want: false } },
    'success: 試験機能オンでも効果音オフなら鳴らさない': { args: { feature: true, userOn: false, preview: false }, expected: { want: false } },
    'success: どちらもオフなら鳴らさない': { args: { feature: false, userOn: false, preview: false }, expected: { want: false } },
    'success: 管理ページのプレビュー中は設定に関係なく鳴らす': { args: { feature: false, userOn: false, preview: true }, expected: { want: true } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(soundAllowed(tt.args.feature, tt.args.userOn, tt.args.preview)).toBe(tt.expected.want); });
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

describe('効果音の呼び出し（試験機能・ユーザー設定による抑止）', () => {
  type setup = { stored: Record<string, string>; preview: boolean };
  type expected = { ctx: number; played: boolean; listeners: number };
  const on = { 'mofuru-feature-sound': '1' };
  const tests: Record<string, { setup: setup; expected: expected }> = {
    'success: 試験機能オン・効果音オンなら AudioContext を1つ作って鳴らす': {
      setup: { stored: { ...on }, preview: false }, expected: { ctx: 1, played: true, listeners: 3 },
    },
    'success: 試験機能が未設定（初期値）なら鳴らさず AudioContext も作らない': {
      setup: { stored: {}, preview: false }, expected: { ctx: 0, played: false, listeners: 0 },
    },
    'success: 試験機能オフならユーザー設定がオンでも鳴らさない': {
      setup: { stored: { 'mofuru-feature-sound': '0', 'mofuru-sound': '1' }, preview: false }, expected: { ctx: 0, played: false, listeners: 0 },
    },
    'success: 試験機能オンでも効果音オフなら鳴らさない（タップ時の準備だけ登録）': {
      setup: { stored: { ...on, 'mofuru-sound': '0' }, preview: false }, expected: { ctx: 0, played: false, listeners: 3 },
    },
    'success: 管理ページのプレビュー中は試験機能オフでも鳴らす': {
      setup: { stored: {}, preview: true }, expected: { ctx: 1, played: true, listeners: 3 },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, async () => {
      const { count, FakeCtx } = fakeAudio();
      const addEventListener = vi.fn();
      vi.stubGlobal('localStorage', fakeStorage(tt.setup.stored));
      vi.stubGlobal('window', { AudioContext: FakeCtx });
      vi.stubGlobal('document', { addEventListener, removeEventListener: vi.fn() });
      vi.resetModules();
      const m = await import('./sfx');
      m.setSoundPreview(tt.setup.preview);
      m.initAudioUnlock();
      m.sfxBattleStart(); m.sfxDiceTick(); m.sfxResult('win'); m.sfxResult('lose'); m.sfxResult('watch');
      expect(count.ctx).toBe(tt.expected.ctx);
      expect(count.osc > 0).toBe(tt.expected.played);
      expect(addEventListener).toHaveBeenCalledTimes(tt.expected.listeners);
    });
  }
});
