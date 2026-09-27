import { afterEach, describe, expect, it, vi } from 'vitest';
import { featureKey, isFeatureId, isFeatureOn, parseFeature, setFeature } from './features';
import { fakeStorage } from './testStorage';

afterEach(() => { vi.unstubAllGlobals(); });

describe('parseFeature（保存値 → 試験機能のオン／オフ）', () => {
  const tests: Record<string, { args: { s: string }; expected: { want: boolean } }> = {
    'success: 未設定（初期値）はオフ': { args: { s: '' }, expected: { want: false } },
    'success: "1" はオン': { args: { s: '1' }, expected: { want: true } },
    'success: "0" はオフ': { args: { s: '0' }, expected: { want: false } },
    'success: 不明な値はオフ': { args: { s: 'true' }, expected: { want: false } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(parseFeature(tt.args.s)).toBe(tt.expected.want); });
  }
});

describe('isFeatureId', () => {
  const tests: Record<string, { args: { s: string | undefined }; expected: { want: boolean } }> = {
    'success: sound は試験機能': { args: { s: 'sound' }, expected: { want: true } },
    'success: 登録されていない名前は試験機能ではない': { args: { s: 'music' }, expected: { want: false } },
    'success: 未指定は試験機能ではない': { args: { s: undefined }, expected: { want: false } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(isFeatureId(tt.args.s)).toBe(tt.expected.want); });
  }
});

describe('試験機能の保存と読み込み', () => {
  type setup = { stored: Record<string, string> };
  type args = { set: boolean | null };
  type expected = { on: boolean; saved: string | null };
  const tests: Record<string, { args: args; setup: setup; expected: expected }> = {
    'success: 何も保存されていなければオフ': {
      args: { set: null }, setup: { stored: {} }, expected: { on: false, saved: null },
    },
    'success: オンにすると端末に保存される': {
      args: { set: true }, setup: { stored: {} }, expected: { on: true, saved: '1' },
    },
    'success: オンからオフに戻すと保存される': {
      args: { set: false }, setup: { stored: { 'mofuru-feature-sound': '1' } }, expected: { on: false, saved: '0' },
    },
    'success: 保存済みのオンを読み込む': {
      args: { set: null }, setup: { stored: { 'mofuru-feature-sound': '1' } }, expected: { on: true, saved: '1' },
    },
    'success: ユーザーの効果音設定（mofuru-sound）とは別に保存する': {
      args: { set: null }, setup: { stored: { 'mofuru-sound': '1' } }, expected: { on: false, saved: null },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const ls = fakeStorage(tt.setup.stored);
      vi.stubGlobal('localStorage', ls);
      if (tt.args.set !== null) setFeature('sound', tt.args.set);
      expect(isFeatureOn('sound')).toBe(tt.expected.on);
      expect(ls.getItem(featureKey('sound'))).toBe(tt.expected.saved);
    });
  }

  it('success: localStorage が使えなくても落ちずにオフ扱い', () => {
    const broken = fakeStorage({});
    broken.getItem = () => { throw new Error('denied'); };
    broken.setItem = () => { throw new Error('denied'); };
    vi.stubGlobal('localStorage', broken);
    expect(() => setFeature('sound', true)).not.toThrow();
    expect(isFeatureOn('sound')).toBe(false);
  });
});
