import { describe, expect, it } from 'vitest';
import { AWAY_STATE, createHomeNav, isAwayState, leaveConfirmText, type HomeNav } from './homeNav';
import type { Mode } from './state';

/** ブラウザの履歴と画面のまねをする（back() の結果の popstate は settle で届ける） */
function fakeHost(init: { stack?: unknown[]; cancel?: boolean } = {}) {
  const stack = init.stack ?? [null];
  const h = {
    stack,
    /** 履歴の中の今の位置 */
    pos: stack.length - 1,
    /** 画面がホームか */
    home: true,
    /** 確認で取り消すか */
    cancel: init.cancel ?? false,
    calls: [] as string[],
    state: (): unknown => h.stack[h.pos],
    push: (): void => { h.calls.push('push'); h.stack = [...h.stack.slice(0, h.pos + 1), AWAY_STATE]; h.pos++; },
    back: (): void => { h.calls.push('back'); },
    atHome: (): boolean => h.home,
    leave: (): void => { h.calls.push('leave'); if (!h.cancel) h.home = true; },
  };
  return h;
}
type Host = ReturnType<typeof fakeHost>;

/** 自分で呼んだ back() が終わって popstate が届く */
const settle = (h: Host, nav: HomeNav): void => { h.pos--; nav.onPop(); };
/** ブラウザの「戻る」「進む」 */
const userBack = (h: Host, nav: HomeNav): void => { h.pos--; nav.onPop(); };
const userForward = (h: Host, nav: HomeNav): void => { h.pos++; nav.onPop(); };
/** 画面を切り替える */
const view = (h: Host, nav: HomeNav, home: boolean): void => { h.home = home; nav.sync(); };

describe('createHomeNav（ホーム基点の履歴）', () => {
  type args = { stack?: unknown[]; cancel?: boolean };
  type setup = { run: (h: Host, nav: HomeNav) => void };
  type expected = { calls: string[]; home: boolean; pos: number; depth: number };
  const tests: Record<string, { args: args; setup: setup; expected: expected }> = {
    'success: ホームのままなら履歴を触らない': {
      args: {}, setup: { run: (h, nav) => { view(h, nav, true); } },
      expected: { calls: [], home: true, pos: 0, depth: 1 },
    },
    'success: ホーム以外の画面に入ると履歴を1つ積む': {
      args: {}, setup: { run: (h, nav) => { view(h, nav, false); } },
      expected: { calls: ['push'], home: false, pos: 1, depth: 2 },
    },
    'success: ホーム以外の画面の中で切り替えても積み重ねない': {
      args: {}, setup: { run: (h, nav) => { view(h, nav, false); view(h, nav, false); view(h, nav, false); } },
      expected: { calls: ['push'], home: false, pos: 1, depth: 2 },
    },
    'success: 画面のボタンでホームへ戻ると積んだ履歴を戻す（確認は呼ばない）': {
      args: {}, setup: { run: (h, nav) => { view(h, nav, false); view(h, nav, true); settle(h, nav); nav.sync(); } },
      expected: { calls: ['push', 'back'], home: true, pos: 0, depth: 2 },
    },
    'success: ブラウザの戻るでホームへ戻す': {
      args: {}, setup: { run: (h, nav) => { view(h, nav, false); userBack(h, nav); } },
      expected: { calls: ['push', 'leave'], home: true, pos: 0, depth: 2 },
    },
    'success: ブラウザの戻るを確認で取り消すと、画面はそのままで履歴を積み直す': {
      args: { cancel: true }, setup: { run: (h, nav) => { view(h, nav, false); userBack(h, nav); } },
      expected: { calls: ['push', 'leave', 'push'], home: false, pos: 1, depth: 2 },
    },
    'success: 戻している途中で別の画面に入ったら、戻り終わってから積み直す': {
      args: {}, setup: { run: (h, nav) => { view(h, nav, false); view(h, nav, true); view(h, nav, false); settle(h, nav); } },
      expected: { calls: ['push', 'back', 'push'], home: false, pos: 1, depth: 2 },
    },
    'success: 進むでホーム以外の履歴に入っても、ホームの履歴へ戻す': {
      args: {}, setup: { run: (h, nav) => { view(h, nav, false); userBack(h, nav); userForward(h, nav); settle(h, nav); } },
      expected: { calls: ['push', 'leave', 'back'], home: true, pos: 0, depth: 2 },
    },
    'success: 印つきの履歴で読み込み直したら（画面はホーム）、ホームの履歴へ戻す': {
      args: { stack: [null, AWAY_STATE] }, setup: { run: (h, nav) => { view(h, nav, true); settle(h, nav); } },
      expected: { calls: ['back'], home: true, pos: 0, depth: 2 },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const h = fakeHost(tt.args), nav = createHomeNav(h);
      tt.setup.run(h, nav);
      expect({ calls: h.calls, home: h.home, pos: h.pos, depth: h.stack.length }).toEqual(tt.expected);
    });
  }
});

describe('isAwayState（ホーム以外の画面の履歴か）', () => {
  const tests: Record<string, { args: { s: unknown }; expected: { want: boolean } }> = {
    'success: 印つきの state': { args: { s: { mofuruNav: 'away' } }, expected: { want: true } },
    'success: AWAY_STATE そのもの': { args: { s: AWAY_STATE }, expected: { want: true } },
    'success: null（ホームの履歴）': { args: { s: null }, expected: { want: false } },
    'success: ほかの state': { args: { s: { mofuruNav: 'home' } }, expected: { want: false } },
    'success: オブジェクトでない値': { args: { s: 'away' }, expected: { want: false } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(isAwayState(tt.args.s)).toBe(tt.expected.want); });
  }
});

describe('leaveConfirmText（ホームへ戻る前の確認）', () => {
  const tests: Record<string, { args: { mode: Mode | null; finished: boolean }; expected: { want: string | null } }> = {
    'success: 対戦していなければ確認しない': { args: { mode: null, finished: false }, expected: { want: null } },
    'success: チュートリアル中は確認する': { args: { mode: 'tutorial', finished: false }, expected: { want: 'チュートリアルをやめて、タイトルに戻りますか？' } },
    'success: チュートリアル完了後は確認しない': { args: { mode: 'tutorial', finished: true }, expected: { want: null } },
    'success: CPU 対戦中は確認する（続きから再開できる）': { args: { mode: 'cpu', finished: false }, expected: { want: 'タイトルに戻りますか？\n（あとで「続きから」再開できます）' } },
    'success: CPU 対戦の決着後は確認しない': { args: { mode: 'cpu', finished: true }, expected: { want: null } },
    'success: ホストは確認する': { args: { mode: 'host', finished: false }, expected: { want: 'タイトルに戻りますか？\n（ホストが抜けるとオンライン対戦は終了します）' } },
    'success: ホストは決着後も確認する（部屋が閉じるため）': { args: { mode: 'host', finished: true }, expected: { want: 'タイトルに戻りますか？\n（ホストが抜けるとオンライン対戦は終了します）' } },
    'success: ゲストは確認する': { args: { mode: 'guest', finished: false }, expected: { want: 'タイトルに戻りますか？\n（この対戦から抜けます）' } },
    'success: ゲストは決着後も確認する': { args: { mode: 'guest', finished: true }, expected: { want: 'タイトルに戻りますか？\n（この対戦から抜けます）' } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(leaveConfirmText(tt.args.mode, tt.args.finished)).toBe(tt.expected.want); });
  }
});
