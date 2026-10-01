import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

// GitHub Pages（https://<user>.github.io/mofuru-gym/）でもバックエンド配信（/）でも動くよう、
// 既定は相対パス './'。必要なら VITE_BASE=/mofuru-gym/ のように上書きできる。
const base = process.env.VITE_BASE || './';
const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:8787';

/** 管理ページに出すバージョン：GitHub Actions では GITHUB_SHA、ローカルでは git から。取れなければ 'dev' */
function commitSha(): string {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA.slice(0, 7);
  try { return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() || 'dev'; }
  catch { return 'dev'; }
}

export default defineConfig({
  base,
  define: {
    __APP_COMMIT__: JSON.stringify(commitSha()),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    port: 5173,
    // 開発時は /api をバックエンドへ中継する（バックエンドが止まっていてもフロントは単体で動く）
    proxy: { '/api': { target: apiTarget, changeOrigin: true } },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      // ゲーム本体、読み物ページ「遊び方・早見表」（tutorial.html。タイトルと「?」の遊び方からリンク）、管理ページ（admin.html。タイトルのメニューからリンク）
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        tutorial: fileURLToPath(new URL('./tutorial.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
