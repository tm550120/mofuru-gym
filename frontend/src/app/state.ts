import type { GameState } from '../game/types';

export type Mode = 'cpu' | 'host' | 'guest';

/** アプリ全体の状態。G は共有されるゲーム状態（JSON化してオンライン同期する）。それ以外はこの端末だけの状態 */
export const app: {
  G: GameState | null;
  mode: Mode | null;
  /** この端末で操作する席番号 */
  me: number;
  /** ゲストがホストへ操作を送って応答待ちの間 true */
  pending: boolean;
} = {
  G: null,
  mode: null,
  me: 0,
  pending: false,
};

export const isOnline = (): boolean => app.mode === 'host' || app.mode === 'guest';
