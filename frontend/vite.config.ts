import { defineConfig } from 'vitest/config';

// GitHub Pages（https://<user>.github.io/mofuru-gym/）でもバックエンド配信（/）でも動くよう、
// 既定は相対パス './'。必要なら VITE_BASE=/mofuru-gym/ のように上書きできる。
const base = process.env.VITE_BASE || './';
const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:8787';

export default defineConfig({
  base,
  server: {
    port: 5173,
    // 開発時は /api をバックエンドへ中継する（バックエンドが止まっていてもフロントは単体で動く）
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
