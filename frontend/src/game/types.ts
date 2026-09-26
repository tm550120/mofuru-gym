/* ゲームの型定義。GameState は JSON 化してオンライン同期するので、関数やクラスを含めない */

export type Resource = 'wood' | 'brick' | 'sheep' | 'wheat' | 'ore';
export type TileType = Resource | 'desert';
/** モフルのタイプ（進化前は null）。タイプは資源の種類と対応する */
export type Mon = Resource | null;
export type Phase = 'setup' | 'roll' | 'main' | 'battle' | 'over';
export type SetupStep = 'settlement' | 'road';
export type PlayerType = 'local' | 'remote' | 'cpu';
export type BuildKind = 'road' | 'settlement' | 'city';
export type Resources = Record<Resource, number>;

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

/** 共有されるゲーム状態 */
export interface GameState extends Board {
  gid: string;
  players: Player[];
  cur: number;
  phase: Phase;
  setupStep: SetupStep;
  order: number[];
  setupIdx: number;
  lastSettle: number | null;
  dice: [number, number];
  lr: number | null;
  champ: number | null;
  lens: number[];
  busy: boolean;
  log: string[];
  battle: BattleResult | null;
  winner: number | null;
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
  | { t: 'evolve'; r: Resource };
