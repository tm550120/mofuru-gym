/* 場面 → 流す曲の対応（DOM・音に依存しない） */
import type { TrackId } from './songs';

/** 場面：タイトル（ロビー含む）・ゲーム中・ジムバトル・ゲーム終了 */
export type Scene = 'title' | 'game' | 'battle' | 'over';

/** 場面ごとの曲。ゲーム終了（結果表示）は盤面の上に結果が出るだけなので、ゲーム中の曲をそのまま流す */
const TRACK: Record<Scene, TrackId> = { title: 'title', game: 'game', battle: 'battle', over: 'game' };

export const trackForScene = (s: Scene): TrackId => TRACK[s];

/** 画面の状態から場面を決める。タイトル画面が出ていればタイトル、バトル演出中ならバトル */
export function sceneOf(v: { titleShown: boolean; battleOpen: boolean; inGame: boolean; over: boolean }): Scene {
  if (v.titleShown || !v.inGame) return 'title';
  if (v.battleOpen) return 'battle';
  return v.over ? 'over' : 'game';
}
