/* オンライン対戦（PeerJS / WebRTC）のメッセージ型と定数 */
import type { Action, GameState } from '../game/types';

/** ホストの PeerJS ID は PEER_PREFIX + 部屋コード */
export const PEER_PREFIX = 'mofuru-gym-';
/** 部屋コードに使う文字（紛らわしい I, O, 0, 1 を除く） */
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 5;
export const MAX_PLAYERS = 3;
/** これ以上相手から何も届かなければ切断とみなす */
export const TIMEOUT_MS = 30000;
export const HEARTBEAT_MS = 4000;

export const genCode = (rng: () => number = Math.random): string =>
  [...Array(CODE_LENGTH)].map(() => CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]).join('');
export const cleanName = (s: unknown): string => String(s || '').replace(/[<>&"'`\\\n\r\t]/g, '').trim().slice(0, 10) || 'ゲスト';
export const hostPeerId = (code: string): string => PEER_PREFIX + code;

/** ゲスト → ホスト */
export type GuestMessage =
  | { t: 'hello'; name: string }
  | { t: 'bye' }
  | { t: 'act'; a: Action }
  | { t: 'pong' };

/** ホスト → ゲスト */
export type HostMessage =
  | { t: 'welcome'; code: string }
  | { t: 'lobby'; players: string[]; fill: boolean; you: number }
  | { t: 'reject'; reason: string }
  | { t: 'start'; seat: number }
  | { t: 'state'; G: GameState }
  | { t: 'end'; reason: string }
  | { t: 'ping' };
