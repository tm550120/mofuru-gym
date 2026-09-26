/* オンライン対戦のロビー表示 */
import type { OrderMode } from '../app/save';
import { COLORS } from '../game/constants';
import { MAX_PLAYERS } from '../net/protocol';
import { $, esc } from './dom';
import { showTitle } from './title';

/** タイトル画面のお知らせ欄（メニュー・オンライン・ロビー）に表示する */
export const note = (t: string): void => { $('#tNote0').textContent = t; $('#tNote1').textContent = t; $('#tNote2').textContent = t; };

/** 「空いた席をCPUで埋める」 */
export const lobbyFill = (): boolean => $<HTMLInputElement>('#lFill').checked;

/**
 * 参加者の一覧。mode が 'list' なら order（席番号の並び）の順に番号を付け、ホストは ▲ で並べ替えられる
 */
export function renderLobby(names: string[], fill: boolean, you: number, isHost: boolean, mode: OrderMode, order: number[]): void {
  const n = names.length, slots = fill ? MAX_PLAYERS : n, rows: string[] = [];
  const ord = order && order.length === slots ? order : [...Array(slots).keys()];
  ord.forEach((si, k) => {
    const mem = si < n;
    const label = mem ? esc(names[si]) : '🤖 CPU が入ります';
    const tag = mem ? `${si === 0 ? 'ホスト' : ''}${si === you ? '（あなた）' : ''}` : '';
    const no = mode === 'list' ? `<span class="no">${k + 1}番</span>` : '';
    const up = isHost && mode === 'list' && k > 0 ? `<button class="up" data-k="${k}" aria-label="順番を上げる">▲</button>` : '';
    rows.push(`<li class="${mem ? '' : 'empty'}">${no}<i style="background:${COLORS[si]}"></i>${label}<small>${tag}</small>${up}</li>`);
  });
  for (let i = slots; i < MAX_PLAYERS; i++) rows.push(`<li class="empty"><i style="background:${COLORS[i]};opacity:.4"></i>空き</li>`);
  $('#lList').innerHTML = rows.join('');
  $('#lCount').textContent = `${n}/${MAX_PLAYERS}人`;
  const lFill = $<HTMLInputElement>('#lFill');
  lFill.checked = fill; lFill.disabled = !isHost; $('#lFillRow').style.opacity = isHost ? '1' : '.6';
  $('#lOrder').querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.classList.toggle('sel', b.dataset.o === mode); b.disabled = !isHost; });
  const start = $<HTMLButtonElement>('#startBtn');
  start.hidden = !isHost; start.disabled = n < 2;
  $('#lInfo').textContent = isHost ? (n < 2 ? 'フレンドにコードかリンクを送って、参加を待ちましょう。' : 'そろったら「ゲーム開始」を押してください。') : 'ホストがゲームを始めるのを待っています…';
}

export function showLobby(isHost: boolean, code: string, url: string): void {
  showTitle('lobby');
  $('#lCode').textContent = code; $('#lUrl').textContent = url;
  $('#lShare').hidden = !isHost; $('#lUrl').hidden = !isHost;
  $('#shareBtn').hidden = !navigator.share;
  if (!isHost) renderLobby([], false, -1, false, 'random', []);
}
