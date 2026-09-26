import type { BuildKind, Resource, TileType } from './types';

export const S = 50;
export const SQ3 = Math.sqrt(3);
export const GOAL = 10;
export const RES: readonly Resource[] = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
export const JA: Record<TileType, string> = { wood: '木材', brick: 'レンガ', sheep: '羊毛', wheat: '小麦', ore: '鉱石', desert: '砂漠' };
export const ICON: Record<TileType, string> = { wood: '🌲', brick: '🧱', sheep: '🐑', wheat: '🌾', ore: '🪨', desert: '🏜️' };
export const TILE: Record<TileType, string> = { wood: '#3f7d47', brick: '#c7653c', sheep: '#93c35c', wheat: '#e7c24b', ore: '#8c95a1', desert: '#dcc89a' };
export const PIPS: Record<number, number> = { 0: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
export const COST: Record<BuildKind, Partial<Record<Resource, number>>> = {
  road: { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city: { wheat: 2, ore: 3 },
};
export const COLORS = ['#d9453a', '#2f6fd6', '#e8961e'];
export const COLOR_JA = ['赤', '青', '橙'];
export const DIE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

/* monsters */
export const MON_NAME: Record<Resource | 'none', string> = { none: 'モフル', wood: 'リーフモフル', brick: 'ブレイズモフル', sheep: 'クラウドモフル', wheat: 'サンモフル', ore: 'ロックモフル' };
export const TYPE_JA: Record<Resource, string> = { wood: '草', brick: '炎', sheep: '風', wheat: '光', ore: '岩' };
/** 相性：キーが値に強い。風>炎>草>岩>光>風 */
export const BEATS: Record<Resource, Resource> = { sheep: 'brick', brick: 'wood', wood: 'ore', ore: 'wheat', wheat: 'sheep' };

export const isResource = (x: unknown): x is Resource => typeof x === 'string' && (RES as readonly string[]).includes(x);
