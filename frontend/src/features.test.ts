import { afterEach, describe, expect, it, vi } from 'vitest';
import { clearRetiredFeatures, FEATURES, featureKey, isFeatureId, isFeatureOn, parseFeature, setFeature } from './features';
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
    'success: sound は正式公開したので試験機能ではない': { args: { s: 'sound' }, expected: { want: false } },
    'success: bgm は試験機能': { args: { s: 'bgm' }, expected: { want: true } },
    'success: 登録されていない名前は試験機能ではない': { args: { s: 'music' }, expected: { want: false } },
    'success: 未指定は試験機能ではない': { args: { s: undefined }, expected: { want: false } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(isFeatureId(tt.args.s)).toBe(tt.expected.want); });
  }
});

describe('FEATURES（試験機能の一覧）', () => {
  it('success: BGM だけが試験機能（効果音は正式公開）', () => {
    expect(FEATURES.map(f => f.id)).toEqual(['bgm']);
  });
});

describe('clearRetiredFeatures（使わなくなった試験機能のキーを消す）', () => {
  type setup = { stored: Record<string, string> };
  type expected = { keys: string[] };
  const tests: Record<string, { setup: setup; expected: expected }> = {
    'success: 古い効果音の試験機能のキーを消し、ほかの設定は残す': {
      setup: { stored: { 'mofuru-feature-sound': '1', 'mofuru-feature-bgm': '1', 'mofuru-sound': '0' } },
      expected: { keys: ['mofuru-feature-bgm', 'mofuru-sound'] },
    },
    'success: 古いキーが無くても何もしない': {
      setup: { stored: { 'mofuru-bgm': '1' } }, expected: { keys: ['mofuru-bgm'] },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const ls = fakeStorage(tt.setup.stored);
      vi.stubGlobal('localStorage', ls);
      clearRetiredFeatures();
      expect(Array.from({ length: ls.length }, (_, i) => ls.key(i)).sort()).toEqual(tt.expected.keys);
    });
  }

  it('success: localStorage が使えなくても落ちない', () => {
    const broken = fakeStorage({});
    broken.removeItem = () => { throw new Error('denied'); };
    vi.stubGlobal('localStorage', broken);
    expect(() => clearRetiredFeatures()).not.toThrow();
  });
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
      args: { set: false }, setup: { stored: { 'mofuru-feature-bgm': '1' } }, expected: { on: false, saved: '0' },
    },
    'success: 保存済みのオンを読み込む': {
      args: { set: null }, setup: { stored: { 'mofuru-feature-bgm': '1' } }, expected: { on: true, saved: '1' },
    },
    'success: ユーザーの効果音設定（mofuru-sound）とは別に保存する': {
      args: { set: null }, setup: { stored: { 'mofuru-sound': '1' } }, expected: { on: false, saved: null },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const ls = fakeStorage(tt.setup.stored);
      vi.stubGlobal('localStorage', ls);
      if (tt.args.set !== null) setFeature('bgm', tt.args.set);
      expect(isFeatureOn('bgm')).toBe(tt.expected.on);
      expect(ls.getItem(featureKey('bgm'))).toBe(tt.expected.saved);
    });
  }

  describe('BGM（bgm）', () => {
    type bsetup = { stored: Record<string, string> };
    type bargs = { set: boolean | null };
    type bexpected = { on: boolean; saved: string | null };
    const tests: Record<string, { args: bargs; setup: bsetup; expected: bexpected }> = {
      'success: 何も保存されていなければオフ（初期値）': {
        args: { set: null }, setup: { stored: {} }, expected: { on: false, saved: null },
      },
      'success: オンにすると端末に保存される': {
        args: { set: true }, setup: { stored: {} }, expected: { on: true, saved: '1' },
      },
      'success: オフに戻すと保存される': {
        args: { set: false }, setup: { stored: { 'mofuru-feature-bgm': '1' } }, expected: { on: false, saved: '0' },
      },
      'success: ユーザーの BGM 設定（mofuru-bgm）とは別に保存する': {
        args: { set: null }, setup: { stored: { 'mofuru-bgm': '1' } }, expected: { on: false, saved: null },
      },
    };
    for (const [name, tt] of Object.entries(tests)) {
      it(name, () => {
        const ls = fakeStorage(tt.setup.stored);
        vi.stubGlobal('localStorage', ls);
        if (tt.args.set !== null) setFeature('bgm', tt.args.set);
        expect(isFeatureOn('bgm')).toBe(tt.expected.on);
        expect(ls.getItem(featureKey('bgm'))).toBe(tt.expected.saved);
      });
    }
  });

  it('success: localStorage が使えなくても落ちずにオフ扱い', () => {
    const broken = fakeStorage({});
    broken.getItem = () => { throw new Error('denied'); };
    broken.setItem = () => { throw new Error('denied'); };
    vi.stubGlobal('localStorage', broken);
    expect(() => setFeature('bgm', true)).not.toThrow();
    expect(isFeatureOn('bgm')).toBe(false);
  });
});
