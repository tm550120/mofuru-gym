/* 交換・交換の提案・捨て札・出来事の履歴・進化のシートとダイアログ */
import { doAction, myTurn } from '../app/session';
import { app } from '../app/state';
import { BEATS, ICON, JA, RES, TYPE_JA, isResource } from '../game/constants';
import { canEvolve, fmtRes, hasRes, isCpu, monName, sumRes, total } from '../game/rules';
import type { Bundle, OfferTarget, Resource } from '../game/types';
import { monSVG } from './art';
import { $, esc } from './dom';

/* ---------- ＋／−で枚数を選ぶ欄 ---------- */
/** max(r) までしか増やせない。sub(r) は下の小さい説明 */
function stepHTML(counts: Bundle, max: (r: Resource) => number, sub: (r: Resource) => string): string {
  return RES.map(r => {
    const n = counts[r] || 0;
    return `<div class="stp ${n ? 'on' : ''}"><span class="ic">${ICON[r]}</span><b>${n}</b><small>${sub(r)}</small><div class="pm"><button data-r="${r}" data-d="-1" aria-label="${JA[r]}を減らす" ${n <= 0 ? 'disabled' : ''}>−</button><button data-r="${r}" data-d="1" aria-label="${JA[r]}を増やす" ${n >= max(r) ? 'disabled' : ''}>＋</button></div></div>`;
  }).join('');
}
function stepClick(e: Event, counts: Bundle, max: (r: Resource) => number, after: (r: Resource) => void): void {
  const b = (e.target as Element).closest<HTMLButtonElement>('button[data-r]'); if (!b || b.disabled || !isResource(b.dataset.r)) return;
  const r = b.dataset.r, n = (counts[r] || 0) + (+(b.dataset.d || 0));
  if (n < 0 || n > max(r)) return; counts[r] = n; after(r);
}
/** 0枚の資源を除いた組 */
const compact = (o: Bundle): Bundle => { const r: Bundle = {}; RES.forEach(k => { if (o[k]) r[k] = o[k]; }); return r; };

/* ---------- trade ---------- */
type TradeTab = 'player' | 'bank';
let tTab: TradeTab = 'player', tGive: Resource | null = null, tGet: Resource | null = null;
let pTo: OfferTarget = 'all', pGive: Bundle = {}, pWant: Bundle = {};
export function openTrade(): void {
  tGive = null; tGet = null; pGive = {}; pWant = {}; pTo = 'all';
  renderTrade(); $('#tradeBg').classList.add('show');
}
function renderTrade(): void {
  const G = app.G!, ME = app.me, me = G.players[ME];
  $('#tTabs').querySelectorAll<HTMLButtonElement>('button').forEach(b => b.classList.toggle('sel', b.dataset.tab === tTab));
  $('#tBank').hidden = tTab !== 'bank'; $('#tPlayer').hidden = tTab !== 'player';
  $('#give').innerHTML = RES.map(r => `<button data-r="${r}" class="${tGive === r ? 'sel' : ''}" ${me.res[r] < 4 ? 'disabled' : ''}><span class="ic">${ICON[r]}</span>${me.res[r]}枚</button>`).join('');
  $('#get').innerHTML = RES.map(r => `<button data-r="${r}" class="${tGet === r ? 'sel' : ''}" ${r === tGive ? 'disabled' : ''}><span class="ic">${ICON[r]}</span>${JA[r]}</button>`).join('');
  $<HTMLButtonElement>('#tOk').disabled = !(tGive && tGet && tGive !== tGet);
  const others = G.players.map((_, i) => i).filter(i => i !== ME);
  $('#pTo').innerHTML = [['all', 'みんな'], ...others.map(i => [String(i), G.players[i].name])].map(([k, l]) => `<button data-to="${k}" class="${String(pTo) === k ? 'sel' : ''}">${esc(l)}</button>`).join('');
  $('#pGive').innerHTML = stepHTML(pGive, r => me.res[r], r => `持${me.res[r]}`);
  $('#pWant').innerHTML = stepHTML(pWant, () => 9, r => JA[r]);
  $<HTMLButtonElement>('#pOk').disabled = !(sumRes(pGive) && sumRes(pWant));
}

/* ---------- 交換の提案：提案した人には返事の状況、提案された人には受ける／断る ---------- */
export function renderOffer(): void {
  const bg = $('#offerBg'), G = app.G, ME = app.me, o = G && G.offer;
  const human = !!G && !isCpu(G, ME);
  const mine = !!o && human && o.from === ME, asked = !!o && human && o.resp[ME] === 'pending';
  if (!G || !o || (!mine && !asked)) { bg.classList.remove('show'); return; }
  const box = $('#oBtns'); box.innerHTML = '';
  const btn = (label: string, pri: boolean, dis: boolean, fn: () => void): void => {
    const el = document.createElement('button'); el.textContent = label; if (pri) el.className = 'pri'; el.disabled = dis; el.onclick = fn; box.appendChild(el);
  };
  if (mine) {
    $('#oTitle').textContent = '🤝 交換を提案中';
    $('#oBody').innerHTML = `<div class="obox">あなたが出す：<span class="big2">${fmtRes(o.give)}</span><br>あなたがほしい：<span class="big2">${fmtRes(o.want)}</span></div>
      <ul class="olist">${Object.keys(o.resp).map(i => `<li><span>${esc(G.players[+i].name)}</span><b>${o.resp[+i] === 'decline' ? '断った' : '考え中…'}</b></li>`).join('')}</ul>`;
    btn('提案を取り下げる', false, app.pending, () => doAction({ t: 'cancelOffer' }));
  } else {
    const f = G.players[o.from], can = hasRes(G, ME, o.want);
    $('#oTitle').textContent = `🤝 ${f.name}から交換の提案`;
    $('#oBody').innerHTML = `<div class="obox">あなたがもらう：<span class="big2">${fmtRes(o.give)}</span><br>あなたが渡す：<span class="big2">${fmtRes(o.want)}</span></div>
      <p class="tinfo">${can ? '受けるとすぐに交換されます。' : '渡す資源が足りないので受けられません。'}${o.to === 'all' ? '（全員への提案：先に受けた人と成立）' : ''}</p>`;
    btn('断る', false, app.pending, () => doAction({ t: 'respond', ok: false }));
    btn('受ける', true, app.pending || !can, () => doAction({ t: 'respond', ok: true }));
  }
  bg.classList.add('show');
}

/* ---------- 7のときに捨てる資源を選ぶ ---------- */
let dSel: Bundle = {}, dKey = '';
const discardNeed = (): number => { const G = app.G; return (G && G.phase === 'discard' && G.discard && !isCpu(G, app.me) && G.discard[app.me]) || 0; };
export function renderDiscard(): void {
  const bg = $('#discBg'), need = discardNeed();
  if (!need) { bg.classList.remove('show'); return; }
  const G = app.G!;
  const key = G.gid + ':' + G.rollN; if (key !== dKey) { dKey = key; dSel = {}; }
  const me = G.players[app.me], n = sumRes(dSel);
  $('#dInfo').textContent = `手札が${total(me)}枚あるので、${need}枚捨ててください（あと${need - n}枚）`;
  $('#dPick').innerHTML = stepHTML(dSel, r => Math.min(me.res[r], (dSel[r] || 0) + need - n), r => `持${me.res[r]}`);
  $<HTMLButtonElement>('#dOk').disabled = n !== need || app.pending;
  bg.classList.add('show');
}

/* ---------- evolve ---------- */
let eSel: Resource | null = null;
export function openEvo(): void { eSel = null; renderEvo(); $('#evoBg').classList.add('show'); }
function renderEvo(): void {
  const me = app.G!.players[app.me];
  const weak = Object.fromEntries(Object.entries(BEATS).map(([k, v]) => [v, k])) as Record<Resource, Resource>;
  $('#evoList').innerHTML = RES.map(r => `<button data-r="${r}" class="${eSel === r ? 'sel' : ''}" ${me.res[r] < 3 ? 'disabled' : ''}>${monSVG(r)}<div><b>${monName(r)}</b><small>${TYPE_JA[r]}タイプ ・ ${ICON[r]}×3（${me.res[r]}枚）<br>強い：${TYPE_JA[BEATS[r]]}／弱い：${TYPE_JA[weak[r]]}</small></div></button>`).join('');
  $<HTMLButtonElement>('#eOk').disabled = !eSel;
}

/* ---------- dialog ---------- */
export interface DialogButton { label: string; pri?: boolean; fn?: () => void }
export function dialog(title: string, text: string, buttons: DialogButton[]): void {
  $('#dlgTitle').textContent = title; $('#dlgText').textContent = text;
  const box = $('#dlgBtns'); box.innerHTML = '';
  buttons.forEach(b => {
    const el = document.createElement('button'); el.textContent = b.label; if (b.pri) el.className = 'pri';
    el.onclick = () => { $('#dlgBg').classList.remove('show'); if (b.fn) b.fn(); }; box.appendChild(el);
  });
  $('#dlgBg').classList.add('show');
}

const pickedRes = (e: Event): Resource | null => {
  const b = (e.target as Element).closest('button');
  if (!b || b.disabled || !isResource(b.dataset.r)) return null;
  return b.dataset.r;
};

export function initSheets(): void {
  /* trade */
  $('#tTabs').addEventListener('click', e => { const b = (e.target as Element).closest('button'); if (!b) return; tTab = b.dataset.tab === 'bank' ? 'bank' : 'player'; renderTrade(); });
  $('#give').addEventListener('click', e => { const r = pickedRes(e); if (!r) return; tGive = r; if (tGet === tGive) tGet = null; renderTrade(); });
  $('#get').addEventListener('click', e => { const r = pickedRes(e); if (!r) return; tGet = r; renderTrade(); });
  $('#pTo').addEventListener('click', e => { const b = (e.target as Element).closest('button'); if (!b) return; pTo = b.dataset.to === 'all' ? 'all' : +(b.dataset.to || 0); renderTrade(); });
  $('#pGive').addEventListener('click', e => stepClick(e, pGive, r => app.G!.players[app.me].res[r], r => { if (pGive[r]) pWant[r] = 0; renderTrade(); }));
  $('#pWant').addEventListener('click', e => stepClick(e, pWant, () => 9, r => { if (pWant[r]) pGive[r] = 0; renderTrade(); }));
  $('#tCancel').onclick = $('#pCancel').onclick = () => $('#tradeBg').classList.remove('show');
  $('#tOk').onclick = () => {
    if (!myTurn() || !tGive || !tGet || app.G!.players[app.me].res[tGive] < 4) return;
    $('#tradeBg').classList.remove('show'); doAction({ t: 'trade', give: tGive, get: tGet });
  };
  $('#pOk').onclick = () => {
    if (!myTurn() || app.G!.offer || !sumRes(pGive) || !sumRes(pWant)) return;
    $('#tradeBg').classList.remove('show'); doAction({ t: 'offer', to: pTo, give: compact(pGive), want: compact(pWant) });
  };

  /* discard */
  $('#dPick').addEventListener('click', e => {
    const G = app.G; if (!G) return; const me = G.players[app.me], need = (G.discard && G.discard[app.me]) || 0;
    stepClick(e, dSel, r => Math.min(me.res[r], (dSel[r] || 0) + need - sumRes(dSel)), () => renderDiscard());
  });
  $('#dOk').onclick = () => {
    const G = app.G;
    if (!G || !G.discard || !G.discard[app.me] || sumRes(dSel) !== G.discard[app.me]) return;
    doAction({ t: 'discard', r: compact(dSel) });
  };

  /* 出来事の履歴 */
  $('#log').addEventListener('click', () => { const G = app.G; if (!G) return; $('#logList').innerHTML = G.log.map(l => `<li>${esc(l)}</li>`).join(''); $('#logBg').classList.add('show'); });
  $('#lgClose').onclick = () => $('#logBg').classList.remove('show');

  /* evolve */
  $('#evoList').addEventListener('click', e => { const r = pickedRes(e); if (!r) return; eSel = r; renderEvo(); });
  $('#eCancel').onclick = () => $('#evoBg').classList.remove('show');
  $('#eOk').onclick = () => {
    if (!myTurn() || !eSel || !canEvolve(app.G!, app.me) || app.G!.players[app.me].res[eSel] < 3) return;
    $('#evoBg').classList.remove('show'); doAction({ t: 'evolve', r: eSel });
  };

  ['tradeBg', 'evoBg', 'helpBg', 'logBg'].forEach(id => { const bg = $('#' + id); bg.addEventListener('click', e => { if (e.target === bg) bg.classList.remove('show'); }); });
}
