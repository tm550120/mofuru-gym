/* チュートリアル（tutorial.html）：文章は HTML に書いてあり、ここでは図だけを描く。
 * 見た目はゲームの style.css を流用し、島・モフル・家の絵はゲームと同じ描画（ui/art）を使う。
 * 図の盤面は scenes.ts が本物のルールで作る。 */
import '../style.css';
import './tutorial.css';
import { BEATS, COLORS, ICON, JA, RES, TYPE_JA, isResource } from '../game/constants';
import { total, vp } from '../game/rules';
import type { GameState, Resource } from '../game/types';
import { house, islandSVG, monSVG } from '../ui/art';
import { esc } from '../ui/dom';
import { ME, sceneBattlePick, sceneBuildGym, sceneFirstGym, sceneFirstRoad, sceneFirstTurn, sceneLongestRoad } from './scenes';

const FULL = '-252 -218 504 436';
const myC = COLORS[ME];

/* ---------- 盤面の上に重ねる印（置ける場所の印はゲームの盤面と同じ見た目） ---------- */
/** ジムを置ける交差点（白い点） */
const dot = (g: GameState, v: number): string => {
  const p = g.V[v];
  return `<circle class="tgt" cx="${p.x}" cy="${p.y}" r="8" fill="#fff" stroke="${myC}" stroke-width="3"/>`;
};
/** 道を置ける辺（白い点線） */
const dash = (g: GameState, e: number): string => {
  const a = g.V[g.E[e].a], b = g.V[g.E[e].b];
  const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, sx = a.x + (b.x - a.x) * .15, sy = a.y + (b.y - a.y) * .15, ex = b.x - (b.x - a.x) * .15, ey = b.y - (b.y - a.y) * .15;
  return `<line class="tgt" x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-dasharray="4 5"/><circle cx="${mx}" cy="${my}" r="4" fill="${myC}" stroke="#fff" stroke-width="1.5"/>`;
};
/** 挑戦できるジム（白い輪と勝率）。勝率の札は、小さい図でも読めるようにゲームより少し大きくしてある */
const ring = (g: GameState, v: number, pc: number): string => {
  const p = g.V[v];
  return `<circle class="tgt" cx="${p.x}" cy="${p.y}" r="15" fill="none" stroke="#fff" stroke-width="3"/><rect x="${p.x - 19}" y="${p.y - 35}" width="38" height="18" rx="9" fill="#22302f"/><text x="${p.x}" y="${p.y - 26}" font-size="13" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="central">${pc}%</text>`;
};
/** 説明用の丸い印（✕ や道の本数） */
const badge = (x: number, y: number, t: string, bg: string, fg: string): string =>
  `<circle cx="${x}" cy="${y}" r="10" fill="${bg}" stroke="#fff" stroke-width="2"/><text x="${x}" y="${y}" font-size="12" font-weight="800" fill="${fg}" text-anchor="middle" dominant-baseline="central">${t}</text>`;
const cross = (g: GameState, v: number): string => badge(g.V[v].x, g.V[v].y, '✕', '#c3302a', '#fff');
const count = (g: GameState, e: number, n: number): string => {
  const a = g.V[g.E[e].a], b = g.V[g.E[e].b];
  return badge((a.x + b.x) / 2, (a.y + b.y) / 2, String(n), '#fff', '#22302f');
};

/** 交差点 vs のまわりだけを大きく見せる表示範囲（ratio は横÷縦） */
function around(g: GameState, vs: number[], pad = 50, ratio = 5 / 3): string {
  const xs = vs.map(v => g.V[v].x), ys = vs.map(v => g.V[v].y);
  const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
  const w = Math.max(x1 - x0, (y1 - y0) * ratio), h = w / ratio;
  return `${(x0 + x1 - w) / 2} ${(y0 + y1 - h) / 2} ${w} ${h}`;
}
const edgeEnds = (g: GameState, es: number[]): number[] => es.flatMap(e => [g.E[e].a, g.E[e].b]);

/** 盤面の図を描く（図の説明は HTML 側の aria-label と figcaption に書く） */
function board(id: string, g: GameState, over: string, view = FULL): void {
  const el = document.querySelector(`[data-fig="${id}"]`); if (!el) return;
  el.classList.toggle('zoom', view !== FULL);
  el.innerHTML = `<svg viewBox="${view}" aria-hidden="true">${islandSVG(g)}${over}</svg>`;
}

/* ---------- 画面の見かた：あなたの最初の番の画面 ---------- */
function drawScreen(): void {
  const g = sceneFirstTurn(), me = g.players[ME];
  board('screen', g, '');
  const set = (id: string, html: string): void => { const el = document.querySelector(`[data-fig="${id}"]`); if (el) el.innerHTML = html; };
  set('players', g.seq.map((i, k) => {
    const p = g.players[i];
    return `<div class="pl ${i === g.cur ? 'turn' : ''}" style="--c:${p.color}">${monSVG(p.mon)}<div class="tx"><div class="pn"><i></i>${esc(p.name)}</div><div class="ps"><b>★${vp(g, i)}</b><span>🃏${total(p)}</span><span>🏅${p.badges}</span><span>🛤${g.lens[i] || 0}</span><span>${k + 1}番</span></div></div></div>`;
  }).join(''));
  set('res', RES.map(r => `<div class="rc"><span class="ic">${ICON[r]}</span><b>${me.res[r]}</b>${JA[r]}</div>`).join(''));
  set('log', g.log.slice(0, 2).map(l => `<div>${esc(l)}</div>`).join(''));
}

/* ---------- タイプ相性の輪（矢印の向きに強い） ---------- */
function drawTypeRing(): void {
  const cx = 150, cy = 132, R = 96, order: Resource[] = ['sheep'];
  while (order.length < RES.length) order.push(BEATS[order[order.length - 1]]);
  const pos = order.map((_, i) => { const a = Math.PI / 180 * (-90 + 72 * i); return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
  let s = '';
  order.forEach((_, i) => {
    const [x1, y1] = pos[i], [x2, y2] = pos[(i + 1) % order.length], d = Math.hypot(x2 - x1, y2 - y1), ux = (x2 - x1) / d, uy = (y2 - y1) / d;
    const tx = x2 - ux * 36, ty = y2 - uy * 36, deg = Math.atan2(uy, ux) * 180 / Math.PI;
    s += `<line x1="${x1 + ux * 36}" y1="${y1 + uy * 36}" x2="${tx - ux * 6}" y2="${ty - uy * 6}" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>`;
    s += `<path d="M0 0L-11 -6L-11 6z" fill="currentColor" transform="translate(${tx} ${ty}) rotate(${deg})"/>`;
  });
  order.forEach((m, i) => {
    const [x, y] = pos[i];
    s += monSVG(m).replace('<svg ', `<svg x="${x - 25}" y="${y - 31}" width="50" height="50" `);
    s += `<text x="${x}" y="${y + 29}" font-size="14" font-weight="800" fill="currentColor" text-anchor="middle">${TYPE_JA[m]} ${ICON[m]}</text>`;
  });
  s += `<text x="${cx}" y="${cy - 2}" font-size="12" font-weight="800" fill="currentColor" text-anchor="middle">矢印の先の</text><text x="${cx}" y="${cy + 15}" font-size="12" font-weight="800" fill="currentColor" text-anchor="middle">タイプに強い</text>`;
  document.querySelectorAll('[data-fig="types"]').forEach(el => { el.innerHTML = `<svg viewBox="0 0 300 268" aria-hidden="true">${s}</svg>`; });
}

function draw(): void {
  /* モフルの絵（data-mon="none" は進化前）と、ジム／都市の絵 */
  document.querySelectorAll<HTMLElement>('[data-mon]').forEach(el => { const m = el.dataset.mon; el.innerHTML = monSVG(isResource(m) ? m : null); });
  document.querySelectorAll<HTMLElement>('[data-house]').forEach(el => {
    el.innerHTML = `<svg viewBox="-16 -14 32 28" aria-hidden="true">${house(0, 0, COLORS[+(el.dataset.color || 0)] || myC, el.dataset.house === 'city')}</svg>`;
  });

  drawScreen();

  const a = sceneFirstGym();
  board('setup-gym', a.g, a.dots.map(v => dot(a.g, v)).join(''));

  const b = sceneFirstRoad();
  board('setup-road', b.g, b.roads.map(e => dash(b.g, e)).join(''), around(b.g, [b.gym, ...edgeEnds(b.g, b.roads)]));

  const c = sceneBuildGym();
  board('build-gym', c.g, c.blocked.map(v => cross(c.g, v)).join('') + c.dots.map(v => dot(c.g, v)).join(''), around(c.g, [c.gym, ...c.blocked, ...c.dots]));

  const d = sceneLongestRoad();
  board('longest', d.g, d.path.map((e, i) => count(d.g, e, i + 1)).join(''), around(d.g, edgeEnds(d.g, d.path), 44));

  const e = sceneBattlePick();
  board('battle-pick', e.g, e.targets.map(t => ring(e.g, t.v, t.pc)).join(''), around(e.g, e.targets.map(t => t.v), 62, 1.15));

  drawTypeRing();
}

draw();
