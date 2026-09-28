/* BGM：場面に合わせて曲を切り替える
 * ユーザー設定（settings.bgm、初期値オン）がオフなら流さない。AudioContext は最初のユーザー操作まで作らない。
 * 自動再生はしない：最初のユーザー操作のあとから流す。タブが隠れたら止め、戻ったら今の場面の曲を最初から流す。 */
import { settings } from '../../app/settings';
import { unlockOnGesture } from '../context';
import { playTrack } from './player';
import { trackForScene, type Scene } from './scene';
import type { TrackId } from './songs';

/** BGM を流してよいか：ユーザー設定がオン */
export const bgmAllowed = (userOn: boolean): boolean => userOn;

let active = false, gestured = false, scene: Scene = 'title';

/** 流すべき曲を決めて切り替える */
function apply(): void {
  if (!active) return;
  const hidden = typeof document !== 'undefined' && document.hidden;
  const on = gestured && !hidden && bgmAllowed(settings.bgm);
  playTrack(on ? trackForScene(scene) : null);
}

/** ゲーム画面の起動時に呼ぶ（BGM オフでも、あとからオンにしたときのためにリスナーは付ける） */
export function initBgm(): void {
  if (active) return;
  active = true;
  unlockOnGesture(() => { gestured = true; apply(); });
  document.addEventListener('visibilitychange', apply);
}

/** 場面が変わったときに呼ぶ */
export function setBgmScene(s: Scene): void { scene = s; apply(); }

/** ユーザー設定が変わったときに呼ぶ */
export function refreshBgm(): void { apply(); }

/** 管理ページ（テスト台）用：ユーザー設定・場面に関係なく曲を流す（null で止める）。ボタン操作から呼ぶ */
export function previewBgm(id: TrackId | null): void { playTrack(id); }
