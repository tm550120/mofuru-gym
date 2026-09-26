import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import type { ApiError, HealthResponse, RoomCreateRequest } from '@mofuru-gym/shared';
import { RoomRegistry } from './rooms.js';

export interface AppOptions {
  rooms?: RoomRegistry;
  /** ビルド済みフロントエンド（frontend/dist）を配信するディレクトリ。無ければ配信しない */
  staticDir?: string;
  /** 別オリジン（例: GitHub Pages）から API を呼ぶときに許可するオリジン。'*' も可 */
  corsOrigin?: string;
  logger?: boolean;
}

const ERRORS: Record<string, [number, string]> = {
  'invalid-code': [400, 'code must be 5 characters of A-Z (except I, O) and 2-9'],
  'invalid-peer-id': [400, 'peerId must be 1-64 characters of A-Z, a-z, 0-9, _ or -'],
  exists: [409, 'room code is already registered'],
  full: [503, 'too many rooms'],
  'not-found': [404, 'room not found'],
  forbidden: [403, 'invalid host token'],
};

export function buildApp(opts: AppOptions = {}): FastifyInstance {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 1024 });
  const rooms = opts.rooms ?? new RoomRegistry();

  const fail = (reason: string): { status: number; body: ApiError } => {
    const [status, error] = ERRORS[reason] ?? [500, 'internal error'];
    return { status, body: { error } };
  };

  if (opts.corsOrigin) {
    const origin = opts.corsOrigin;
    app.addHook('onRequest', async (req, reply) => {
      if (!req.url.startsWith('/api/')) return;
      reply.header('access-control-allow-origin', origin);
      reply.header('vary', 'origin');
      if (req.method === 'OPTIONS') {
        reply.header('access-control-allow-methods', 'GET, POST, DELETE, OPTIONS');
        reply.header('access-control-allow-headers', 'content-type, x-host-token');
        reply.header('access-control-max-age', '600');
        return reply.code(204).send();
      }
    });
  }

  app.get('/api/health', async (): Promise<HealthResponse> => ({ status: 'ok', rooms: rooms.size() }));

  app.post<{ Body: Partial<RoomCreateRequest> | undefined }>('/api/rooms', async (req, reply) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const r = rooms.create(body.code, body.peerId);
    if (!r.ok) { const f = fail(r.reason); return reply.code(f.status).send(f.body); }
    return reply.code(201).send(r.room);
  });

  app.get<{ Params: { code: string } }>('/api/rooms/:code', async (req, reply) => {
    const room = rooms.get(req.params.code);
    if (!room) { const f = fail('not-found'); return reply.code(f.status).send(f.body); }
    return room;
  });

  app.delete<{ Params: { code: string } }>('/api/rooms/:code', async (req, reply) => {
    const r = rooms.delete(req.params.code, req.headers['x-host-token']);
    if (!r.ok) { const f = fail(r.reason); return reply.code(f.status).send(f.body); }
    return reply.code(204).send();
  });

  // /api 配下の未定義ルートは JSON の 404
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || !opts.staticDir) return reply.code(404).send({ error: 'not found' } satisfies ApiError);
    return reply.code(404).type('text/plain').send('Not Found');
  });

  if (opts.staticDir && existsSync(opts.staticDir)) {
    app.register(fastifyStatic, { root: opts.staticDir, index: 'index.html' });
  }

  return app;
}
