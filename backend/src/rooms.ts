/* 部屋コード → ホストの PeerJS ID のメモリ上の登録簿（TTL 付き）。
   サーバーを再起動すると消える。フロントエンドは届かないときも従来方式で動くので、それで困らない */
import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { RoomCreateResponse, RoomInfo } from '@mofuru-gym/shared';

/** 部屋コード（紛らわしい I, O, 0, 1 を除く英大文字と数字 5文字） */
export const ROOM_CODE_RE = /^[A-HJ-NP-Z2-9]{5}$/;
/** PeerJS の ID として使える文字 */
export const PEER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export interface RoomRegistryOptions {
  /** 登録の有効期間（ミリ秒） */
  ttlMs?: number;
  /** 同時に持てる部屋数の上限 */
  maxRooms?: number;
  /** 現在時刻（テスト用に差し替え可能） */
  now?: () => number;
}

interface Entry {
  peerId: string;
  hostToken: string;
  expiresAt: number;
}

export type CreateResult =
  | { ok: true; room: RoomCreateResponse }
  | { ok: false; reason: 'invalid-code' | 'invalid-peer-id' | 'exists' | 'full' };

export type DeleteResult = { ok: true } | { ok: false; reason: 'not-found' | 'forbidden' };

export class RoomRegistry {
  private readonly rooms = new Map<string, Entry>();
  readonly ttlMs: number;
  readonly maxRooms: number;
  private readonly now: () => number;

  constructor(opts: RoomRegistryOptions = {}) {
    this.ttlMs = opts.ttlMs ?? 2 * 60 * 60 * 1000;
    this.maxRooms = opts.maxRooms ?? 1000;
    this.now = opts.now ?? Date.now;
  }

  /** 期限切れを消して、有効な部屋数を返す */
  size(): number {
    this.sweep();
    return this.rooms.size;
  }

  create(code: unknown, peerId: unknown): CreateResult {
    if (typeof code !== 'string' || !ROOM_CODE_RE.test(code)) return { ok: false, reason: 'invalid-code' };
    if (typeof peerId !== 'string' || !PEER_ID_RE.test(peerId)) return { ok: false, reason: 'invalid-peer-id' };
    this.sweep();
    if (this.rooms.has(code)) return { ok: false, reason: 'exists' };
    if (this.rooms.size >= this.maxRooms) return { ok: false, reason: 'full' };
    const entry: Entry = { peerId, hostToken: randomBytes(16).toString('hex'), expiresAt: this.now() + this.ttlMs };
    this.rooms.set(code, entry);
    return { ok: true, room: { code, peerId, expiresAt: entry.expiresAt, hostToken: entry.hostToken } };
  }

  get(code: string): RoomInfo | null {
    const e = this.rooms.get(code);
    if (!e) return null;
    if (e.expiresAt <= this.now()) { this.rooms.delete(code); return null; }
    return { code, peerId: e.peerId, expiresAt: e.expiresAt };
  }

  delete(code: string, hostToken: unknown): DeleteResult {
    const e = this.rooms.get(code);
    if (!e || e.expiresAt <= this.now()) { this.rooms.delete(code); return { ok: false, reason: 'not-found' }; }
    if (typeof hostToken !== 'string' || !safeEqual(hostToken, e.hostToken)) return { ok: false, reason: 'forbidden' };
    this.rooms.delete(code);
    return { ok: true };
  }

  private sweep(): void {
    const t = this.now();
    for (const [code, e] of this.rooms) if (e.expiresAt <= t) this.rooms.delete(code);
  }
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
