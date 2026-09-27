/* バトル演出（G.battle を全員の端末で表示する） */
import { hooks } from '../app/session';
import { app } from '../app/state';
import { battleSound } from '../audio/outcome';
import { sfxBattleStart, sfxDiceTick, sfxResult } from '../audio/sfx';
import { DIE, TYPE_JA } from '../game/constants';
import { die } from '../game/random';
import { isCpu, monName } from '../game/rules';
import type { BattleResult, Bonus, Mon } from '../game/types';
import { monSVG } from './art';
import { $, esc } from './dom';

export const battleUI: {
  /** 表示中のバトル */
  open: BattleResult | null;
  /** 表示済みの最新バトルID */
  shownId: number;
} = { open: null, shownId: 0 };
let waiters: (() => void)[] = [];
let timers: ReturnType<typeof setTimeout>[] = [];

function sideHTML(p: number, m: Mon, roll: number, b: Bonus[], role: string): string {
  const pl = app.G!.players[p];
  return `<div class="nm">${esc(pl.name)}<br><small style="font-weight:500;color:var(--sub)">${role}</small></div>${monSVG(m)}<div class="mn">${monName(m)}${m ? '（' + TYPE_JA[m] + '）' : ''}</div>
  <div class="dv">${DIE[roll]}</div><div class="bn">${b.map(x => x[0] + '+' + x[1]).join(' ') || 'ボーナスなし'}</div><div class="tt" data-tot>?</div>`;
}

export function closeBattle(silent?: boolean): void {
  timers.forEach(t => { clearTimeout(t); clearInterval(t); }); timers = [];
  $('#battleBg').classList.remove('show'); $('#bOk').onclick = null;
  battleUI.open = null; const w = waiters; waiters = []; w.forEach(f => f());
  if (!silent) hooks.render();
}

export function showBattle(b: BattleResult): void {
  const G = app.G!;
  closeBattle(true);
  battleUI.shownId = b.id; battleUI.open = b;
  const { a, d } = b;
  $('#bTitle').textContent = `${b.city ? '都市' : ''}ジムバトル`;
  const bA = $('#bA'), bD = $('#bD');
  bA.style.setProperty('--c', G.players[a].color); bD.style.setProperty('--c', G.players[d].color);
  bA.className = 'side'; bD.className = 'side';
  bA.innerHTML = sideHTML(a, b.am, b.ra, b.ba, '挑戦者'); bD.innerHTML = sideHTML(d, b.dm, b.rd, b.bd, 'ジム');
  $('#bResult').textContent = 'サイコロを振っています…';
  const ok = $<HTMLButtonElement>('#bOk'); ok.disabled = true;
  $('#battleBg').classList.add('show');
  sfxBattleStart();
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let n = 0; const dvA = bA.querySelector('.dv') as HTMLElement, dvD = bD.querySelector('.dv') as HTMLElement;
  let done = false;
  const spin = setInterval(() => { dvA.textContent = DIE[die()]; dvD.textContent = DIE[die()]; if (++n >= 8) finish(); else sfxDiceTick(); }, reduce ? 0 : 90);
  timers.push(spin);
  function finish(): void {
    if (done) return; done = true; clearInterval(spin);
    dvA.textContent = DIE[b.ra]; dvD.textContent = DIE[b.rd];
    (bA.querySelector('[data-tot]') as HTMLElement).textContent = String(b.ta); (bD.querySelector('[data-tot]') as HTMLElement).textContent = String(b.td);
    (b.win === a ? bA : bD).classList.add('win');
    $('#bResult').textContent = b.text;
    sfxResult(battleSound(b, app.me));
    ok.disabled = false;
    const involved = (a === app.me || d === app.me) && !isCpu(app.G!, app.me);
    if (!involved) timers.push(setTimeout(() => closeBattle(), 2600));
    ok.onclick = () => closeBattle();
  }
}

/** バトル演出が閉じられるまで待つ */
export function waitBattleClosed(): Promise<void> {
  return new Promise(r => { if (!battleUI.open) r(); else waiters.push(r); });
}
