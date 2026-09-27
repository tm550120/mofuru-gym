/* 管理ページの演出テスト用：ダミーの盤面とバトル結果（DOM に依存しない） */
import type { BattleSound } from '../audio/outcome';
import { bonuses, bsum } from '../game/battle';
import { createGame } from '../game/rules';
import type { BattleResult, GameState, Mon } from '../game/types';

/** 演出テストで見る側（この端末）の席 */
export const DEMO_ME = 0;

/** ダミーの盤面：席0が自分、席1・2が CPU */
export function demoGame(): GameState {
  return createGame([{ name: 'あなた', type: 'local' }, { name: 'CPU 1', type: 'cpu' }, { name: 'CPU 2', type: 'cpu' }]);
}

type Cfg = { a: number; d: number; am: Mon; dm: Mon; city: boolean; ra: number; rd: number };
const CFG: Record<BattleSound, Cfg> = {
  // 自分（風）が炎のジムに挑んで勝つ
  win: { a: 0, d: 1, am: 'sheep', dm: 'brick', city: false, ra: 4, rd: 3 },
  // 進化前の自分が岩の都市ジムに挑んで負ける
  lose: { a: 0, d: 1, am: null, dm: 'ore', city: true, ra: 2, rd: 5 },
  // CPU 同士のバトル（自分は関わらない）
  watch: { a: 1, d: 2, am: 'wood', dm: 'wheat', city: false, ra: 5, rd: 2 },
};

/** 席 DEMO_ME から見て kind（勝ち・負け・観戦）になるバトル結果 */
export function demoBattle(kind: BattleSound, id: number, names: string[]): BattleResult {
  const c = CFG[kind];
  const ba = bonuses(c.am, c.dm, false), bd = bonuses(c.dm, c.am, c.city);
  const ta = c.ra + bsum(ba), td = c.rd + bsum(bd);
  const win = ta > td ? c.a : c.d;
  return {
    id, a: c.a, d: c.d, v: 0, city: c.city, am: c.am, dm: c.dm, ra: c.ra, rd: c.rd, ba, bd, ta, td, win,
    text: `${ta === td ? '同点なのでジムの勝ち。' : ''}${names[win]}の勝ち！（演出テスト）`,
  };
}
