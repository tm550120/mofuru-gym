/* BGM（試験機能 'bgm'）：場面に合わせて曲を切り替える
 * 試験機能がオフの端末では initBgm が何もしないので、場面の変化も無視し、AudioContext も作らない。
 * 自動再生はしない：最初のユーザー操作のあとから流す。タブが隠れたら止め、戻ったら今の場面の曲を最初から流す。 */
import { settings } from '../../app/settings';
import { isFeatureOn } from '../../features';
import { unlockOnGesture } from '../context';
import { playTrack } from './player';
import { trackForScene, type Scene } from './scene';
import type { TrackId } from './songs';

/** BGM を流してよいか：試験機能がオンかつユーザー設定がオン */
export const bgmAllowed = (feature: boolean, userOn: boolean): boolean => feature && userOn;

let active = false, gestured = false, scene: Scene = 'title';

/** 流すべき曲を決めて切り替える */
function apply(): void {
  if (!active) return;
  const hidden = typeof document !== 'undefined' && document.hidden;
  const on = gestured && !hidden && bgmAllowed(isFeatureOn('bgm'), settings.bgm);
  playTrack(on ? trackForScene(scene) : null);
}

/** ゲーム画面の起動時に呼ぶ。試験機能がオフなら何もしない */
export function initBgm(): void {
  if (active || !isFeatureOn('bgm')) return;
  active = true;
  unlockOnGesture(() => { gestured = true; apply(); });
  document.addEventListener('visibilitychange', apply);
}

/** 場面が変わったときに呼ぶ（BGM が無効な端末では何もしない） */
export function setBgmScene(s: Scene): void { scene = s; apply(); }

/** ユーザー設定が変わったときに呼ぶ */
export function refreshBgm(): void { apply(); }

/** 管理ページ（テスト台）用：試験機能・ユーザー設定・場面に関係なく曲を流す（null で止める）。ボタン操作から呼ぶ */
export function previewBgm(id: TrackId | null): void { playTrack(id); }
