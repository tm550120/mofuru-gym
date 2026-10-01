/* ガイド付きチュートリアルの台本（DOM に依存しない）。
 * 島・サイコロの目・CPU の行動を固定し、案内する手順（どこをタップするか・説明文）を並べる。
 * ルール処理は持たない：ここにあるのは「乱数と CPU の行動の差し替え」と「手順の定義」だけで、
 * 実際の進行は app/session.ts と game/ の本物のロジックが行う。
 * 説明文に書いた結果（もらえる資源・得点など）は after に書き、script.test.ts で本物のルールと突き合わせる。 */
import type { Director } from '../app/session';
import { cpuDiscard } from '../cpu/ai';
import type { Action, GameState, Mon, Resources, Rng, Seat } from '../game/types';

/** あなたの席（CPU 対戦と同じ席0＝赤） */
export const ME = 0;
export const SEATS: Seat[] = [{ name: 'あなた', type: 'local' }, { name: 'CPU 青', type: 'cpu' }, { name: 'CPU 橙', type: 'cpu' }];
export const SEQ = [0, 1, 2];
/** 島を作る乱数の種（読み物ページの図と同じ島） */
const BOARD_SEED = 7;

/** 再現できる疑似乱数（mulberry32） */
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export const boardRng = (): Rng => seeded(BOARD_SEED);

/* ---------- 台本：置く場所（交差点 v・辺 e の番号は BOARD_SEED の島のもの） ---------- */
/** あなたの初期配置：1つ目（🌲5・🧱5・🧱12）、2つ目（🌾9・🪨3・🪨4） */
export const GYM1 = 21, ROAD1 = 24, GYM2 = 14, ROAD2 = 32;
/** 本編で建てる道と、その先に建てるジム（🧱8・🧱12・🐑10） */
export const ROAD3 = 40, GYM3 = 32;
/** 挑戦する CPU 青のジムと、都市にする自分のジム */
export const BATTLE_GYM = 30, CITY_GYM = 14;
/** CPU の初期配置（席ごとに [ジム, 道] を置く順） */
const CPU_SETUP: Record<number, [number, number][]> = { 1: [[30, 36], [34, 42]], 2: [[7, 6], [39, 50]] };

/** サイコロの目（振られる順）。[振る人, 目1, 目2] */
export const DICE: [number, number, number][] = [
  [0, 2, 3], [1, 4, 1], [2, 3, 2],
  [0, 1, 4], [1, 1, 2], [2, 3, 1],
  [0, 3, 2], [1, 4, 5], [2, 6, 3],
  [0, 3, 4],
];
/** バトルのサイコロ：あなた 5、CPU 青 2 */
export const BATTLE_DICE: [number, number] = [5, 2];

/** サイコロの目 d（1〜6）が出る乱数値 */
const face = (d: number): number => (d - 1) / 6 + 0.001;

/** 台本どおりの差し替え（乱数と CPU の行動）。ゲームを始めるたびに作り直す */
export function makeDirector(): Director {
  /* 乱数の消費順：サイコロ（2個ずつ）→ バトル（挑戦者・ジム）→ 奪う資源（先頭＝0） */
  const q = [...DICE.flatMap(([, a, b]) => [face(a), face(b)]), face(BATTLE_DICE[0]), face(BATTLE_DICE[1]), 0];
  let i = 0;
  const fixed: Rng = () => 0;
  return {
    rng: () => (i < q.length ? q[i++] : 0.5),
    pickSetupSettlement: (g, p) => CPU_SETUP[p][g.setupIdx < g.players.length ? 0 : 1][0],
    pickSetupRoad: (g, p) => CPU_SETUP[p][g.setupIdx < g.players.length ? 0 : 1][1],
    /* CPU はサイコロを振るだけで、建設もバトルもしない */
    pickBattleTarget: () => null,
    aiAct: () => false,
    /* あなたからの交換の提案は、最初に聞かれた CPU 青が受ける */
    cpuLikes: () => true,
    cpuDiscard: (g, p, d) => cpuDiscard(g, p, d, fixed),
  };
}

/* ---------- 案内の手順 ---------- */
export const CHAPTERS = [
  '画面の見かた', '初期配置', 'サイコロと資源', '道を建てる', '進化', '銀行と交換', 'プレイヤーと交換', 'ジムを建てる', '7とジムバトル', '都市を建てる', 'おさらい',
] as const;

/** 説明文で言っている結果（手順が済んだ時点の、あなたの状態） */
export interface Claim { res?: Resources; vp?: number; mon?: Mon; badges?: number; log?: string }

export interface Step {
  /** 章（CHAPTERS の番号。1 始まり） */
  ch: number;
  /** info: 読んで「次へ」／tap: 対象をタップ／wait: CPU の動きを待つ */
  kind: 'info' | 'tap' | 'wait';
  text: string;
  /** 光らせる要素（tap ではここだけ押せる） */
  target?: string;
  /** tap の結果ゲームに送られる操作（シートを開くなど画面だけの手順には無い） */
  action?: Action;
  /** ゲームの状態で見た「済んだ」 */
  done?: (g: GameState) => boolean;
  /** 画面で見た「済んだ」（この要素があれば済み） */
  doneSel?: string;
  /** 吹き出しを置く側（省略時は対象が画面の下半分なら上、上半分なら下） */
  side?: 'above' | 'below';
  after?: Claim;
}

const R = (wood: number, brick: number, sheep: number, wheat: number, ore: number): Resources => ({ wood, brick, sheep, wheat, ore });
const V = (v: number): string => `#board [data-v="${v}"]`;
const E = (e: number): string => `#board [data-e="${e}"]`;
const AB = (a: string): string => `.ab[data-act="${a}"]`;
const myTurnN = (g: GameState, n: number): boolean => g.turnN === n && g.cur === ME && g.phase === 'roll' && !g.busy;

export const STEPS: Step[] = [
  /* 1 画面の見かた */
  { ch: 1, kind: 'info', text: 'ようこそ！ 本物のゲーム画面で、操作をひととおり練習します。島・サイコロの目・CPU の動きは練習用に決まっています。' },
  { ch: 1, kind: 'info', target: '#players', text: 'プレイヤーの一覧です。★は得点、🃏は手札の枚数、🏅はバッジ。先に★10点で勝ちです。' },
  { ch: 1, kind: 'info', target: '#msg', text: 'いま何をすればいいかは、ここに出ます。迷ったらここを見ましょう。' },
  { ch: 1, kind: 'info', target: '#boardWrap', text: '島です。土地の絵が資源の種類、数字がサイコロの目。数字の下の点が多いほど出やすい目です。' },
  { ch: 1, kind: 'info', target: '.row1', text: '左からサイコロ、あなたのモフル、手札（🌲木材 🧱レンガ 🐑羊毛 🌾小麦 🪨鉱石）です。' },
  /* 2 初期配置 */
  { ch: 2, kind: 'tap', target: V(GYM1), action: { t: 'settle', v: GYM1 }, done: g => g.V[GYM1].owner === ME,
    text: 'まず最初のジムを置きます。光っている交差点をタップ。🌲5・🧱5・🧱12 の3つの土地に接する場所です。' },
  { ch: 2, kind: 'tap', target: E(ROAD1), action: { t: 'road', e: ROAD1 }, done: g => g.E[ROAD1].owner === ME,
    text: '次に、ジムからつながる道を1本置きます。光っている辺をタップ。' },
  { ch: 2, kind: 'wait', done: g => g.phase === 'setup' && g.setupIdx === 5 && g.cur === ME && !g.busy,
    text: 'CPU 青と CPU 橙がジムと道を置いています。2つ目は逆の順番で置くので、あなたは最後です。' },
  { ch: 2, kind: 'tap', target: V(GYM2), action: { t: 'settle', v: GYM2 }, done: g => g.V[GYM2].owner === ME, after: { res: R(0, 0, 0, 1, 2) },
    text: '2つ目のジムを置きます。2つ目は、接する土地の資源を1枚ずつもらえます。ここは 🌾9・🪨3・🪨4 なので 🌾1枚と🪨2枚。' },
  { ch: 2, kind: 'tap', target: E(ROAD2), action: { t: 'road', e: ROAD2 }, done: g => g.E[ROAD2].owner === ME, after: { vp: 2 },
    text: '2本目の道を置きます。これで初期配置は完了。ジム2つで ★2点からスタートです。' },
  /* 3 サイコロと資源 */
  { ch: 3, kind: 'tap', target: '#main', action: { t: 'roll' }, done: g => g.rollN === 1, after: { res: R(1, 1, 0, 1, 2), log: '🎲5' },
    text: 'あなたの番です。「🎲 サイコロを振る」をタップ。' },
  { ch: 3, kind: 'info', target: '#res', after: { res: R(1, 1, 0, 1, 2) },
    text: '5が出ました。1つ目のジムが 🌲5 と 🧱5 に接しているので、🌲と🧱を1枚ずつもらえました。' },
  /* 4 道を建てる */
  { ch: 4, kind: 'tap', target: AB('road'), doneSel: AB('road') + '.on',
    text: '資源で建設します。道は 🌲1・🧱1。「道」をタップ。' },
  { ch: 4, kind: 'tap', target: E(ROAD3), action: { t: 'road', e: ROAD3 }, done: g => g.E[ROAD3].owner === ME, after: { res: R(0, 0, 0, 1, 2) },
    text: '置ける辺が点線で出ます。光っている辺をタップ。道は自分のジムか道につなげて伸ばします。' },
  { ch: 4, kind: 'tap', target: '#main', action: { t: 'end' }, done: g => g.turnN >= 1,
    text: 'もう建てられる物がないので「ターン終了」をタップ。' },
  { ch: 4, kind: 'wait', done: g => myTurnN(g, 3),
    text: 'CPU の番です。相手の番でも、出た目が自分のジムの土地の数字なら資源をもらえます。手札を見ていてください。' },
  /* 5 進化 */
  { ch: 5, kind: 'tap', target: '#main', action: { t: 'roll' }, done: g => g.rollN === 4, after: { res: R(3, 3, 0, 1, 2), log: '🎲5' },
    text: 'CPU の番にも5が2回出て、資源が増えました。あなたの番です。サイコロを振りましょう。' },
  { ch: 5, kind: 'tap', target: AB('evolve'), doneSel: '#evoBg.show',
    text: 'また5！ 🌲が3枚になりました。同じ資源3枚でモフルを進化できます。「進化」をタップ。' },
  { ch: 5, kind: 'tap', target: '#evoList button[data-r="wood"]', doneSel: '#evoList button[data-r="wood"].sel',
    text: '使う資源でタイプが決まります。🌲×3 の「リーフモフル（草）」を選びます。' },
  { ch: 5, kind: 'tap', target: '#eOk', action: { t: 'evolve', r: 'wood' }, done: g => g.players[ME].mon === 'wood', after: { res: R(0, 3, 0, 1, 2), mon: 'wood' },
    text: '「進化する」をタップ。進化するとバトルで +2 になり、7を出したとき相手のジムに挑戦できます。' },
  { ch: 5, kind: 'tap', target: '#main', action: { t: 'end' }, done: g => g.turnN >= 4,
    text: '草タイプに進化しました。「ターン終了」をタップ。' },
  { ch: 5, kind: 'wait', done: g => myTurnN(g, 6),
    text: 'CPU の番です。3と4が出ると、2つ目のジム（🪨3・🪨4）で🪨がもらえます。' },
  /* 6 銀行と交換 */
  { ch: 6, kind: 'tap', target: '#main', action: { t: 'roll' }, done: g => g.rollN === 7, after: { res: R(1, 4, 0, 1, 4), log: '🎲5' },
    text: 'あなたの番です。サイコロを振りましょう。' },
  { ch: 6, kind: 'tap', target: AB('trade'), doneSel: '#tradeBg.show',
    text: '次はジムを建てたい（🌲🧱🐑🌾）のに、🐑がありません。🧱が4枚あるので、銀行で交換しましょう。「交換」をタップ。' },
  { ch: 6, kind: 'tap', target: '#tTabs button[data-tab="bank"]', doneSel: '#tTabs button[data-tab="bank"].sel',
    text: '「🏦 銀行と交換」をタップ。銀行は、同じ資源4枚を好きな資源1枚に替えてくれます。' },
  { ch: 6, kind: 'tap', target: '#give button[data-r="brick"]', doneSel: '#give button[data-r="brick"].sel',
    text: '出す資源は 🧱（4枚）をタップ。' },
  { ch: 6, kind: 'tap', target: '#get button[data-r="sheep"]', doneSel: '#get button[data-r="sheep"].sel',
    text: 'もらう資源は 🐑羊毛 をタップ。' },
  { ch: 6, kind: 'tap', target: '#tOk', action: { t: 'trade', give: 'brick', get: 'sheep' }, done: g => g.players[ME].res.sheep === 1, after: { res: R(1, 0, 1, 1, 4) },
    text: '「交換する」をタップ。🧱4枚が🐑1枚になります。' },
  /* 7 プレイヤーと交換 */
  { ch: 7, kind: 'tap', target: AB('trade'), doneSel: '#tradeBg.show',
    text: '今度は🧱が足りなくなりました。🪨は4枚あるので、ほかのプレイヤーに1枚ずつの交換を頼みます。もう一度「交換」をタップ。' },
  { ch: 7, kind: 'tap', target: '#tTabs button[data-tab="player"]', doneSel: '#tTabs button[data-tab="player"].sel',
    text: '「🤝 プレイヤーと交換」をタップ。相手は「みんな」のままで大丈夫です。' },
  { ch: 7, kind: 'tap', target: '#pGive button[data-r="ore"][data-d="1"]', doneSel: '#pGive .stp.on button[data-r="ore"]',
    text: '「あなたが出す」の 🪨 の ＋ をタップ（1枚）。' },
  { ch: 7, kind: 'tap', target: '#pWant button[data-r="brick"][data-d="1"]', doneSel: '#pWant .stp.on button[data-r="brick"]',
    text: '「あなたがほしい」の 🧱 の ＋ をタップ（1枚）。' },
  { ch: 7, kind: 'tap', target: '#pOk', action: { t: 'offer', to: 'all', give: { ore: 1 }, want: { brick: 1 } }, done: g => g.offerN >= 1,
    text: '「提案する」をタップ。相手が受けてくれたら交換成立です。' },
  { ch: 7, kind: 'wait', done: g => !g.offer && g.offerN >= 1, after: { res: R(1, 1, 1, 1, 3), log: '交換成立' },
    text: '返事を待っています…（断られることもあります。4枚たまっていれば銀行が確実です）' },
  /* 8 ジムを建てる */
  { ch: 8, kind: 'tap', target: AB('settlement'), doneSel: AB('settlement') + '.on',
    text: 'CPU 青が受けてくれました。🌲🧱🐑🌾 がそろったので「ジム」をタップ。' },
  { ch: 8, kind: 'tap', target: V(GYM3), action: { t: 'settle', v: GYM3 }, done: g => g.V[GYM3].owner === ME, after: { res: R(0, 0, 0, 0, 3), vp: 3 },
    text: 'ジムは自分の道の先で、ほかの建物から2辺以上離れた交差点に建てられます。光っている交差点をタップ。' },
  { ch: 8, kind: 'tap', target: '#main', action: { t: 'end' }, done: g => g.turnN >= 7,
    text: 'ジムが3つで ★3点になりました。「ターン終了」をタップ。' },
  { ch: 8, kind: 'wait', done: g => myTurnN(g, 9),
    text: 'CPU の番です。9が出ると、2つ目のジム（🌾9）で🌾がもらえます。' },
  /* 9 7とジムバトル */
  { ch: 9, kind: 'tap', target: '#main', action: { t: 'roll' }, done: g => g.rollN === 10, after: { res: R(0, 0, 0, 2, 3), log: '手札が多いので5枚捨てた' },
    text: 'あなたの番です。サイコロを振りましょう。' },
  { ch: 9, kind: 'info', target: '#players',
    text: '7が出ました！ 7では資源はもらえず、手札8枚以上の人は半分（切り捨て）を捨てます。CPU 橙は10枚あったので5枚捨てました。あなたは5枚なのでそのままです（自分が8枚以上のときは、捨てる資源を自分で選びます）。' },
  { ch: 9, kind: 'tap', target: V(BATTLE_GYM), action: { t: 'battle', v: BATTLE_GYM }, done: g => !!g.battle, after: { res: R(1, 0, 0, 2, 3), badges: 1, log: 'バッジ1個目' },
    text: '7を出した人が進化済みなら、相手のジムに挑戦できます（％は勝率。いまは72%）。光っている CPU 青のジムをタップ。' },
  { ch: 9, kind: 'tap', target: '#bOk', doneSel: '#battleBg:not(.show)', side: 'below',
    text: 'おたがいサイコロ1個＋ボーナス。あなたは進化の+2で 5+2＝7、CPU 青は 2。あなたの勝ちで、🌲を1枚奪ってバッジを1個もらいました。「OK」をタップ。' },
  { ch: 9, kind: 'info', target: '#players',
    text: '🏅バッジを最初に3個集めるとチャンピオン（+2点）。同点はジムの勝ちで、負けるとモフルは進化前に戻ります。相性が有利なら+1、都市ジムは守りが+1です。' },
  /* 10 都市を建てる */
  { ch: 10, kind: 'tap', target: AB('city'), doneSel: AB('city') + '.on',
    text: '🌾2・🪨3 がそろいました。ジムを都市にしましょう。「都市」をタップ。' },
  { ch: 10, kind: 'tap', target: V(CITY_GYM), action: { t: 'city', v: CITY_GYM }, done: g => g.V[CITY_GYM].city, after: { res: R(1, 0, 0, 0, 0), vp: 4 },
    text: '都市にするジムをタップ。都市は2点で、もらえる資源が2枚になり、バトルの守りも+1です。' },
  /* 11 おさらい */
  { ch: 11, kind: 'tap', target: '#main', action: { t: 'end' }, done: g => g.turnN >= 10, after: { vp: 4, badges: 1 },
    text: '★4点になりました。最後に「ターン終了」をタップ。これで操作はひととおり体験できました！' },
];
