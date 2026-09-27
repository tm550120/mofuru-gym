/* タイトル画面・モード選択・ヘッダーのボタン */
import { newGame, resumeCpuGame } from '../app/session';
import { SAVE_CPU, loadCpuSave, loadGuestSave, loadHostSave } from '../app/save';
import { setBgm, setCpuOrder, setSound, setSpeed, settings } from '../app/settings';
import { app, isOnline } from '../app/state';
import { refreshBgm } from '../audio/bgm';
import { applyFeatureVisibility } from '../features';
import { COLORS, ICON, SQ3, TILE } from '../game/constants';
import { cpuSeq } from '../game/rules';
import type { TileType } from '../game/types';
import { Net } from '../net/online';
import { store } from '../storage';
import { house, monSVG } from './art';
import { $ } from './dom';
import { syncMusic } from './music';
import { resetLocalUI } from './render';

export type TitlePanel = 'menu' | 'cpu' | 'online' | 'lobby';

/** 新しい CPU 対戦を始める（席0=あなた（赤）、席1,2=CPU。手番はタイトルで選んだ順） */
export function startCpu(): void {
  store.del(SAVE_CPU);
  app.mode = 'cpu'; app.me = 0; hideTitle();
  newGame([{ name: 'あなた', type: 'local' }, { name: 'CPU 青', type: 'cpu' }, { name: 'CPU 橙', type: 'cpu' }], cpuSeq(settings.cpuOrder));
}
/** 保存しておいた CPU 対戦を、同じ盤面・同じ状態から再開する */
function resumeCpu(): void {
  const s = loadCpuSave();
  if (!s) { store.del(SAVE_CPU); refreshTitle(); return; }
  hideTitle(); resumeCpuGame(s);
}
export function playAgain(): void {
  if (app.mode === 'cpu') { $('#overBg').classList.remove('show'); app.mode = null; app.G = null; showTitle('cpu'); }
  else if (app.mode === 'host') Net.restart();
}
export function goTitle(): void {
  if (isOnline()) Net.leave();
  app.mode = null; app.G = null; app.pending = false;
  resetLocalUI();
  ['dlgBg', 'helpBg'].forEach(id => $('#' + id).classList.remove('show'));
  showTitle('menu');
}
export function hideTitle(): void { $('#title').classList.remove('show'); syncMusic(); }
export function showTitle(panel: TitlePanel): void {
  $('#title').classList.add('show'); $('#title').classList.toggle('compact', panel !== 'menu');
  $('#tMenu').hidden = panel !== 'menu'; $('#tCpu').hidden = panel !== 'cpu'; $('#tOnline').hidden = panel !== 'online'; $('#tLobby').hidden = panel !== 'lobby';
  if (panel !== 'lobby') $('#tNote2').textContent = '';
  if (panel === 'menu') refreshTitle();
  if (panel === 'cpu') renderSegs();
  syncMusic();
}
/** 続きから／再開ボタンの表示 */
export function refreshTitle(): void {
  const c = loadCpuSave(), h = loadHostSave(), g = loadGuestSave();
  $('#resumeCpuBtn').hidden = !c; if (c) $('#resumeCpuInfo').textContent = '前回のCPU対戦（' + (c.info || '') + '）';
  $('#resumeHostBtn').hidden = !h; if (h) $('#resumeHostInfo').textContent = `部屋 ${h.code}・同じコードで部屋を開き直します`;
  $('#resumeGuestBtn').hidden = !g; if (g) $('#resumeGuestInfo').textContent = `部屋 ${g.code} に再接続します`;
  $('#modeCpu').classList.toggle('pri', !c && !h && !g);
}
/** 進行スピード・手番・効果音・BGM の選択ボタンの表示 */
function renderSegs(): void {
  document.querySelectorAll<HTMLButtonElement>('.soundSeg button').forEach(b => b.classList.toggle('sel', (b.dataset.sound === 'on') === settings.sound));
  const sb = $('#soundBtn'); sb.textContent = settings.sound ? '🔊' : '🔇';
  sb.setAttribute('aria-label', settings.sound ? '効果音：オン（タップでオフ）' : '効果音：オフ（タップでオン）'); sb.setAttribute('aria-pressed', String(settings.sound));
  document.querySelectorAll<HTMLButtonElement>('.bgmSeg button').forEach(b => b.classList.toggle('sel', (b.dataset.bgm === 'on') === settings.bgm));
  const mb = $('#bgmBtn'); mb.textContent = '🎵'; mb.classList.toggle('muted', !settings.bgm);
  mb.setAttribute('aria-label', settings.bgm ? 'BGM：オン（タップでオフ）' : 'BGM：オフ（タップでオン）'); mb.setAttribute('aria-pressed', String(settings.bgm));
  document.querySelectorAll<HTMLButtonElement>('.speedSeg button').forEach(b => b.classList.toggle('sel', b.dataset.speed === settings.speed));
  $('#orderSeg').querySelectorAll<HTMLButtonElement>('button').forEach(b => b.classList.toggle('sel', b.dataset.o === settings.cpuOrder));
}
function drawTitle(): void {
  let s = ''; const r = 34;
  const R = 118, sea = [...Array(6)].map((_, i) => `${R * Math.cos(Math.PI / 3 * i)},${R * Math.sin(Math.PI / 3 * i)}`).join(' ');
  s += `<polygon points="${sea}" fill="var(--sea)" stroke="#f3e2b8" stroke-width="3" stroke-linejoin="round"/>`;
  const cells: [number, number, TileType][] = [[0, 0, 'desert'], [1, 0, 'wood'], [0, 1, 'wheat'], [-1, 1, 'sheep'], [-1, 0, 'brick'], [0, -1, 'ore'], [1, -1, 'wheat']];
  cells.forEach(([q, rr, t]) => {
    const x = r * SQ3 * (q + rr / 2), y = r * 1.5 * rr;
    const pts = [...Array(6)].map((_, i) => { const a = Math.PI / 180 * (60 * i - 30); return `${x + r * Math.cos(a)},${y + r * Math.sin(a)}`; }).join(' ');
    s += `<polygon points="${pts}" fill="${TILE[t]}" stroke="#f3e2b8" stroke-width="3" stroke-linejoin="round"/>`;
    if (t !== 'desert') s += `<text x="${x}" y="${y}" font-size="16" text-anchor="middle" dominant-baseline="central">${ICON[t]}</text>`;
  });
  s += house(r * SQ3 * .5 + r * SQ3 * .5, -r, COLORS[0], false) + house(-r * SQ3, r * 1.1, COLORS[1], true) + house(r * .9, r * 2.1, COLORS[2], false);
  $('#tMap').innerHTML = s;
  $('#tHero').innerHTML = monSVG(null);
  $('#tMons').innerHTML = (['wood', 'brick', 'sheep', 'wheat', 'ore'] as const).map(m => monSVG(m)).join('');
}

const NICK_KEY = 'mofuru-nick';
const readNick = (): string => { const n = $<HTMLInputElement>('#nick').value.trim(); if (n) store.set(NICK_KEY, n); return n || 'ゲスト'; };
const cleanCode = (s: string): string => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function initTitle(): void {
  /* header */
  $('#helpBtn').onclick = () => { renderSegs(); $('#helpBg').classList.add('show'); };
  $('#tHelp').onclick = () => { renderSegs(); $('#helpBg').classList.add('show'); };
  $('#hClose').onclick = () => $('#helpBg').classList.remove('show');
  document.querySelectorAll('.speedSeg').forEach(el => el.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-speed]'); if (!b) return; setSpeed(b.dataset.speed); renderSegs();
  }));
  document.querySelectorAll('.soundSeg').forEach(el => el.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-sound]'); if (!b) return; setSound(b.dataset.sound === 'on'); renderSegs();
  }));
  $('#soundBtn').onclick = () => { setSound(!settings.sound); renderSegs(); };
  document.querySelectorAll('.bgmSeg').forEach(el => el.addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-bgm]'); if (!b) return; setBgm(b.dataset.bgm === 'on'); renderSegs(); refreshBgm();
  }));
  $('#bgmBtn').onclick = () => { setBgm(!settings.bgm); renderSegs(); refreshBgm(); };
  $('#orderSeg').addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-o]'); if (!b) return; setCpuOrder(b.dataset.o); renderSegs();
  });
  $('#newBtn').onclick = () => {
    if (app.mode === 'cpu') {
      if (confirm('今のゲームを破棄して、新しいゲームを始めますか？\n（続きからは再開できなくなります）')) { store.del(SAVE_CPU); app.mode = null; app.G = null; resetLocalUI(); showTitle('cpu'); }
    } else if (app.mode === 'host') { if (confirm('同じメンバーで新しいゲームを始めますか？\n（今の盤面は破棄されます）')) Net.restart(); }
  };
  $('#homeBtn').onclick = () => {
    const MODE = app.mode;
    const msg = MODE === 'host' ? 'タイトルに戻りますか？\n（ホストが抜けるとオンライン対戦は終了します）' : MODE === 'guest' ? 'タイトルに戻りますか？\n（この対戦から抜けます）' : 'タイトルに戻りますか？\n（あとで「続きから」再開できます）';
    if (confirm(msg)) goTitle();
  };
  $('#again').onclick = playAgain;
  $('#overHome').onclick = goTitle;

  /* title screen */
  $('#modeCpu').onclick = () => showTitle('cpu');
  $('#cpuBack').onclick = () => showTitle('menu');
  $('#cpuStart').onclick = () => {
    if (loadCpuSave() && !confirm('保存されている「続きから」のゲームは消えます。新しいゲームを始めますか？')) return;
    startCpu();
  };
  $('#resumeCpuBtn').onclick = resumeCpu;
  $('#resumeHostBtn').onclick = () => { void Net.resumeHost(); };
  $('#resumeGuestBtn').onclick = () => Net.resumeGuest();
  $('#modeOnline').onclick = () => { $('#tNote1').textContent = ''; showTitle('online'); };
  $('#onlineBack').onclick = () => showTitle('menu');
  $('#hostBtn').onclick = () => { void Net.host(readNick()); };
  $('#joinBtn').onclick = () => {
    const c = cleanCode($<HTMLInputElement>('#codeIn').value);
    if (c.length !== 5) { $('#tNote1').textContent = '5文字の部屋コードを入力してください。'; return; }
    void Net.join(readNick(), c);
  };
  $('#codeIn').addEventListener('input', e => { const t = e.target as HTMLInputElement; t.value = cleanCode(t.value); });
  $('#lFill').onchange = () => Net.lobbyChanged();
  $('#lOrder').addEventListener('click', e => { const b = (e.target as Element).closest<HTMLButtonElement>('button[data-o]'); if (b && !b.disabled) Net.setOrderMode(b.dataset.o); });
  $('#lList').addEventListener('click', e => { const b = (e.target as Element).closest<HTMLButtonElement>('button.up'); if (b) Net.moveUp(+(b.dataset.k || 0)); });
  $('#startBtn').onclick = () => Net.start();
  $('#lobbyLeave').onclick = () => { goTitle(); };
  $('#copyBtn').onclick = async () => {
    const u = Net.url();
    try { await navigator.clipboard.writeText(u); $('#copyBtn').textContent = 'コピーしました'; setTimeout(() => { $('#copyBtn').textContent = 'リンクをコピー'; }, 1600); }
    catch { prompt('このリンクを送ってください', u); }
  };
  $('#shareBtn').onclick = () => { navigator.share({ title: '開拓の島 モフルジム', text: `モフルジムで対戦しよう！ 部屋コード：${Net.code()}`, url: Net.url() }).catch(() => {}); };
  window.addEventListener('pagehide', () => { Net.pagehide(); });

  drawTitle();
  applyFeatureVisibility();
  renderSegs();
  $<HTMLInputElement>('#nick').value = store.get(NICK_KEY);
  const room = new URLSearchParams(location.search).get('room');
  if (room) {
    $<HTMLInputElement>('#codeIn').value = cleanCode(room).slice(0, 5);
    showTitle('online');
    $('#tNote1').textContent = '招待リンクから開きました。ニックネームを入れて「参加する」を押してください。';
  } else showTitle('menu');
}
