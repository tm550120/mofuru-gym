import { afterEach, describe, expect, it, vi } from 'vitest';
import { featureListHtml, NO_FEATURES_TEXT } from './admin/featureList';
import { applyFeatureVisibility, clearRetiredFeatures, FEATURES, featureKey, isFeatureId, isFeatureOn, parseFeature, setFeature } from './features';
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
    'success: bgm は正式公開したので試験機能ではない': { args: { s: 'bgm' }, expected: { want: false } },
    'success: 登録されていない名前は試験機能ではない': { args: { s: 'music' }, expected: { want: false } },
    'success: 未指定は試験機能ではない': { args: { s: undefined }, expected: { want: false } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(isFeatureId(tt.args.s)).toBe(tt.expected.want); });
  }
});

describe('FEATURES（試験機能の一覧）', () => {
  it('success: いまは試験中の機能は無い（効果音・BGM は正式公開）', () => {
    expect(FEATURES).toEqual([]);
  });
});

describe('clearRetiredFeatures（使わなくなった試験機能のキーを消す）', () => {
  type setup = { stored: Record<string, string> };
  type expected = { keys: string[] };
  const tests: Record<string, { setup: setup; expected: expected }> = {
    'success: 古い効果音・BGM の試験機能のキーを消し、ユーザー設定は残す': {
      setup: { stored: { 'mofuru-feature-sound': '1', 'mofuru-feature-bgm': '1', 'mofuru-sound': '0', 'mofuru-bgm': '0' } },
      expected: { keys: ['mofuru-bgm', 'mofuru-sound'] },
    },
    'success: 古い BGM のキーだけでも消す': {
      setup: { stored: { 'mofuru-feature-bgm': '0' } }, expected: { keys: [] },
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

describe('試験機能の保存と読み込み（今後の試験用の仕組み）', () => {
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
      args: { set: false }, setup: { stored: { 'mofuru-feature-demo': '1' } }, expected: { on: false, saved: '0' },
    },
    'success: 保存済みのオンを読み込む': {
      args: { set: null }, setup: { stored: { 'mofuru-feature-demo': '1' } }, expected: { on: true, saved: '1' },
    },
    'success: ユーザーの効果音・BGM 設定とは別に保存する': {
      args: { set: null }, setup: { stored: { 'mofuru-sound': '1', 'mofuru-bgm': '1' } }, expected: { on: false, saved: null },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const ls = fakeStorage(tt.setup.stored);
      vi.stubGlobal('localStorage', ls);
      if (tt.args.set !== null) setFeature('demo', tt.args.set);
      expect(isFeatureOn('demo')).toBe(tt.expected.on);
      expect(ls.getItem(featureKey('demo'))).toBe(tt.expected.saved);
    });
  }

  it('success: localStorage が使えなくても落ちずにオフ扱い', () => {
    const broken = fakeStorage({});
    broken.getItem = () => { throw new Error('denied'); };
    broken.setItem = () => { throw new Error('denied'); };
    vi.stubGlobal('localStorage', broken);
    expect(() => setFeature('demo', true)).not.toThrow();
    expect(isFeatureOn('demo')).toBe(false);
  });
});

describe('applyFeatureVisibility（data-feature の要素の表示）', () => {
  type setup = { stored: Record<string, string>; ids: (string | undefined)[] };
  const tests: Record<string, { setup: setup; expected: { hidden: boolean[] } }> = {
    'success: 登録されていない（正式公開した）機能の要素は、古いキーがオンでも隠す': {
      setup: { stored: { 'mofuru-feature-sound': '1', 'mofuru-feature-bgm': '1' }, ids: ['sound', 'bgm', undefined] },
      expected: { hidden: [true, true, true] },
    },
    'success: data-feature の要素が無ければ何もしない': {
      setup: { stored: {}, ids: [] }, expected: { hidden: [] },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      vi.stubGlobal('localStorage', fakeStorage(tt.setup.stored));
      const els = tt.setup.ids.map(id => ({ dataset: { feature: id }, hidden: false }));
      const root = { querySelectorAll: () => els } as unknown as ParentNode;
      applyFeatureVisibility(root);
      expect(els.map(e => e.hidden)).toEqual(tt.expected.hidden);
    });
  }
});

describe('featureListHtml（管理ページの試験機能の一覧）', () => {
  type args = { list: { id: string; name: string; desc: string }[]; on: string[] };
  type expected = { contains: string[]; notContains: string[] };
  const tests: Record<string, { args: args; expected: expected }> = {
    'success: 試験機能が無ければ「試験中の機能はありません」と出す': {
      args: { list: [], on: [] }, expected: { contains: [NO_FEATURES_TEXT], notContains: ['data-feat'] },
    },
    'success: 試験機能があればオン／オフの切り替えを出す（オンの状態を反映）': {
      args: { list: [{ id: 'demo', name: 'デモ<b>', desc: '説明' }], on: ['demo'] },
      expected: { contains: ['data-feat="demo"', 'デモ&lt;b&gt;', 'data-on="1" class="sel" aria-pressed="true"'], notContains: [NO_FEATURES_TEXT] },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const html = featureListHtml(tt.args.list, id => tt.args.on.includes(id));
      tt.expected.contains.forEach(t => expect(html).toContain(t));
      tt.expected.notContains.forEach(t => expect(html).not.toContain(t));
    });
  }
});
