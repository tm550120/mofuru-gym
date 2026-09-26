import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildApp } from './app.js';
import { RoomRegistry } from './rooms.js';

const here = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT ?? 8787);
const host = process.env.HOST ?? '127.0.0.1';
// 既定では ../frontend/dist があれば配信する（STATIC_DIR で変更、空文字で無効）
const defaultStatic = resolve(here, '../../frontend/dist');
const staticDir = process.env.STATIC_DIR ?? (existsSync(defaultStatic) ? defaultStatic : '');
const ttlMs = process.env.ROOM_TTL_MS ? Number(process.env.ROOM_TTL_MS) : undefined;

const app = buildApp({
  rooms: new RoomRegistry({ ttlMs }),
  staticDir: staticDir || undefined,
  corsOrigin: process.env.CORS_ORIGIN || undefined,
  logger: true,
});

app.listen({ port, host }).then(
  () => { if (staticDir) app.log.info(`serving frontend from ${staticDir}`); },
  err => { app.log.error(err); process.exit(1); },
);
