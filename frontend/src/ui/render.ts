/* 画面全体の描画 */
import { myTurn } from '../app/session';
import { app, isOnline } from '../app/state';
import { DIE, GOAL, ICON, JA, RES, TYPE_JA } from '../game/constants';
import { afford, canEvolve, citySpots, isCpu, roadSpots, settleSpots, total, vp } from '../game/rules';
import { Net } from '../net/online';
import { monSVG } from './art';
import { battleUI, closeBattle, showBattle } from './battle';
import { renderBoard } from './board';
import { $, esc } from './dom';
import { ui, type UiMode } from './local';

/** 新しいゲームを始めるときに、この端末の表示状態を初期化する */
export function resetLocalUI(): void {
  ui.mode = null; ui.prevRes = null; ui.overShown = false; battleUI.shownId = 0; app.pending = false;
  closeBattle(true);
  ['tradeBg', 'overBg', 'evoBg', 'battleBg'].forEach(id => $('#' + id).classList.remove('show'));
}

function status(): string {
  const G = app.G!, ME = app.me;
  const p = G.players[G.cur];
  if (G.phase === 'over') return 'ゲーム終了';
  if (p.disconnected) return `${p.name}の接続が切れました…`;
  if (G.cur !== ME || isCpu(G, ME)) return `${p.name}の番…`;
  if (G.busy || app.pending) return '通信中…';
  if (G.phase === 'setup') return G.setupStep === 'settlement' ? `あなたの番：ジムを置く交差点をタップ（${G.setupIdx < G.players.length ? '1' : '2'}つ目）` : 'あなたの番：つながる道を置く辺をタップ';
  if (G.phase === 'roll') return 'あなたの番：サイコロを振ろう';
  if (G.phase === 'battle') return '⚔️ 挑戦するジムをタップ（％は勝率）';
  const modeMsg: Record<UiMode, string> = { road: '道を置く辺をタップ', settlement: 'ジムを置く交差点をタップ', city: '都市にするジムをタップ' };
  return (ui.mode && modeMsg[ui.mode]) || `建設・進化・交換するか、ターン終了（${vp(G, ME)}/${GOAL}点）`;
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
    trade: can && RES.some(r => me.res[r] >= 4),
  };
  if (ui.mode && !ok[ui.mode]) ui.mode = null;
  renderBoard();
  $('#players').style.gridTemplateColumns = `repeat(${G.players.length},1fr)`;
  $('#players').innerHTML = G.players.map((p, i) => `<div class="pl ${i === G.cur && G.phase !== 'over' ? 'turn' : ''}" style="--c:${p.color}">${monSVG(p.mon)}<div class="tx"><div class="pn"><i></i>${esc(p.name)}${p.disconnected ? ' ⚠️' : ''}</div><div class="ps"><b>★${vp(G, i)}</b><span>🃏${total(p)}</span><span>🏅${p.badges}</span>${online && i === ME ? '<em style="background:var(--ink);color:var(--panel)">自分</em>' : ''}${G.lr === i ? '<em>最長</em>' : ''}${G.champ === i ? '<em>王者</em>' : ''}</div></div></div>`).join('');
  $('#msg').textContent = status();
  $('#msg').style.background = G.cur !== ME && G.phase !== 'over' ? G.players[G.cur].color : 'var(--sea)';
  $('#dice').innerHTML = `${DIE[G.dice[0]]}${DIE[G.dice[1]]}<small>${G.dice[0] + G.dice[1]}</small>`;
  $('#mymon').innerHTML = `${monSVG(me.mon)}<span>${me.mon ? TYPE_JA[me.mon] + 'タイプ' : '進化前'}</span>`;
  const prev = ui.prevRes;
  const flash = prev ? RES.filter(r => me.res[r] > prev[r]) : []; ui.prevRes = { ...me.res };
  $('#res').innerHTML = RES.map(r => `<div class="rc ${flash.includes(r) ? 'flash' : ''}"><span class="ic">${ICON[r]}</span><b>${me.res[r]}</b>${JA[r]}</div>`).join('');
  $('#log').innerHTML = G.log.slice(0, 2).map(l => `<div>${esc(l)}</div>`).join('');
  document.querySelectorAll<HTMLButtonElement>('.ab').forEach(b => { const a = b.dataset.act as keyof typeof ok; b.disabled = !ok[a]; b.classList.toggle('on', ui.mode === a && G.phase === 'main'); });
  $('#newBtn').hidden = MODE === 'guest';
  $('#roomTag').hidden = !online; if (online) $('#roomTag').textContent = '部屋 ' + Net.code();
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
  if (!myTurn()) { m.textContent = G.cur !== ME ? `${G.players[G.cur].name}の番です` : 'お待ちください…'; m.disabled = true; }
  else if (G.phase === 'setup') { m.textContent = '初期配置中'; m.disabled = true; }
  else if (G.phase === 'roll') { m.textContent = '🎲 サイコロを振る'; m.disabled = false; }
  else if (G.phase === 'battle') { m.textContent = '挑戦しない'; m.disabled = false; }
  else { m.textContent = 'ターン終了'; m.disabled = false; }
}
