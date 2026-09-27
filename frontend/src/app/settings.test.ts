import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeStorage } from '../testStorage';
import { parseBgm, parseSound } from './settings';

/** localStorage を差し替えてから settings を読み込み直す（起動時の読み込みを再現） */
async function loadSettings(ls: Storage) {
  vi.stubGlobal('localStorage', ls);
  vi.resetModules();
  return import('./settings');
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('parseSound（保存値 → 効果音ON/OFF）', () => {
  const tests: Record<string, { args: { s: string }; expected: { want: boolean } }> = {
    'success: 未設定（初回）はON': { args: { s: '' }, expected: { want: true } },
    'success: "1" はON': { args: { s: '1' }, expected: { want: true } },
    'success: "0" はOFF': { args: { s: '0' }, expected: { want: false } },
    'success: 不明な値はONに戻す': { args: { s: 'xyz' }, expected: { want: true } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(parseSound(tt.args.s)).toBe(tt.expected.want); });
  }
});

describe('parseBgm（保存値 → BGM ON/OFF）', () => {
  const tests: Record<string, { args: { s: string }; expected: { want: boolean } }> = {
    'success: 未設定（初回）はON': { args: { s: '' }, expected: { want: true } },
    'success: "1" はON': { args: { s: '1' }, expected: { want: true } },
    'success: "0" はOFF': { args: { s: '0' }, expected: { want: false } },
    'success: 不明な値はONに戻す': { args: { s: 'xyz' }, expected: { want: true } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(parseBgm(tt.args.s)).toBe(tt.expected.want); });
  }
});

describe('BGM の設定の保存と読み込み', () => {
  type setup = { stored: Record<string, string> };
  type args = { set: boolean | null };
  type expected = { bgm: boolean; saved: string | null; reloaded: boolean; sound: boolean };
  const tests: Record<string, { args: args; setup: setup; expected: expected }> = {
    'success: 何も保存されていなければON': {
      args: { set: null }, setup: { stored: {} }, expected: { bgm: true, saved: null, reloaded: true, sound: true },
    },
    'success: OFFにすると保存され、次回起動時もOFF': {
      args: { set: false }, setup: { stored: {} }, expected: { bgm: false, saved: '0', reloaded: false, sound: true },
    },
    'success: OFFから再びONにすると保存され、次回起動時もON': {
      args: { set: true }, setup: { stored: { 'mofuru-bgm': '0' } }, expected: { bgm: true, saved: '1', reloaded: true, sound: true },
    },
    'success: 効果音の設定とは別（効果音OFFでもBGMはON）': {
      args: { set: null }, setup: { stored: { 'mofuru-sound': '0' } }, expected: { bgm: true, saved: null, reloaded: true, sound: false },
    },
    'success: BGMをOFFにしても効果音の設定は変わらない': {
      args: { set: false }, setup: { stored: { 'mofuru-sound': '1' } }, expected: { bgm: false, saved: '0', reloaded: false, sound: true },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, async () => {
      const ls = fakeStorage(tt.setup.stored);
      const m = await loadSettings(ls);
      if (tt.args.set !== null) m.setBgm(tt.args.set);
      expect(m.settings.bgm).toBe(tt.expected.bgm);
      expect(m.settings.sound).toBe(tt.expected.sound);
      expect(ls.getItem('mofuru-bgm')).toBe(tt.expected.saved);
      const again = await loadSettings(ls);
      expect(again.settings.bgm).toBe(tt.expected.reloaded);
    });
  }

  it('success: 「設定を初期化」で消すキーに BGM も含まれる', async () => {
    const m = await loadSettings(fakeStorage({}));
    expect(m.SETTING_KEYS).toContain('mofuru-bgm');
  });
});

describe('効果音の設定の保存と読み込み', () => {
  type setup = { stored: Record<string, string> };
  type args = { set: boolean | null };
  type expected = { sound: boolean; saved: string | null; reloaded: boolean };
  const tests: Record<string, { args: args; setup: setup; expected: expected }> = {
    'success: 何も保存されていなければON': {
      args: { set: null }, setup: { stored: {} }, expected: { sound: true, saved: null, reloaded: true },
    },
    'success: OFFにすると保存され、次回起動時もOFF': {
      args: { set: false }, setup: { stored: {} }, expected: { sound: false, saved: '0', reloaded: false },
    },
    'success: OFFから再びONにすると保存され、次回起動時もON': {
      args: { set: true }, setup: { stored: { 'mofuru-sound': '0' } }, expected: { sound: true, saved: '1', reloaded: true },
    },
    'success: 保存済みのOFFを起動時に読み込む': {
      args: { set: null }, setup: { stored: { 'mofuru-sound': '0' } }, expected: { sound: false, saved: '0', reloaded: false },
    },
    'success: ほかの設定（進行スピード）は変わらない': {
      args: { set: false }, setup: { stored: { 'mofuru-speed': 'fast' } }, expected: { sound: false, saved: '0', reloaded: false },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, async () => {
      const ls = fakeStorage(tt.setup.stored);
      const m = await loadSettings(ls);
      if (tt.args.set !== null) m.setSound(tt.args.set);
      expect(m.settings.sound).toBe(tt.expected.sound);
      expect(ls.getItem('mofuru-sound')).toBe(tt.expected.saved);
      if (tt.setup.stored['mofuru-speed']) expect(m.settings.speed).toBe(tt.setup.stored['mofuru-speed']);
      const again = await loadSettings(ls);
      expect(again.settings.sound).toBe(tt.expected.reloaded);
    });
  }

  it('success: localStorage が使えなくても落ちずにONのまま動く', async () => {
    const broken = fakeStorage({});
    broken.getItem = () => { throw new Error('denied'); };
    broken.setItem = () => { throw new Error('denied'); };
    const m = await loadSettings(broken);
    expect(m.settings.sound).toBe(true);
    expect(() => m.setSound(false)).not.toThrow();
    expect(m.settings.sound).toBe(false);
  });
});
