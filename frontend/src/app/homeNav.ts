/* ホーム（タイトルのメニュー）を基点にしたブラウザ履歴の扱い（DOM に依存しない）。
 * index.html は 1 ページの中で画面が切り替わるだけなので、何もしないとブラウザの「戻る」は
 * 直前に見ていた別のページ（管理ページなど）へ出ていってしまう。そこで、
 *   ・ホーム以外の画面（チュートリアル・対戦・CPU設定・オンライン・ロビー）に入ったら履歴を 1 つだけ積む
 *   ・画面のボタンでホームへ戻ったら、積んだ履歴を戻して取り除く（積み重ねない）
 *   ・ブラウザの「戻る」で積んだ履歴から戻ってきたら、画面をホームへ戻す（対戦中は確認する）
 * として、履歴がいつも「ホーム」か「ホーム＋1」になるようにする。 */
import type { Mode } from './state';

/** ホーム以外の画面にいるあいだの履歴につける印 */
export const AWAY_STATE = { mofuruNav: 'away' } as const;
export const isAwayState = (s: unknown): boolean => !!s && typeof s === 'object' && (s as { mofuruNav?: unknown }).mofuruNav === AWAY_STATE.mofuruNav;

export interface HomeNavHost {
  /** いまの履歴の state（history.state） */
  state(): unknown;
  /** 印つきの履歴を 1 つ積む（history.pushState） */
  push(): void;
  /** 履歴を 1 つ戻す（history.back。終わると popstate が届く） */
  back(): void;
  /** 画面がホーム（タイトルのメニュー）か */
  atHome(): boolean;
  /** ブラウザの「戻る」を受けて画面をホームへ戻す。確認で取り消されたら画面はそのまま */
  leave(): void;
}
export interface HomeNav {
  /** 画面を切り替えたあとに呼ぶ：画面に合わせて履歴を積む／取り除く */
  sync(): void;
  /** popstate を受けたときに呼ぶ */
  onPop(): void;
}

export function createHomeNav(host: HomeNavHost): HomeNav {
  /** 自分で呼んだ back() の popstate を待っているあいだ true */
  let backing = false;
  function sync(): void {
    if (backing) return; // 戻り終わってから合わせ直す
    const home = host.atHome(), away = isAwayState(host.state());
    if (!home && !away) host.push();
    else if (home && away) { backing = true; host.back(); }
  }
  function onPop(): void {
    if (backing) { backing = false; sync(); return; }
    /* ブラウザの「戻る」でホームの履歴に戻ってきた：画面もホームへ（取り消されたら sync が積み直す） */
    if (!isAwayState(host.state()) && !host.atHome()) host.leave();
    /* 「進む」でホーム以外の履歴に入ったときは、画面（ホーム）に合わせて履歴を戻す */
    sync();
  }
  return { sync, onPop };
}

/** ホームへ戻る前に確認する文言（確認が要らないときは null）。
 *  finished は「もう失うものがない」状態（チュートリアル完了・CPU 対戦の決着後） */
export function leaveConfirmText(mode: Mode | null, finished: boolean): string | null {
  switch (mode) {
    case 'tutorial': return finished ? null : 'チュートリアルをやめて、タイトルに戻りますか？';
    case 'host': return 'タイトルに戻りますか？\n（ホストが抜けるとオンライン対戦は終了します）';
    case 'guest': return 'タイトルに戻りますか？\n（この対戦から抜けます）';
    case 'cpu': return finished ? null : 'タイトルに戻りますか？\n（あとで「続きから」再開できます）';
    default: return null;
  }
}
