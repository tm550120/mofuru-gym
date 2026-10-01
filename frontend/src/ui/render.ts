/* 画面全体の描画 */
import { clearDuties, myTurn } from '../app/session';
import { D } from '../app/settings';
import { app, isOnline } from '../app/state';
import { DIE, GOAL, ICON, JA, MAX_CITIES, MAX_GYMS, RES, TYPE_JA } from '../game/constants';
import { die } from '../game/random';
import { afford, canEvolve, citiesLeft, citySpots, gymsLeft, isCpu, roadSpots, settleSpots, total, vp } from '../game/rules';
import { Net } from '../net/online';
import { monSVG } from './art';
import { battleUI, closeBattle, showBattle } from './battle';
import { renderBoard } from './board';
import { $, esc } from './dom';
import { ui, type UiMode } from './local';
import { renderDiscard, renderOffer } from './sheets';

let toastT: ReturnType<typeof setTimeout> | null = null, diceT: ReturnType<typeof setInterval> | null = null;

/** 新しいゲームを始めるときに、この端末の表示状態を初期化する */
export function resetLocalUI(): void {
  ui.mode = null; ui.prevRes = null; ui.overShown = false; battleUI.shownId = 0; app.pending = false; ui.seenLogN = 0; ui.seenRollN = 0;
  clearDuties(); if (diceT) clearInterval(diceT); diceT = null;
  closeBattle(true);
  ['tradeBg', 'overBg', 'evoBg', 'battleBg', 'offerBg', 'discBg', 'logBg'].forEach(id => $('#' + id).classList.remove('show'));
  $('#toast').classList.remove('show');
}
/** 読み込んだ状態から表示を始めるとき：過去の演出を再生しない */
export function adoptLoaded(): void {
  resetLocalUI();
  const G = app.G; if (!G) return;
  ui.seenLogN = G.logN || 0; ui.seenRollN = G.rollN || 0; battleUI.shownId = G.battle ? G.battle.id : 0;
}

function status(): string {
  const G = app.G!, ME = app.me;
  const p = G.players[G.cur];
  if (G.phase === 'over') return 'ゲーム終了';
  if (G.phase === 'discard' && G.discard) {
    if (G.discard[ME] && !isCpu(G, ME)) return `🎲7！ 手札を${G.discard[ME]}枚捨ててください`;
    return `🎲7！ ${Object.keys(G.discard).map(i => G.players[+i].name).join('・')}が捨てる資源を選んでいます…`;
  }
  if (G.offer) {
    if (G.offer.resp[ME] === 'pending' && !isCpu(G, ME)) return `🤝 ${G.players[G.offer.from].name}から交換の提案があります`;
    return `🤝 ${G.players[G.offer.from].name}が交換を提案中…`;
  }
  if (p.disconnected) return `${p.name}の接続が切れました…`;
  if (G.cur !== ME || isCpu(G, ME)) return `${p.name}の番…`;
  if (G.busy || app.pending) return '通信中…';
  if (G.phase === 'setup') return G.setupStep === 'settlement' ? `あなたの番：ジムを置く交差点をタップ（${G.setupIdx < G.players.length ? '1' : '2'}つ目）` : 'あなたの番：つながる道を置く辺をタップ';
  if (G.phase === 'roll') return 'あなたの番：サイコロを振ろう';
  if (G.phase === 'battle') return '⚔️ 挑戦するジムをタップ（％は勝率）';
  const modeMsg: Record<UiMode, string> = { road: '道を置く辺をタップ', settlement: 'ジムを置く交差点をタップ', city: '都市にするジムをタップ' };
  return (ui.mode && modeMsg[ui.mode]) || `建設・進化・交換するか、ターン終了（${vp(G, ME)}/${GOAL}点）`;
}

/** 新しい出来事を画面上部に少しのあいだ表示（CPUや他の人の動きを追えるように） */
function showToast(t: string): void {
  const el = $('#toast'); el.textContent = t; el.classList.add('show');
  if (toastT) clearTimeout(toastT); toastT = setTimeout(() => el.classList.remove('show'), Math.max(1500, D(2200)));
}
function toastNew(): boolean {
  const G = app.G!, ME = app.me;
  const n = G.logN || 0; if (n <= ui.seenLogN) { ui.seenLogN = n; return false; }
  const k = Math.min(n - ui.seenLogN, 3); ui.seenLogN = n;
  /* 自分の番に自分で建てたときなどは出さない（すでに見えている） */
  const quiet = G.cur === ME && !isCpu(G, ME) && G.phase === 'main' && !G.offer;
  const lines = G.log.slice(0, k).reverse().filter(l => !quiet || /🤝|⚔️|最長|チャンピオン/.test(l));
  if (lines.length) showToast(lines.join('\n'));
  return true;
}
/** サイコロ：振られたら少し転がしてから結果を出す */
function renderDice(): void {
  const G = app.G!, el = $('#dice'), [a, b] = G.dice;
  const fin = (): void => { el.innerHTML = `${DIE[a]}${DIE[b]}<small>${a + b}</small>`; el.classList.toggle('seven', a + b === 7 && (G.rollN || 0) > 0); };
  if ((G.rollN || 0) !== ui.seenRollN) {
    ui.seenRollN = G.rollN || 0; if (diceT) clearInterval(diceT); let n = 0;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { diceT = null; fin(); return; }
    const t = diceT = setInterval(() => { el.innerHTML = `${DIE[die()]}${DIE[die()]}<small>…</small>`; if (++n >= 8) { clearInterval(t); if (diceT === t) diceT = null; fin(); } }, 70);
    return;
  }
  if (!diceT) fin();
}

/** ジム・都市のボタン：右上に残り個数。上限に達したら、下の文字（必要な資源）を「上限◯個」にして理由が分かるようにする */
function renderLimits(): void {
  const G = app.G!, ME = app.me;
  const lim: Record<'settlement' | 'city', { left: number; max: number }> = {
    settlement: { left: gymsLeft(G, ME), max: MAX_GYMS },
    city: { left: citiesLeft(G, ME), max: MAX_CITIES },
  };
  (Object.keys(lim) as ('settlement' | 'city')[]).forEach(k => {
    const b = document.querySelector<HTMLButtonElement>(`.ab[data-act="${k}"]`); if (!b) return;
    const span = b.querySelector('span'), tag = b.querySelector<HTMLElement>('.lim'); if (!span || !tag) return;
    if (!b.dataset.cost) b.dataset.cost = span.textContent || '';
    const { left, max } = lim[k], full = left === 0;
    span.textContent = full ? `上限${max}個` : b.dataset.cost;
    tag.textContent = full ? '上限' : `あと${left}`; tag.hidden = G.phase === 'setup';
    b.classList.toggle('full', full);
  });
}

export function render(): void {
  const G = app.G; if (!G) return;
  const ME = app.me, MODE = app.mode;
  const online = isOnline();
  if (G.battle && G.battle.id > battleUI.shownId) showBattle(G.battle);
  const me = G.players[ME];
  const can = myTurn() && G.phase === 'main';
  const ok: Record<UiMode | 'evolve' | 'trade', boolean> = {
    road: can && afford(G, ME, 'road') && roadSpots(G, ME).length > 0,
    settlement: can && afford(G, ME, 'settlement') && settleSpots(G, ME, false).length > 0,
    city: can && afford(G, ME, 'city') && citySpots(G, ME).length > 0,
    evolve: can && canEvolve(G, ME),
    trade: can && (RES.some(r => me.res[r] >= 4) || total(me) > 0),
  };
  if (ui.mode && !ok[ui.mode]) ui.mode = null;
  if (!ok.trade) $('#tradeBg').classList.remove('show');
  if (!ok.evolve) $('#evoBg').classList.remove('show');
  renderBoard();
  const seq = G.seq || G.players.map((_, i) => i);
  $('#players').style.gridTemplateColumns = `repeat(${G.players.length},1fr)`;
  $('#players').innerHTML = seq.map((i, k) => { const p = G.players[i]; return `<div class="pl ${i === G.cur && G.phase !== 'over' ? 'turn' : ''}" style="--c:${p.color}">${monSVG(p.mon)}<div class="tx"><div class="pn"><i></i>${esc(p.name)}${p.disconnected ? ' ⚠️' : ''}</div><div class="ps"><b>★${vp(G, i)}</b><span>🃏${total(p)}</span><span>🏅${p.badges}</span><span title="ジムとジムをつなぐ道">🛤${G.lens[i] || 0}</span><span>${k + 1}番</span>${online && i === ME ? '<em style="background:var(--ink);color:var(--panel)">自分</em>' : ''}${G.lr === i ? '<em>最長</em>' : ''}${G.champ === i ? '<em>王者</em>' : ''}</div></div></div>`; }).join('');
  $('#msg').textContent = status();
  $('#msg').style.background = G.cur !== ME && G.phase !== 'over' ? G.players[G.cur].color : 'var(--sea)';
  renderDice();
  $('#mymon').innerHTML = `${monSVG(me.mon)}<span>${me.mon ? TYPE_JA[me.mon] + 'タイプ' : '進化前'}</span>`;
  const prev = ui.prevRes;
  const flash = prev ? RES.filter(r => me.res[r] > prev[r]) : []; ui.prevRes = { ...me.res };
  $('#res').innerHTML = RES.map(r => `<div class="rc ${flash.includes(r) ? 'flash' : ''}"><span class="ic">${ICON[r]}</span><b>${me.res[r]}</b>${JA[r]}</div>`).join('');
  $('#log').innerHTML = G.log.slice(0, 2).map(l => `<div>${esc(l)}</div>`).join('');
  toastNew();
  document.querySelectorAll<HTMLButtonElement>('.ab').forEach(b => { const a = b.dataset.act as keyof typeof ok; b.disabled = !ok[a]; b.classList.toggle('on', ui.mode === a && G.phase === 'main'); });
  renderLimits();
  $('#newBtn').hidden = MODE === 'guest' || MODE === 'tutorial';
  $('#roomTag').hidden = !online; if (online) $('#roomTag').textContent = '部屋 ' + Net.code();
  renderOffer(); renderDiscard();
  const m = $<HTMLButtonElement>('#main');
  if (G.phase === 'over') {
    m.textContent = MODE === 'guest' ? 'ホストの再開を待っています' : 'もう一度遊ぶ'; m.disabled = MODE === 'guest';
    if (!ui.overShown && !battleUI.open) {
      ui.overShown = true; const w = G.winner as number;
      $('#overIcon').textContent = w === ME ? '🏆' : '🌊';
      $('#overTitle').textContent = w === ME ? 'あなたの勝ち！' : `${G.players[w].name}の勝ち`;
      $('#overText').textContent = G.players.map((p, j) => `${p.name} ${vp(G, j)}点`).join('／');
      $('#again').hidden = MODE === 'guest';
      setTimeout(() => { if (app.G && app.G.phase === 'over') $('#overBg').classList.add('show'); }, 400);
    }
    return;
  }
  if (G.phase === 'discard') { m.textContent = G.discard && G.discard[ME] ? '捨てる資源を選んでください' : '資源を捨てるのを待っています…'; m.disabled = true; }
  else if (G.offer && G.cur === ME) { m.textContent = '交換の返事を待っています…'; m.disabled = true; }
  else if (!myTurn()) { m.textContent = G.cur !== ME ? `${G.players[G.cur].name}の番です` : 'お待ちください…'; m.disabled = true; }
  else if (G.phase === 'setup') { m.textContent = '初期配置中'; m.disabled = true; }
  else if (G.phase === 'roll') { m.textContent = '🎲 サイコロを振る'; m.disabled = false; }
  else if (G.phase === 'battle') { m.textContent = '挑戦しない'; m.disabled = false; }
  else { m.textContent = 'ターン終了'; m.disabled = false; }
}
