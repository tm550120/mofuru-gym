/* 交換・進化のシートとダイアログ */
import { doAction, myTurn } from '../app/session';
import { app } from '../app/state';
import { BEATS, ICON, JA, RES, TYPE_JA, isResource } from '../game/constants';
import { canEvolve, monName } from '../game/rules';
import type { Resource } from '../game/types';
import { monSVG } from './art';
import { $ } from './dom';

/* ---------- trade ---------- */
let tGive: Resource | null = null, tGet: Resource | null = null;
export function openTrade(): void { tGive = null; tGet = null; renderTrade(); $('#tradeBg').classList.add('show'); }
function renderTrade(): void {
  const me = app.G!.players[app.me];
  $('#give').innerHTML = RES.map(r => `<button data-r="${r}" class="${tGive === r ? 'sel' : ''}" ${me.res[r] < 4 ? 'disabled' : ''}><span class="ic">${ICON[r]}</span>${me.res[r]}枚</button>`).join('');
  $('#get').innerHTML = RES.map(r => `<button data-r="${r}" class="${tGet === r ? 'sel' : ''}" ${r === tGive ? 'disabled' : ''}><span class="ic">${ICON[r]}</span>${JA[r]}</button>`).join('');
  $<HTMLButtonElement>('#tOk').disabled = !(tGive && tGet && tGive !== tGet);
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
  $('#give').addEventListener('click', e => { const r = pickedRes(e); if (!r) return; tGive = r; if (tGet === tGive) tGet = null; renderTrade(); });
  $('#get').addEventListener('click', e => { const r = pickedRes(e); if (!r) return; tGet = r; renderTrade(); });
  $('#tCancel').onclick = () => $('#tradeBg').classList.remove('show');
  $('#tOk').onclick = () => {
    if (!myTurn() || !tGive || !tGet || app.G!.players[app.me].res[tGive] < 4) return;
    $('#tradeBg').classList.remove('show'); doAction({ t: 'trade', give: tGive, get: tGet });
  };

  $('#evoList').addEventListener('click', e => { const r = pickedRes(e); if (!r) return; eSel = r; renderEvo(); });
  $('#eCancel').onclick = () => $('#evoBg').classList.remove('show');
  $('#eOk').onclick = () => {
    if (!myTurn() || !eSel || !canEvolve(app.G!, app.me) || app.G!.players[app.me].res[eSel] < 3) return;
    $('#evoBg').classList.remove('show'); doAction({ t: 'evolve', r: eSel });
  };

  ['tradeBg', 'evoBg', 'helpBg'].forEach(id => { const bg = $('#' + id); bg.addEventListener('click', e => { if (e.target === bg) bg.classList.remove('show'); }); });
}
