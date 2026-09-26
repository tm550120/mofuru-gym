/* ジムバトルとバッジ・チャンピオン */
import { BEATS, ICON, JA, RES } from './constants';
import { defaultRng, die } from './random';
import { log, monName } from './rules';
import type { Bonus, GameState, Mon, Resource, Rng } from './types';

/** x が y に相性有利なら 1 */
export const adv = (x: Mon, y: Mon): number => (x && y && BEATS[x] === y ? 1 : 0);

/** ボーナス：進化済み+2、相性有利+1、都市ジム（守り側）+1 */
export function bonuses(me: Mon, opp: Mon, city: boolean): Bonus[] {
  const b: Bonus[] = [];
  if (me) b.push(['進化', 2]);
  if (adv(me, opp)) b.push(['相性', 1]);
  if (city) b.push(['都市', 1]);
  return b;
}
export const bsum = (b: Bonus[]): number => b.reduce((s, x) => s + x[1], 0);

/** 挑戦者 a がジム v に勝つ確率（同点はジムの勝ち） */
export function winProb(g: GameState, a: number, v: number): number {
  const d = g.V[v].owner as number, A = g.players[a].mon, D = g.players[d].mon;
  const ba = bsum(bonuses(A, D, false)), bd = bsum(bonuses(D, A, g.V[v].city));
  let w = 0; for (let i = 1; i <= 6; i++) for (let j = 1; j <= 6; j++) if (i + ba > j + bd) w++;
  return w / 36;
}

/** バッジを最初に3個集めた人がチャンピオン。より多く集めた人が現れると移る。変わったらログ文を返す */
export function updateChamp(g: GameState): string {
  let h = g.champ;
  g.players.forEach((p, i) => { if (p.badges >= 3 && (h === null || p.badges > g.players[h].badges)) h = i; });
  if (h !== g.champ && h !== null) { g.champ = h; const t = `${g.players[h].name}がチャンピオンに（+2点）`; log(g, t); return t; }
  return '';
}

/** バトルを判定して状態に反映し、演出用の結果を g.battle に残す */
export function battle(g: GameState, a: number, v: number, rng: Rng = defaultRng): void {
  const d = g.V[v].owner as number, A = g.players[a], D = g.players[d], city = g.V[v].city;
  const am = A.mon, dm = D.mon, ra = die(rng), rd = die(rng);
  const ba = bonuses(am, dm, false), bd = bonuses(dm, am, city);
  const ta = ra + bsum(ba), td = rd + bsum(bd);
  const win = ta > td ? a : d, lose = win === a ? d : a, lostMon = g.players[lose].mon;
  const W_ = g.players[win], L_ = g.players[lose]; W_.badges++; L_.mon = null;
  const pool = RES.flatMap(r => Array<Resource>(L_.res[r]).fill(r)); let stolen: Resource | null = null;
  if (pool.length) { stolen = pool[Math.floor(rng() * pool.length)]; L_.res[stolen]--; W_.res[stolen]++; }
  log(g, `⚔️ ${W_.name}がバトルに勝利：バッジ${W_.badges}個目${stolen ? '、' + L_.name + 'から' + ICON[stolen] + 'を奪った' : ''}`);
  const champTxt = updateChamp(g);
  const tie = ta === td ? '同点なのでジムの勝ち。' : '';
  const stealTxt = stolen ? `${L_.name}から${ICON[stolen]}${JA[stolen]}を1枚奪った。` : `${L_.name}は資源を持っていなかった。`;
  const loseTxt = lostMon ? `${L_.name}の${monName(lostMon)}はモフルに戻った。` : '';
  g.battle = {
    id: (g.battle ? g.battle.id : 0) + 1, a, d, v, city, am, dm, ra, rd, ba, bd, ta, td, win,
    text: `${tie}${W_.name}の勝ち！ バッジ獲得（${W_.badges}個）。${stealTxt}${loseTxt}${champTxt}`,
  };
}
