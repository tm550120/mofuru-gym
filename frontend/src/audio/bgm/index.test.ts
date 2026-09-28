import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '../../testStorage';
import { bgmAllowed } from '.';

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('bgmAllowed（BGM を流してよいか）', () => {
  type args = { feature: boolean; userOn: boolean };
  const tests: Record<string, { args: args; expected: { want: boolean } }> = {
    'success: 試験機能オン・BGMオンなら流す': { args: { feature: true, userOn: true }, expected: { want: true } },
    'success: 試験機能オフならBGMオンでも流さない': { args: { feature: false, userOn: true }, expected: { want: false } },
    'success: 試験機能オンでもBGMオフなら流さない': { args: { feature: true, userOn: false }, expected: { want: false } },
    'success: どちらもオフなら流さない': { args: { feature: false, userOn: false }, expected: { want: false } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(bgmAllowed(tt.args.feature, tt.args.userOn)).toBe(tt.expected.want); });
  }
});

/** 呼ばれた回数だけ数える AudioContext の代わり */
function fakeAudio() {
  const count = { ctx: 0, osc: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
  class FakeCtx {
    state = 'running'; currentTime = 0; destination = {}; sampleRate = 8000;
    constructor() { count.ctx++; }
    createGain() { return { gain: param(), connect() {}, disconnect() {} }; }
    createOscillator() { count.osc++; return { type: 'square', frequency: param(), connect() {}, start() {}, stop() {} }; }
    createBiquadFilter() { return { type: 'lowpass', frequency: param(), connect() {} }; }
    createBuffer(_c: number, n: number) { return { getChannelData: () => new Float32Array(n) }; }
    createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
    resume() { return Promise.resolve(); }
  }
  return { count, FakeCtx };
}

describe('BGM の起動（試験機能・ユーザー設定による抑止）', () => {
  type setup = { stored: Record<string, string> };
  type expected = { listeners: string[]; ctx: number; played: boolean };
  const gesture = ['pointerdown', 'touchend', 'keydown'];
  const tests: Record<string, { setup: setup; expected: expected }> = {
    'success: 試験機能オン・BGMオンなら、最初の操作のあとにタイトルの曲を流す': {
      setup: { stored: { 'mofuru-feature-bgm': '1' } }, expected: { listeners: [...gesture, 'visibilitychange'], ctx: 1, played: true },
    },
    'success: 試験機能が未設定（初期値）ならリスナーも AudioContext も作らない': {
      setup: { stored: {} }, expected: { listeners: [], ctx: 0, played: false },
    },
    'success: 古い効果音の試験機能のキー（mofuru-feature-sound）が残っていても BGM は流さない': {
      setup: { stored: { 'mofuru-feature-sound': '1', 'mofuru-bgm': '1' } }, expected: { listeners: [], ctx: 0, played: false },
    },
    'success: 試験機能オンでも BGM オフなら流さない': {
      setup: { stored: { 'mofuru-feature-bgm': '1', 'mofuru-bgm': '0' } }, expected: { listeners: [...gesture, 'visibilitychange'], ctx: 1, played: false },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, async () => {
      vi.useFakeTimers();
      const { count, FakeCtx } = fakeAudio();
      const handlers = new Map<string, () => void>();
      const addEventListener = vi.fn((e: string, f: () => void) => { handlers.set(e, f); });
      vi.stubGlobal('localStorage', fakeStorage(tt.setup.stored));
      vi.stubGlobal('window', { AudioContext: FakeCtx });
      vi.stubGlobal('document', { hidden: false, addEventListener, removeEventListener: vi.fn() });
      vi.resetModules();
      const m = await import('.');
      m.initBgm();
      m.setBgmScene('title');
      // 操作前は何も作らない（自動再生しない）
      expect(count.ctx).toBe(0);
      handlers.get('pointerdown')?.();
      expect(addEventListener.mock.calls.map(c => c[0])).toEqual(tt.expected.listeners);
      expect(count.ctx).toBe(tt.expected.ctx);
      expect(count.osc > 0).toBe(tt.expected.played);
    });
  }
});
