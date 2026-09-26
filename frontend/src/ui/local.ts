import type { Resources } from '../game/types';

export type UiMode = 'road' | 'settlement' | 'city';

/** この端末だけの表示状態 */
export const ui: {
  /** 建設モード（道・ジム・都市のどれを置こうとしているか） */
  mode: UiMode | null;
  /** 前回描画時の自分の資源（増えた資源を光らせる） */
  prevRes: Resources | null;
  /** 終了画面を表示済みか */
  overShown: boolean;
} = {
  mode: null,
  prevRes: null,
  overShown: false,
};
