import { describe, expect, it } from 'vitest';
import { sceneOf, trackForScene, type Scene } from './scene';
import type { TrackId } from './songs';

describe('trackForScene（場面 → 曲）', () => {
  const tests: Record<string, { args: { scene: Scene }; expected: { want: TrackId } }> = {
    'success: タイトルはタイトルの曲': { args: { scene: 'title' }, expected: { want: 'title' } },
    'success: ゲーム中はゲームの曲': { args: { scene: 'game' }, expected: { want: 'game' } },
    'success: ジムバトルはバトルの曲': { args: { scene: 'battle' }, expected: { want: 'battle' } },
    'success: ゲーム終了はゲームの曲のまま': { args: { scene: 'over' }, expected: { want: 'game' } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(trackForScene(tt.args.scene)).toBe(tt.expected.want); });
  }
});

describe('sceneOf（画面の状態 → 場面）', () => {
  type args = { titleShown: boolean; battleOpen: boolean; inGame: boolean; over: boolean };
  const tests: Record<string, { args: args; expected: { want: Scene } }> = {
    'success: 起動直後（タイトル表示・ゲームなし）はタイトル': {
      args: { titleShown: true, battleOpen: false, inGame: false, over: false }, expected: { want: 'title' },
    },
    'success: ゲーム開始・再開（タイトルを閉じた）はゲーム中': {
      args: { titleShown: false, battleOpen: false, inGame: true, over: false }, expected: { want: 'game' },
    },
    'success: バトル演出中はジムバトル': {
      args: { titleShown: false, battleOpen: true, inGame: true, over: false }, expected: { want: 'battle' },
    },
    'success: ゲーム終了後もバトル演出中ならジムバトル': {
      args: { titleShown: false, battleOpen: true, inGame: true, over: true }, expected: { want: 'battle' },
    },
    'success: ゲーム終了（結果表示）はゲーム終了': {
      args: { titleShown: false, battleOpen: false, inGame: true, over: true }, expected: { want: 'over' },
    },
    'success: タイトルに戻ったらゲームが残っていてもタイトル': {
      args: { titleShown: true, battleOpen: false, inGame: true, over: false }, expected: { want: 'title' },
    },
    'success: ゲームが無ければタイトルが隠れていてもタイトル': {
      args: { titleShown: false, battleOpen: false, inGame: false, over: false }, expected: { want: 'title' },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => { expect(sceneOf(tt.args)).toBe(tt.expected.want); });
  }
});
