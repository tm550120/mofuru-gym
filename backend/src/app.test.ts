import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp, type AppOptions } from './app.js';
import { RoomRegistry } from './rooms.js';

let app: FastifyInstance | null = null;
const make = (opts: AppOptions = {}): FastifyInstance => {
  app = buildApp({ rooms: new RoomRegistry({ now: () => 1000, ttlMs: 5000 }), ...opts });
  return app;
};
afterEach(async () => { await app?.close(); app = null; });

describe('GET /api/health', () => {
  it('success: status ok と部屋数を返す', async () => {
    const a = make();
    const res = await a.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', rooms: 0 });
  });
});

describe('POST /api/rooms', () => {
  const tests: Record<string, {
    args: { payload: unknown };
    setup: (a: FastifyInstance) => Promise<void>;
    expected: { status: number; body?: Record<string, unknown> };
  }> = {
    'success: 登録すると 201 と hostToken': {
      args: { payload: { code: 'ABC23', peerId: 'mofuru-gym-ABC23' } },
      setup: async () => {},
      expected: { status: 201, body: { code: 'ABC23', peerId: 'mofuru-gym-ABC23', expiresAt: 6000 } },
    },
    'failed: コードが不正なら 400': {
      args: { payload: { code: 'bad', peerId: 'x' } },
      setup: async () => {},
      expected: { status: 400 },
    },
    'failed: ピアIDが無ければ 400': {
      args: { payload: { code: 'ABC23' } },
      setup: async () => {},
      expected: { status: 400 },
    },
    'failed: 登録済みなら 409': {
      args: { payload: { code: 'ABC23', peerId: 'p2' } },
      setup: async a => { await a.inject({ method: 'POST', url: '/api/rooms', payload: { code: 'ABC23', peerId: 'p1' } }); },
      expected: { status: 409 },
    },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, async () => {
      const a = make();
      await tt.setup(a);
      const res = await a.inject({ method: 'POST', url: '/api/rooms', payload: tt.args.payload as Record<string, unknown> });
      expect(res.statusCode).toBe(tt.expected.status);
      const body = res.json();
      if (tt.expected.body) {
        expect(body).toMatchObject(tt.expected.body);
        expect(typeof body.hostToken).toBe('string');
      } else {
        expect(typeof body.error).toBe('string');
      }
    });
  }
  it('failed: JSON でない本文は 4xx', async () => {
    const a = make();
    const res = await a.inject({ method: 'POST', url: '/api/rooms', payload: 'nope', headers: { 'content-type': 'text/plain' } });
    expect(res.statusCode).toBeGreaterThanOrEqual(400);
    expect(res.statusCode).toBeLessThan(500);
  });
});

describe('GET / DELETE /api/rooms/:code', () => {
  it('success: 登録 → 取得 → 削除 → 404', async () => {
    const a = make();
    const created = await a.inject({ method: 'POST', url: '/api/rooms', payload: { code: 'XYZ99', peerId: 'host-peer' } });
    const { hostToken } = created.json();

    const got = await a.inject({ method: 'GET', url: '/api/rooms/XYZ99' });
    expect(got.statusCode).toBe(200);
    expect(got.json()).toEqual({ code: 'XYZ99', peerId: 'host-peer', expiresAt: 6000 });

    const del = await a.inject({ method: 'DELETE', url: '/api/rooms/XYZ99', headers: { 'x-host-token': hostToken } });
    expect(del.statusCode).toBe(204);

    const gone = await a.inject({ method: 'GET', url: '/api/rooms/XYZ99' });
    expect(gone.statusCode).toBe(404);
  });

  const tests: Record<string, {
    args: { url: string; token?: string };
    expected: { status: number };
  }> = {
    'failed: 未登録のコードの取得は 404': { args: { url: '/api/rooms/NONE2' }, expected: { status: 404 } },
    'failed: トークンなしの削除は 403': { args: { url: '/api/rooms/ABC23' }, expected: { status: 403 } },
    'failed: トークン違いの削除は 403': { args: { url: '/api/rooms/ABC23', token: 'wrong' }, expected: { status: 403 } },
    'failed: 未登録のコードの削除は 404': { args: { url: '/api/rooms/NONE2', token: 'x' }, expected: { status: 404 } },
  };
  for (const [name, tt] of Object.entries(tests)) {
    it(name, async () => {
      const a = make();
      await a.inject({ method: 'POST', url: '/api/rooms', payload: { code: 'ABC23', peerId: 'p1' } });
      const method = name.includes('削除') ? 'DELETE' : 'GET';
      const res = await a.inject({ method, url: tt.args.url, headers: tt.args.token ? { 'x-host-token': tt.args.token } : {} });
      expect(res.statusCode).toBe(tt.expected.status);
      expect(res.json()).toHaveProperty('error');
    });
  }
});

describe('CORS', () => {
  it('success: CORS_ORIGIN を設定するとプリフライトに応答する', async () => {
    const a = make({ corsOrigin: 'https://tm550120.github.io' });
    const res = await a.inject({ method: 'OPTIONS', url: '/api/rooms' });
    expect(res.statusCode).toBe(204);
    expect(res.headers['access-control-allow-origin']).toBe('https://tm550120.github.io');
    expect(res.headers['access-control-allow-headers']).toContain('x-host-token');
  });
  it('success: 未設定なら CORS ヘッダーを付けない', async () => {
    const a = make();
    const res = await a.inject({ method: 'GET', url: '/api/health' });
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
  });
});

describe('静的ファイル配信', () => {
  it('success: staticDir の index.html を / で返す', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mofuru-static-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>モフルジム</title>');
    const a = make({ staticDir: dir });
    const res = await a.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toContain('モフルジム');
    const api404 = await a.inject({ method: 'GET', url: '/api/nope' });
    expect(api404.statusCode).toBe(404);
    expect(api404.json()).toEqual({ error: 'not found' });
  });
  it('success: staticDir が無ければ / は 404', async () => {
    const a = make();
    const res = await a.inject({ method: 'GET', url: '/' });
    expect(res.statusCode).toBe(404);
  });
});
