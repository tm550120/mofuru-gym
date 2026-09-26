/* 盤面の描画とタップ */
import { doAction, myTurn } from '../app/session';
import { app } from '../app/state';
import { winProb } from '../game/battle';
import { COLORS, ICON, PIPS, TILE } from '../game/constants';
import { afford, canRoad, canSettle, citySpots, enemyGyms, roadSpots, settleSpots } from '../game/rules';
import { house } from './art';
import { battleUI } from './battle';
import { $ } from './dom';
import { ui } from './local';

export function renderBoard(): void {
  const G = app.G!, ME = app.me;
  let s = '';
  const R = 246, sea = [...Array(6)].map((_, i) => `${R * Math.cos(Math.PI / 3 * i)},${R * Math.sin(Math.PI / 3 * i)}`).join(' ');
  s += `<polygon points="${sea}" fill="var(--sea)" stroke="#f3e2b8" stroke-width="3" stroke-linejoin="round"/>`;
  G.hexes.forEach(h => {
    const pts = h.verts.map(v => `${G.V[v].x},${G.V[v].y}`).join(' ');
    s += `<polygon points="${pts}" fill="${TILE[h.type]}" stroke="#f3e2b8" stroke-width="3" stroke-linejoin="round"/>`;
    s += `<text x="${h.x}" y="${h.y - 22}" font-size="17" text-anchor="middle" dominant-baseline="central">${ICON[h.type]}</text>`;
    if (h.num) {
      const red = h.num === 6 || h.num === 8;
      s += `<circle cx="${h.x}" cy="${h.y + 6}" r="15" fill="#fbf3de" stroke="rgba(0,0,0,.25)"/>`;
      s += `<text x="${h.x}" y="${h.y + 4}" font-size="${red ? 15 : 14}" font-weight="800" text-anchor="middle" dominant-baseline="central" fill="${red ? '#c3302a' : '#2a2a2a'}">${h.num}</text>`;
      const n = PIPS[h.num]; for (let i = 0; i < n; i++) s += `<circle cx="${h.x + (i - (n - 1) / 2) * 3.4}" cy="${h.y + 15}" r="1.2" fill="${red ? '#c3302a' : '#2a2a2a'}"/>`;
    }
  });
  G.E.forEach(e => {
    if (e.owner === null) return; const a = G.V[e.a], b = G.V[e.b];
    s += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="rgba(0,0,0,.35)" stroke-width="10" stroke-linecap="round"/>`;
    s += `<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="${COLORS[e.owner]}" stroke-width="6.5" stroke-linecap="round"/>`;
  });
  G.V.forEach(v => { if (v.owner !== null) s += house(v.x, v.y, COLORS[v.owner], v.city); });
  if (battleUI.open) { const v = G.V[battleUI.open.v]; s += `<circle cx="${v.x}" cy="${v.y}" r="17" fill="none" stroke="#f2b640" stroke-width="4"/>`; }
  if (myTurn()) {
    const setup = G.phase === 'setup', main = G.phase === 'main';
    const roadMode = setup ? G.setupStep === 'road' : main && ui.mode === 'road';
    const settleMode = setup ? G.setupStep === 'settlement' : main && ui.mode === 'settlement';
    const cityMode = main && ui.mode === 'city';
    const myC = COLORS[ME];
    if (roadMode) roadSpots(G, ME).forEach(id => {
      const e = G.E[id], a = G.V[e.a], b = G.V[e.b];
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, sx = a.x + (b.x - a.x) * .15, sy = a.y + (b.y - a.y) * .15, ex = b.x - (b.x - a.x) * .15, ey = b.y - (b.y - a.y) * .15;
      s += `<g data-e="${id}" style="cursor:pointer"><line class="tgt" x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="#fff" stroke-width="6" stroke-linecap="round" stroke-dasharray="4 5"/><line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="transparent" stroke-width="22"/><circle cx="${mx}" cy="${my}" r="4" fill="${myC}" stroke="#fff" stroke-width="1.5"/></g>`;
    });
    if (G.phase === 'battle') enemyGyms(G, ME).forEach(id => {
      const v = G.V[id], pc = Math.round(winProb(G, ME, id) * 100);
      s += `<g data-v="${id}" style="cursor:pointer"><circle cx="${v.x}" cy="${v.y}" r="20" fill="transparent"/><circle class="tgt" cx="${v.x}" cy="${v.y}" r="15" fill="none" stroke="#fff" stroke-width="3"/>
      <rect x="${v.x - 15}" y="${v.y - 31}" width="30" height="14" rx="7" fill="#22302f"/><text x="${v.x}" y="${v.y - 24}" font-size="10" font-weight="800" fill="#fff" text-anchor="middle" dominant-baseline="central">${pc}%</text></g>`;
    });
    let vs: number[] = [];
    if (settleMode) vs = settleSpots(G, ME, setup);
    if (cityMode) vs = citySpots(G, ME);
    vs.forEach(id => {
      const v = G.V[id];
      s += `<g data-v="${id}" style="cursor:pointer"><circle cx="${v.x}" cy="${v.y}" r="18" fill="transparent"/><circle class="tgt" cx="${v.x}" cy="${v.y}" r="${cityMode ? 14 : 8}" fill="${cityMode ? 'none' : '#fff'}" stroke="${cityMode ? '#fff' : myC}" stroke-width="3"/></g>`;
    });
  }
  $('#board').innerHTML = s;
}

function onVertex(v: number): void {
  const G = app.G!, ME = app.me;
  if (!myTurn()) return;
  if (G.phase === 'setup') { if (G.setupStep === 'settlement' && canSettle(G, v, ME, true)) doAction({ t: 'settle', v }); return; }
  if (G.phase === 'battle') { const o = G.V[v].owner; if (o === null || o === ME) return; doAction({ t: 'battle', v }); return; }
  if (G.phase !== 'main') return;
  if (ui.mode === 'settlement' && afford(G, ME, 'settlement') && canSettle(G, v, ME, false)) { ui.mode = null; doAction({ t: 'settle', v }); }
  else if (ui.mode === 'city' && G.V[v].owner === ME && !G.V[v].city && afford(G, ME, 'city')) { ui.mode = null; doAction({ t: 'city', v }); }
}
function onEdge(e: number): void {
  const G = app.G!, ME = app.me;
  if (!myTurn()) return;
  if (G.phase === 'setup') { if (G.setupStep === 'road' && canRoad(G, e, ME)) doAction({ t: 'road', e }); return; }
  if (G.phase === 'main' && ui.mode === 'road' && afford(G, ME, 'road') && canRoad(G, e, ME)) doAction({ t: 'road', e });
}

export function initBoard(): void {
  $('#board').addEventListener('click', ev => {
    const t = (ev.target as Element).closest<SVGElement | HTMLElement>('[data-v],[data-e]'); if (!t) return;
    if (t.dataset.v !== undefined) onVertex(+t.dataset.v); else onEdge(+(t.dataset.e as string));
  });
}
