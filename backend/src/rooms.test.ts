import { describe, expect, it } from 'vitest';
import { RoomRegistry } from './rooms.js';

describe('RoomRegistry.create', () => {
  const tests: Record<string, {
    args: { code: unknown; peerId: unknown };
    setup: (r: RoomRegistry) => void;
    expected: { ok: boolean; reason?: string };
  }> = {
    'success: 部屋コードとピアIDを登録できる': { args: { code: 'ABC23', peerId: 'mofuru-gym-ABC23' }, setup: () => {}, expected: { ok: true } },
    'failed: 5文字でないコード': { args: { code: 'ABCD', peerId: 'x' }, setup: () => {}, expected: { ok: false, reason: 'invalid-code' } },
    'failed: 紛らわしい文字（O, 0）を含むコード': { args: { code: 'ABCO0', peerId: 'x' }, setup: () => {}, expected: { ok: false, reason: 'invalid-code' } },
    'failed: 小文字のコード': { args: { code: 'abc23', peerId: 'x' }, setup: () => {}, expected: { ok: false, reason: 'invalid-code' } },
    'failed: 文字列でないコード': { args: { code: 12345, peerId: 'x' }, setup: () => {}, expected: { ok: false, reason: 'invalid-code' } },
    'failed: 使えない文字を含むピアID': { args: { code: 'ABC23', peerId: 'a b' }, setup: () => {}, expected: { ok: false, reason: 'invalid-peer-id' } },
    'failed: 長すぎるピアID': { args: { code: 'ABC23', peerId: 'x'.repeat(65) }, setup: () => {}, expected: { ok: false, reason: 'invalid-peer-id' } },
    'failed: 登録済みのコード': { args: { code: 'ABC23', peerId: 'p2' }, setup: r => { r.create('ABC23', 'p1'); }, expected: { ok: false, reason: 'exists' } },
    'failed: 部屋数の上限': { args: { code: 'ABC24', peerId: 'p2' }, setup: r => { r.create('ABC23', 'p1'); r.create('ABC25', 'p1'); }, expected: { ok: false, reason: 'full' } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const r = new RoomRegistry({ ttlMs: 1000, maxRooms: 2, now: () => 100 });
      tt.setup(r);
      const got = r.create(tt.args.code, tt.args.peerId);
      expect(got.ok).toBe(tt.expected.ok);
      if (got.ok) {
        expect(got.room).toMatchObject({ code: tt.args.code, peerId: tt.args.peerId, expiresAt: 1100 });
        expect(got.room.hostToken).toMatch(/^[0-9a-f]{32}$/);
      } else {
        expect(got.reason).toBe(tt.expected.reason);
      }
    });
  }
});

describe('RoomRegistry TTL', () => {
  it('success: 期限内は引けて、期限切れで消える', () => {
    let t = 0;
    const r = new RoomRegistry({ ttlMs: 1000, now: () => t });
    r.create('ABC23', 'peer-1');
    t = 999;
    expect(r.get('ABC23')).toEqual({ code: 'ABC23', peerId: 'peer-1', expiresAt: 1000 });
    expect(r.size()).toBe(1);
    t = 1000;
    expect(r.get('ABC23')).toBeNull();
    expect(r.size()).toBe(0);
  });
  it('success: 期限切れのコードは登録し直せる', () => {
    let t = 0;
    const r = new RoomRegistry({ ttlMs: 10, now: () => t });
    expect(r.create('ABC23', 'peer-1').ok).toBe(true);
    t = 10;
    expect(r.create('ABC23', 'peer-2').ok).toBe(true);
    expect(r.get('ABC23')?.peerId).toBe('peer-2');
  });
});

describe('RoomRegistry.delete', () => {
  const tests: Record<string, {
    args: { code: string; token: (real: string) => unknown };
    expected: { ok: boolean; reason?: string; remains: boolean };
  }> = {
    'success: 正しいトークンで消せる': { args: { code: 'ABC23', token: real => real }, expected: { ok: true, remains: false } },
    'failed: トークン違いは消せない': { args: { code: 'ABC23', token: () => 'f'.repeat(32) }, expected: { ok: false, reason: 'forbidden', remains: true } },
    'failed: トークンなしは消せない': { args: { code: 'ABC23', token: () => undefined }, expected: { ok: false, reason: 'forbidden', remains: true } },
    'failed: 未登録のコード': { args: { code: 'ZZZ22', token: real => real }, expected: { ok: false, reason: 'not-found', remains: true } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, () => {
      const r = new RoomRegistry({ now: () => 0 });
      const created = r.create('ABC23', 'peer-1');
      if (!created.ok) throw new Error('setup failed');
      const got = r.delete(tt.args.code, tt.args.token(created.room.hostToken));
      expect(got.ok).toBe(tt.expected.ok);
      if (!got.ok) expect(got.reason).toBe(tt.expected.reason);
      expect(r.get('ABC23') !== null).toBe(tt.expected.remains);
    });
  }
});
