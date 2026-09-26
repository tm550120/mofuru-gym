/* ゲームの型定義。GameState は JSON 化してオンライン同期するので、関数やクラスを含めない */

export type Resource = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';
export type TileType = Resource | 'desert';
/** モフルのタイプ（進化前は null）。タイプは資源の種類と対応する */
export type Mon = Resource | null;
/** discard: 7が出て、手札の多い人が捨てる資源を選んでいる間 */
export type Phase = 'setup' | 'roll' | 'main' | 'battle' | 'discard' | 'over';
export type SetupStep = 'settlement' | 'road';
export type PlayerType = 'local' | 'remote' | 'cpu';
export type BuildKind = 'road' | 'settlement' | 'city';
export type Resources = Record<Resource, number>;
/** 資源の組（交換・捨て札で使う。0枚の資源は省略してよい） */
export type Bundle = Partial<Record<Resource, number>>;

/** 乱数源（0 以上 1 未満）。既定は Math.random、テストでは固定列を渡す */
export type Rng = () => number;

export interface Hex {
  id: number;
  q: number;
  r: number;
  type: TileType;
  num: number;
  x: number;
  y: number;
  verts: number[];
}

export interface Vertex {
  id: number;
  x: number;
  y: number;
  hexes: number[];
  adj: number[];
  edges: number[];
  owner: number | null;
  city: boolean;
}

export interface Edge {
  id: number;
  a: number;
  b: number;
  owner: number | null;
}

export interface Board {
  hexes: Hex[];
  V: Vertex[];
  E: Edge[];
}

export interface Player {
  name: string;
  type: PlayerType;
  color: string;
  mon: Mon;
  badges: number;
  disconnected: boolean;
  res: Resources;
}

/** 席の指定（席0から順番） */
export interface Seat {
  name: string;
  type: PlayerType;
}

/** [ラベル, 加点] */
export type Bonus = [string, number];

/** バトル結果（演出用に全員の端末へ配る） */
export interface BattleResult {
  id: number;
  a: number;
  d: number;
  v: number;
  city: boolean;
  am: Mon;
  dm: Mon;
  ra: number;
  rd: number;
  ba: Bonus[];
  bd: Bonus[];
  ta: number;
  td: number;
  win: number;
  text: string;
}

/** 交換の相手：'all'（全員）か席番号 */
export type OfferTarget = 'all' | number;
export type OfferResponse = 'pending' | 'decline';

/** プレイヤー同士の交換の提案。最初に「受ける」を押した人と成立。全員に断られたら不成立 */
export interface Offer {
  id: number;
  from: number;
  to: OfferTarget;
  /** 提案者が出す */
  give: Bundle;
  /** 提案者がほしい */
  want: Bundle;
  /** 提案された人ごとの返事（JSON 化するとキーは文字列になる） */
  resp: Record<number, OfferResponse>;
}

/** 共有されるゲーム状態 */
export interface GameState extends Board {
  gid: string;
  players: Player[];
  /** 手番の順（席番号の配列）。初期配置もこの順→逆順で行う */
  seq: number[];
  cur: number;
  phase: Phase;
  setupStep: SetupStep;
  order: number[];
  setupIdx: number;
  lastSettle: number | null;
  dice: [number, number];
  /** サイコロを振った回数（演出の再生判定に使う） */
  rollN: number;
  lr: number | null;
  champ: number | null;
  lens: number[];
  busy: boolean;
  /** 新しい順。最大40件 */
  log: string[];
  /** これまでに追加したログの件数（新しい出来事の表示に使う） */
  logN: number;
  battle: BattleResult | null;
  winner: number | null;
  /** 7のときに捨てる枚数（まだ選んでいない人だけ）。discard フェーズ以外は null */
  discard: Record<number, number> | null;
  /** 全員が捨て終わったあとに進むフェーズ */
  afterDiscard: 'main' | 'battle' | null;
  offer: Offer | null;
  offerN: number;
  /** 本編に入ってからターンが交代した回数 */
  turnN: number;
  /** CPU が最後に交換を提案したターン（1ターンに1回まで） */
  cpuTradeTurn: number;
}

/** プレイヤーの操作（オンラインではゲストからホストへ送られる） */
export type Action =
  | { t: 'settle'; v: number }
  | { t: 'road'; e: number }
  | { t: 'city'; v: number }
  | { t: 'roll' }
  | { t: 'battle'; v: number }
  | { t: 'skip' }
  | { t: 'end' }
  | { t: 'trade'; give: Resource; get: Resource }
  | { t: 'evolve'; r: Resource }
  /** プレイヤーへの交換の提案 */
  | { t: 'offer'; to: OfferTarget; give: Bundle; want: Bundle }
  | { t: 'cancelOffer' }
  /** 交換の提案への返事（自分の番でなくてもできる） */
  | { t: 'respond'; ok: boolean }
  /** 7のときに捨てる資源（自分の番でなくてもできる） */
  | { t: 'discard'; r: Bundle };
