/* バトル結果 → 鳴らす効果音の対応（DOM・音に依存しない） */

/** 結果の効果音：勝ち・負け・観戦（自分が関わらないバトル） */
export type BattleSound = 'win' | 'lose' | 'watch';

/**
 * この端末で見ている人（me）から見たバトル結果の効果音を決める。
 * 自分が挑戦者かジム側なら勝ち負け、関わっていなければ観戦用。
 */
export function battleSound(b: { a: number; d: number; win: number }, me: number): BattleSound {
  if (me !== b.a && me !== b.d) return 'watch';
  return b.win === me ? 'win' : 'lose';
}
