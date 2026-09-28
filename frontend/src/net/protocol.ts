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
/**
 * 入力・貼り付けされた文字列を部屋コードに整える。
 * 全角→半角（NFKC）、招待リンク（?room=XXXXX）ならそのコードを取り出し、英大文字と数字だけにする。
 * 5文字を超えたら後ろの5文字（＝あとから入力した分）を残す（前のコードが入ったままでも打ち直せるように）
 */
export function normalizeRoomCode(raw: string): string {
  const s = String(raw || '').normalize('NFKC');
  const m = s.match(/[?&]room=([A-Za-z0-9]+)/);
  const c = (m ? m[1] : s).toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length > CODE_LENGTH ? c.slice(-CODE_LENGTH) : c;
}
/** 部屋コードとして使えなければ、その理由（日本語）を返す。使えれば null */
export function roomCodeError(code: string): string | null {
  if (code.length !== CODE_LENGTH) return `${CODE_LENGTH}文字の部屋コードを入力してください。`;
  if (/[IO01]/.test(code)) return '部屋コードに I・O・0・1 は使われていません。見まちがいがないか確かめてください。';
  if ([...code].some(ch => !CODE_ALPHABET.includes(ch))) return '部屋コードの文字が正しくありません。';
  return null;
}
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
