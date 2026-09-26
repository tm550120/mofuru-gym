/* タイトル画面・モード選択・ヘッダーのボタン */
import { newGame } from '../app/session';
import { app, isOnline } from '../app/state';
import { COLORS, ICON, SQ3, TILE } from '../game/constants';
import type { TileType } from '../game/types';
import { Net } from '../net/online';
import { store } from '../storage';
import { house, monSVG } from './art';
import { closeBattle } from './battle';
import { $ } from './dom';

export type TitlePanel = 'menu' | 'online' | 'lobby';

export function startCpu(): void {
  app.mode = 'cpu'; app.me = 0; hideTitle();
  newGame([{ name: 'あなた', type: 'local' }, { name: 'CPU 青', type: 'cpu' }, { name: 'CPU 橙', type: 'cpu' }]);
}
export function playAgain(): void {
  if (app.mode === 'cpu') startCpu();
  else if (app.mode === 'host') Net.restart();
}
export function goTitle(): void {
  if (isOnline()) Net.leave();
  app.mode = null; app.G = null; app.pending = false;
  closeBattle(true);
  ['tradeBg', 'overBg', 'evoBg', 'battleBg', 'dlgBg', 'helpBg'].forEach(id => $('#' + id).classList.remove('show'));
  showTitle('menu');
}
export function hideTitle(): void { $('#title').classList.remove('show'); }
export function showTitle(panel: TitlePanel): void {
  $('#title').classList.add('show'); $('#title').classList.toggle('compact', panel !== 'menu');
  $('#tMenu').hidden = panel !== 'menu'; $('#tOnline').hidden = panel !== 'online'; $('#tLobby').hidden = panel !== 'lobby';
  if (panel !== 'lobby') $('#tNote2').textContent = '';
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
  $('#helpBtn').onclick = () => $('#helpBg').classList.add('show');
  $('#tHelp').onclick = () => $('#helpBg').classList.add('show');
  $('#hClose').onclick = () => $('#helpBg').classList.remove('show');
  $('#newBtn').onclick = () => {
    if (app.mode === 'cpu') { if (confirm('新しいゲームを始めますか？')) startCpu(); }
    else if (app.mode === 'host') { if (confirm('同じメンバーで新しいゲームを始めますか？')) Net.restart(); }
  };
  $('#homeBtn').onclick = () => {
    const MODE = app.mode;
    const msg = MODE === 'host' ? 'タイトルに戻りますか？\n（ホストが抜けるとオンライン対戦は終了します）' : MODE === 'guest' ? 'タイトルに戻りますか？\n（この対戦から抜けます）' : 'タイトルに戻りますか？\n（今のゲームは終了します）';
    if (confirm(msg)) goTitle();
  };
  $('#again').onclick = playAgain;
  $('#overHome').onclick = goTitle;

  /* title screen */
  $('#modeCpu').onclick = startCpu;
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
  $('#startBtn').onclick = () => Net.start();
  $('#lobbyLeave').onclick = () => { goTitle(); };
  $('#copyBtn').onclick = async () => {
    const u = Net.url();
    try { await navigator.clipboard.writeText(u); $('#copyBtn').textContent = 'コピーしました'; setTimeout(() => { $('#copyBtn').textContent = 'リンクをコピー'; }, 1600); }
    catch { prompt('このリンクを送ってください', u); }
  };
  $('#shareBtn').onclick = () => { navigator.share({ title: '開拓の島 モフルジム', text: `モフルジムで対戦しよう！ 部屋コード：${Net.code()}`, url: Net.url() }).catch(() => {}); };
  window.addEventListener('pagehide', () => { if (isOnline()) Net.leave(); });

  drawTitle();
  $<HTMLInputElement>('#nick').value = store.get(NICK_KEY);
  const room = new URLSearchParams(location.search).get('room');
  if (room) {
    $<HTMLInputElement>('#codeIn').value = cleanCode(room).slice(0, 5);
    showTitle('online');
    $('#tNote1').textContent = '招待リンクから開きました。ニックネームを入れて「参加する」を押してください。';
  } else showTitle('menu');
}
