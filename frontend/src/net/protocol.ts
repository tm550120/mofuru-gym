/* オンライン対戦（PeerJS / WebRTC）のメッセージ型と定数 */
import type { OrderMode } from '../app/save';
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
/** ゲストの接続が切れてから、ホストに「CPUに交代するか」を聞くまでの猶予 */
export const DC_GRACE_MS = 25000;
/** ホストがリロードしたあと、ホストが再開した直後にゲストの再接続を待つ時間 */
export const HOST_RESUME_GRACE_MS = 45000;
/** ゲストがホストへの再接続を試み続ける時間 */
export const RC_LIMIT_MS = 120000;

export const genCode = (rng: () => number = Math.random): string =>
  [...Array(CODE_LENGTH)].map(() => CODE_ALPHABET[Math.floor(rng() * CODE_ALPHABET.length)]).join('');
export const cleanName = (s: unknown): string => String(s || '').replace(/[<>&"'`\\\n\r\t]/g, '').trim().slice(0, 10) || 'ゲスト';
export const hostPeerId = (code: string): string => PEER_PREFIX + code;
/** 再接続用のトークン（同じ席に戻るための合言葉） */
export const genToken = (rng: () => number = Math.random): string => rng().toString(36).slice(2) + Date.now().toString(36);
/** リモートから来たトークンを整える（文字列でなければ空、最大40文字） */
export const cleanToken = (t: unknown): string => (typeof t === 'string' ? t.slice(0, 40) : '');

/** ゲスト → ホスト */
export type GuestMessage =
  /** token: 再接続用（初回は新しく作ったもの、再接続時は保存しておいたもの） */
  | { t: 'hello'; name: string; token?: string }
  | { t: 'bye' }
  | { t: 'act'; a: Action }
  | { t: 'pong' };

/** ホスト → ゲスト */
export type HostMessage =
  /** rejoin: 対戦中の席に戻れた */
  | { t: 'welcome'; code: string; rejoin?: boolean }
  /** mode: 手番の決め方、order: 'list' のときの手番（席番号の並び） */
  | { t: 'lobby'; players: string[]; fill: boolean; you: number; mode: OrderMode; order: number[] }
  | { t: 'reject'; reason: string }
  | { t: 'start'; seat: number; token?: string }
  | { t: 'state'; G: GameState }
  | { t: 'end'; reason: string }
  | { t: 'ping' };
