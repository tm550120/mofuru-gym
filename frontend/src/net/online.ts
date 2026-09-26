/* ---------- online (PeerJS / WebRTC, host-authoritative) ----------
   ホスト: ゲーム状態を持ち、ゲストの操作(act)を検証して、変更のたびに全体状態を送る。
   ゲスト: 操作をホストへ送り、受け取った状態を描画するだけ。
   PeerJS は必要になったときに動的 import する（CPU対戦だけならネット接続不要）。 */
import type { DataConnection, Peer } from 'peerjs';
import { act, newGame, resumeCpu, update } from '../app/session';
import { app } from '../app/state';
import { COLOR_JA } from '../game/constants';
import { log } from '../game/rules';
import type { Action, Seat } from '../game/types';
import { lobbyFill, note, renderLobby, showLobby } from '../ui/lobby';
import { render, resetLocalUI } from '../ui/render';
import { dialog } from '../ui/sheets';
import { goTitle, hideTitle, showTitle } from '../ui/title';
import {
  HEARTBEAT_MS, MAX_PLAYERS, TIMEOUT_MS, cleanName, genCode, hostPeerId,
  type GuestMessage, type HostMessage,
} from './protocol';
import { registerRoom, resolveRoom, unregisterRoom } from './roomApi';

type PeerCtor = typeof Peer;
interface PeerErr { type?: string; message?: string }
interface GuestConn { conn: DataConnection; name: string; seat: number | null; seen: number; gone: boolean }

let PeerClass: PeerCtor | null = null;
let peer: Peer | null = null, code = '', guests: GuestConn[] = [], hostConn: DataConnection | null = null, myName = '';
let hb: ReturnType<typeof setInterval> | null = null, lastHost = 0, joinTimer: ReturnType<typeof setTimeout> | null = null, alive = false;
/** 部屋コード API に登録できたときの削除用トークン */
let roomToken: string | null = null;
const dcQueue: number[] = [];

const roomUrl = (): string => location.origin + location.pathname + '?room=' + code;
async function load(): Promise<PeerCtor> {
  if (PeerClass) return PeerClass;
  try {
    PeerClass = (await import('peerjs')).Peer;
    return PeerClass;
  } catch {
    throw new Error('PeerJSの読み込みに失敗しました');
  }
}
const send = (c: DataConnection | null, m: GuestMessage | HostMessage): void => { try { if (c && c.open) void c.send(m); } catch { /* 送れなくても続行 */ } };
function errText(e: PeerErr | undefined): string {
  const t = e && e.type;
  if (t === 'peer-unavailable') return '部屋が見つかりません。コードを確かめてください。';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return '接続サーバーにつながりません。通信環境を確認してください。';
  if (t === 'browser-incompatible') return 'このブラウザはオンライン対戦に対応していません。';
  return 'オンライン接続でエラーが起きました（' + (t || (e && e.message) || '不明') + '）';
}
function stopAll(): void {
  if (hb) clearInterval(hb); hb = null; if (joinTimer) clearTimeout(joinTimer); joinTimer = null; alive = false;
  if (roomToken) { unregisterRoom(code, roomToken); roomToken = null; }
  const p = peer; peer = null; guests = []; hostConn = null;
  if (p) setTimeout(() => { try { p.destroy(); } catch { /* ignore */ } }, 300);
}

/* ===== host ===== */
const guestsAll = (): { name: string; conn: DataConnection | null }[] => [{ name: myName, conn: null }, ...guests];
function lobbyMsg(i: number): HostMessage { return { t: 'lobby', players: guestsAll().map(x => x.name), fill: lobbyFill(), you: i }; }
function hostLobbyUpdate(): void {
  if (app.mode !== 'host' || app.G) return;
  guests.forEach((x, i) => send(x.conn, lobbyMsg(i + 1)));
  renderLobby(guestsAll().map(x => x.name), lobbyFill(), 0, true);
}
async function host(name: string): Promise<void> {
  myName = cleanName(name); note('接続中…');
  let Ctor: PeerCtor;
  try { Ctor = await load(); } catch (e) { note((e as Error).message); return; }
  app.mode = 'host'; app.me = 0; app.G = null; guests = [];
  open(0);
  function open(attempt: number): void {
    code = genCode();
    const p = peer = new Ctor(hostPeerId(code));
    p.on('open', () => {
      if (peer !== p) return; alive = true; note(''); showLobby(true, code, roomUrl()); hostLobbyUpdate(); startHeartbeat();
      // 部屋コード API へ登録（任意。失敗しても従来どおり PeerJS ID で参加できる）
      const myCode = code;
      void registerRoom(myCode, hostPeerId(myCode)).then(tok => {
        if (!tok) return;
        if (peer === p && code === myCode) roomToken = tok; else unregisterRoom(myCode, tok);
      });
    });
    p.on('connection', c => { if (peer === p) onGuest(c); });
    p.on('disconnected', () => { if (peer === p && alive) try { p.reconnect(); } catch { /* ignore */ } });
    p.on('error', (e: PeerErr) => {
      if (peer !== p) return;
      if (e.type === 'unavailable-id' && attempt < 5) { peer = null; try { p.destroy(); } catch { /* ignore */ } open(attempt + 1); return; }
      if (e.type === 'peer-unavailable') return;
      if (!alive) { note(errText(e)); stopAll(); app.mode = null; showTitle('online'); }
      else console.warn('peer error', e);
    });
  }
}
function onGuest(c: DataConnection): void {
  const g: GuestConn = { conn: c, name: '', seat: null, seen: Date.now(), gone: false };
  c.on('data', d => { g.seen = Date.now(); onHostData(g, d); });
  c.on('close', () => guestGone(g));
  c.on('error', () => guestGone(g));
}
function onHostData(g: GuestConn, raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const d = raw as GuestMessage;
  if (d.t === 'hello') {
    if (app.G) { send(g.conn, { t: 'reject', reason: 'このゲームはもう始まっています。' }); setTimeout(() => g.conn.close(), 500); return; }
    if (guests.length + 1 >= MAX_PLAYERS) { send(g.conn, { t: 'reject', reason: '部屋が満員です。' }); setTimeout(() => g.conn.close(), 500); return; }
    g.name = cleanName(d.name); guests.push(g);
    send(g.conn, { t: 'welcome', code }); hostLobbyUpdate(); return;
  }
  if (d.t === 'bye') { guestGone(g); return; }
  if (d.t === 'act' && app.G && g.seat !== null && !g.gone) {
    let ok = false; try { ok = act(g.seat, d.a); } catch (e) { console.error(e); }
    if (!ok) send(g.conn, { t: 'state', G: app.G });
  }
}
function guestGone(g: GuestConn): void {
  if (g.gone) return; g.gone = true;
  try { g.conn.close(); } catch { /* ignore */ }
  if (app.mode !== 'host') return;
  const G = app.G;
  if (!G) { guests = guests.filter(x => x !== g); hostLobbyUpdate(); return; }
  const s = g.seat; if (s === null || !G.players[s] || G.players[s].type !== 'remote') return;
  const pl = G.players[s]; pl.disconnected = true; log(G, `${pl.name}の接続が切れました`); update();
  dcQueue.push(s); if (dcQueue.length === 1) askDc();
}
function askDc(): void {
  if (!dcQueue.length || app.mode !== 'host' || !app.G) return;
  const s = dcQueue[0], pl = app.G.players[s];
  dialog('接続が切れました', `${pl.name}の接続が切れました。CPUに交代して続けるか、ゲームを終了してください。`, [
    { label: 'ゲームを終了', fn: () => { dcQueue.length = 0; broadcast({ t: 'end', reason: 'ホストがゲームを終了しました。' }); goTitle(); } },
    {
      label: 'CPUに交代', pri: true, fn: () => {
        dcQueue.shift();
        const G = app.G;
        if (G && G.players[s]) { const p = G.players[s]; p.type = 'cpu'; p.disconnected = false; p.name = p.name + '🤖'; log(G, `${p.name}（CPU）が代わりに参加`); update(); resumeCpu(s); }
        askDc();
      },
    },
  ]);
}
function broadcast(m: HostMessage): void { guests.forEach(x => { if (!x.gone) send(x.conn, m); }); }
function startHeartbeat(): void {
  if (hb) clearInterval(hb);
  hb = setInterval(() => {
    if (app.mode === 'host') { broadcast({ t: 'ping' }); const now = Date.now(); guests.slice().forEach(g => { if (!g.gone && now - g.seen > TIMEOUT_MS) guestGone(g); }); }
    else if (app.mode === 'guest') { send(hostConn, { t: 'pong' }); if (Date.now() - lastHost > TIMEOUT_MS) hostLost(); }
  }, HEARTBEAT_MS);
}
function start(): void {
  if (app.mode !== 'host' || app.G) return;
  const all = guestsAll(); if (all.length < 2) return;
  const seats: Seat[] = all.map((x, i) => ({ name: x.name, type: i === 0 ? 'local' : 'remote' }));
  if (lobbyFill()) while (seats.length < MAX_PLAYERS) seats.push({ name: 'CPU ' + COLOR_JA[seats.length], type: 'cpu' });
  guests.forEach((g, i) => { g.seat = i + 1; send(g.conn, { t: 'start', seat: i + 1 }); });
  hideTitle(); newGame(seats);
}
function restart(): void {
  const G = app.G;
  if (app.mode !== 'host' || !G) return;
  const seats: Seat[] = G.players.map(p => ({ name: p.name, type: p.disconnected ? 'cpu' : p.type }));
  newGame(seats);
}

/* ===== guest ===== */
async function join(name: string, c: string): Promise<void> {
  myName = cleanName(name); code = c; note('接続中…');
  let Ctor: PeerCtor;
  try { Ctor = await load(); } catch (e) { note((e as Error).message); return; }
  // 部屋コード API で引ければその ID に、だめなら従来どおり「接頭辞＋コード」でつなぐ
  const target = (await resolveRoom(c)) ?? hostPeerId(c);
  app.mode = 'guest'; app.G = null;
  const p = peer = new Ctor();
  joinTimer = setTimeout(() => { if (peer === p && !alive) { note('部屋に接続できませんでした。コードと通信環境を確かめてください。'); stopAll(); app.mode = null; showTitle('online'); } }, 15000);
  p.on('open', () => {
    if (peer !== p) return;
    const hc = hostConn = p.connect(target, { reliable: true });
    hc.on('open', () => send(hc, { t: 'hello', name: myName }));
    hc.on('data', d => { lastHost = Date.now(); onGuestData(d); });
    hc.on('close', () => { if (hostConn === hc) hostLost(); });
    hc.on('error', () => { if (hostConn === hc) hostLost(); });
  });
  p.on('error', (e: PeerErr) => {
    if (peer !== p) return;
    if (!alive) { note(errText(e)); stopAll(); app.mode = null; showTitle('online'); }
    else console.warn('peer error', e);
  });
}
function onGuestData(raw: unknown): void {
  if (!raw || typeof raw !== 'object' || app.mode !== 'guest') return;
  const d = raw as HostMessage;
  switch (d.t) {
    case 'welcome': alive = true; if (joinTimer) clearTimeout(joinTimer); note(''); showLobby(false, code, roomUrl()); startHeartbeat(); break;
    case 'lobby': if (!app.G) renderLobby(d.players, d.fill, d.you, false); break;
    case 'reject': note(d.reason || '参加できませんでした。'); stopAll(); app.mode = null; showTitle('online'); break;
    case 'start': app.me = d.seat; break;
    case 'state': {
      const ng = d.G; if (!ng || !ng.players) return;
      const fresh = !app.G || app.G.gid !== ng.gid;
      app.G = ng; if (fresh) { resetLocalUI(); hideTitle(); }
      app.pending = false; render(); break;
    }
    case 'end': { const r = d.reason || 'ゲームが終了しました。'; stopAll(); app.mode = null; goTitle(); dialog('対戦終了', r, [{ label: 'OK', pri: true }]); break; }
    case 'ping': send(hostConn, { t: 'pong' }); break;
  }
}
function hostLost(): void {
  if (app.mode !== 'guest') return;
  stopAll(); app.mode = null; goTitle();
  dialog('接続が切れました', 'ホストとの接続が切れました。タイトルに戻ります。', [{ label: 'OK', pri: true }]);
}

function leave(): void {
  if (app.mode === 'host') broadcast({ t: 'end', reason: 'ホストが部屋を閉じました。' });
  else if (app.mode === 'guest') send(hostConn, { t: 'bye' });
  dcQueue.length = 0; stopAll();
}

export const Net = {
  host, join, start, restart, leave,
  code: (): string => code,
  url: roomUrl,
  broadcastState: (): void => { if (app.G) broadcast({ t: 'state', G: app.G }); },
  sendAction: (a: Action): void => send(hostConn, { t: 'act', a }),
  lobbyChanged: hostLobbyUpdate,
};
