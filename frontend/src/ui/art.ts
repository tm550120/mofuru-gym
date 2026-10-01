/* SVG の絵（モフル・家・島） */
import { COLORS, ICON, PIPS, TILE } from '../game/constants';
import type { Board, Mon, Resource } from '../game/types';

const MONC: Record<Resource | 'none', [string, string]> = {
  none: ['#cbb8ea', '#8e78b8'], wood: ['#7cc46a', '#3f7d3a'], brick: ['#f39a5a', '#b8542a'],
  sheep: ['#a9dcf0', '#4f9cbf'], wheat: ['#f5d55a', '#b8961e'], ore: ['#b3b8c3', '#6b7180'],
};

export function monSVG(m: Mon | undefined): string {
  const [c, k] = MONC[m || 'none']; let t = '';
  if (!m) t = `<path d="M30 17 q-4 -8 2 -10 q5 -1 3 4" fill="none" stroke="${k}" stroke-width="2.5" stroke-linecap="round"/>`;
  else if (m === 'wood') t = `<path d="M30 20 C18 14 22 2 34 3 C38 12 36 18 30 20Z" fill="#3f9a3f" stroke="#2a6a2a" stroke-width="1.5"/><path d="M30 20 L33 8" stroke="#2a6a2a" stroke-width="1.2"/>`;
  else if (m === 'brick') t = `<path d="M30 21 C21 17 24 9 27 4 C28 9 31 8 31 3 C38 8 40 17 30 21Z" fill="#e8452c" stroke="#a82a18" stroke-width="1.5"/><path d="M30 19 C27 16 28 13 30 10 C32 13 33 16 30 19Z" fill="#ffd05a"/>`;
  else if (m === 'sheep') t = `<g fill="#fff" stroke="#8cbfd6" stroke-width="1.5"><circle cx="24" cy="14" r="6"/><circle cx="36" cy="14" r="6"/><circle cx="30" cy="9" r="7"/></g>`;
  else if (m === 'wheat') t = `<polygon points="30,2 33,11 42,11 35,16 38,25 30,19 22,25 25,16 18,11 27,11" fill="#fff4a8" stroke="#d9a800" stroke-width="1.5" stroke-linejoin="round"/>`;
  else if (m === 'ore') t = `<g stroke="#4a5f8f" stroke-width="1.5" stroke-linejoin="round"><polygon points="30,3 36,13 30,21 24,13" fill="#8fa8d8"/><polygon points="21,9 25,15 21,21 17,15" fill="#b7c8ec"/><polygon points="39,9 43,15 39,21 35,15" fill="#b7c8ec"/></g>`;
  return `<svg viewBox="0 0 60 60" aria-hidden="true"><ellipse cx="30" cy="54" rx="14" ry="3" fill="rgba(0,0,0,.15)"/>
  <circle cx="16" cy="24" r="6.5" fill="${c}" stroke="${k}" stroke-width="2"/><circle cx="44" cy="24" r="6.5" fill="${c}" stroke="${k}" stroke-width="2"/>
  ${t}<ellipse cx="30" cy="37" rx="19" ry="16" fill="${c}" stroke="${k}" stroke-width="2"/>
  <ellipse cx="30" cy="44" rx="10" ry="6" fill="rgba(255,255,255,.45)"/>
  <circle cx="23.5" cy="34" r="2.6" fill="#222"/><circle cx="36.5" cy="34" r="2.6" fill="#222"/><circle cx="24.3" cy="33.1" r=".9" fill="#fff"/><circle cx="37.3" cy="33.1" r=".9" fill="#fff"/>
  <ellipse cx="19" cy="39" rx="3" ry="1.8" fill="#f59ab0" opacity=".7"/><ellipse cx="41" cy="39" rx="3" ry="1.8" fill="#f59ab0" opacity=".7"/>
  <path d="M28 39 q2 2 4 0" fill="none" stroke="#222" stroke-width="1.4" stroke-linecap="round"/></svg>`;
}

export function house(x: number, y: number, c: string, city: boolean): string {
  const d = city ? `M${x - 12},${y + 8}V${y - 2}L${x - 7},${y - 8}L${x - 2},${y - 2}H${x + 12}V${y + 8}Z` : `M${x - 8},${y + 7}V${y - 2}L${x},${y - 10}L${x + 8},${y - 2}V${y + 7}Z`;
  return `<path d="${d}" fill="${c}" stroke="#fff" stroke-width="2.2" stroke-linejoin="round"/>`;
}

/** 島の絵：海・土地（資源の絵と数字）・道・ジム／都市。ゲームの盤面とチュートリアルの図で同じ絵を使う */
export function islandSVG(b: Board): string {
  let s = '';
  const R = 246, sea = [...Array(6)].map((_, i) => `${R * Math.cos(Math.PI / 3 * i)},${R * Math.sin(Math.PI / 3 * i)}`).join(' ');
  s += `<polygon points="${sea}" fill="var(--sea)" stroke="#f3e2b8" stroke-width="3" stroke-linejoin="round"/>`;
  b.hexes.forEach(h => {
    const pts = h.verts.map(v => `${b.V[v].x},${b.V[v].y}`).join(' ');
    s += `<polygon points="${pts}" fill="${TILE[h.type]}" stroke="#f3e2b8" stroke-width="3" stroke-linejoin="round"/>`;
    s += `<text x="${h.x}" y="${h.y - 22}" font-size="17" text-anchor="middle" dominant-baseline="central">${ICON[h.type]}</text>`;
    if (h.num) {
      const red = h.num === 6 || h.num === 8;
      s += `<circle cx="${h.x}" cy="${h.y + 6}" r="15" fill="#fbf3de" stroke="rgba(0,0,0,.25)"/>`;
      s += `<text x="${h.x}" y="${h.y + 4}" font-size="${red ? 15 : 14}" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="${red ? '#c3302a' : '#2a2a2a'}">${h.num}</text>`;
      const n = PIPS[h.num]; for (let i = 0; i < n; i++) s += `<circle cx="${h.x + (i - (n - 1) / 2) * 3.4}" cy="${h.y + 15}" r="1.2" fill="${red ? '#c3302a' : '#2a2a2a'}"/>`;
    }
  });
  b.E.forEach(e => {
    if (e.owner === null) return; const p = b.V[e.a], q = b.V[e.b];
    s += `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="rgba(0,0,0,.35)" stroke-width="10" stroke-linecap="round"/>`;
    s += `<line x1="${p.x}" y1="${p.y}" x2="${q.x}" y2="${q.y}" stroke="${COLORS[e.owner]}" stroke-width="6.5" stroke-linecap="round"/>`;
  });
  b.V.forEach(v => { if (v.owner !== null) s += house(v.x, v.y, COLORS[v.owner], v.city); });
  return s;
}
