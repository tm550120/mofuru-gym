/* オンライン対戦のロビー表示 */
import { COLORS } from '../game/constants';
import { MAX_PLAYERS } from '../net/protocol';
import { $, esc } from './dom';
import { showTitle } from './title';

/** タイトル画面のお知らせ欄（オンライン・ロビーの両方）に表示する */
export const note = (t: string): void => { $('#tNote1').textContent = t; $('#tNote2').textContent = t; };

/** 「空いた席をCPUで埋める」 */
export const lobbyFill = (): boolean => $<HTMLInputElement>('#lFill').checked;

export function renderLobby(names: string[], fill: boolean, you: number, isHost: boolean): void {
  const n = names.length, rows: string[] = [];
  for (let i = 0; i < MAX_PLAYERS; i++) {
    if (i < n) rows.push(`<li><i style="background:${COLORS[i]}"></i>${esc(names[i])}<small>${i === 0 ? 'ホスト' : ''}${i === you ? '（あなた）' : ''}</small></li>`);
    else rows.push(`<li class="empty"><i style="background:${COLORS[i]};opacity:.4"></i>${fill ? '🤖 CPU が入ります' : '空き'}</li>`);
  }
  $('#lList').innerHTML = rows.join('');
  $('#lCount').textContent = `${n}/${MAX_PLAYERS}人`;
  const lFill = $<HTMLInputElement>('#lFill');
  lFill.checked = fill; lFill.disabled = !isHost; $('#lFillRow').style.opacity = isHost ? '1' : '.6';
  const start = $<HTMLButtonElement>('#startBtn');
  start.hidden = !isHost; start.disabled = n < 2;
  $('#lInfo').textContent = isHost ? (n < 2 ? 'フレンドにコードかリンクを送って、参加を待ちましょう。' : 'そろったら「ゲーム開始」を押してください。') : 'ホストがゲームを始めるのを待っています…';
}

export function showLobby(isHost: boolean, code: string, url: string): void {
  showTitle('lobby');
  $('#lCode').textContent = code; $('#lUrl').textContent = url;
  $('#lShare').hidden = !isHost; $('#lUrl').hidden = !isHost;
  $('#shareBtn').hidden = !navigator.share;
  if (!isHost) renderLobby([], false, -1, false);
}
