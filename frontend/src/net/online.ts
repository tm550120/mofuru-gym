/* ---------- online (PeerJS / WebRTC, host-authoritative) ----------
   ホスト: ゲーム状態を持ち、ゲストの操作(act)を検証して、変更のたびに全体状態を送る。
   ゲスト: 操作をホストへ送り、受け取った状態を描画するだけ。
   PeerJS は必要になったときに動的 import する（CPU対戦だけならネット接続不要）。
   再接続：ホストは席ごとのトークンを持ち、同じトークンで hello してきたゲストをその席に戻す。
   ホストがリロードしたときは、保存した状態と同じ部屋コードで部屋を開き直す。 */
import type { DataConnection, Peer } from 'peerjs';
import { act, newGame, resumeCpu, update } from '../app/session';
import { SAVE_GUEST, SAVE_HOST, loadGuestSave, loadHostSave, type GuestSave, type HostSave, type OrderMode } from '../app/save';
import { app } from '../app/state';
import { COLOR_JA } from '../game/constants';
import { shuffle } from '../game/random';
import { isCpu, log } from '../game/rules';
import type { Action, Seat } from '../game/types';
import { store } from '../storage';
import { lobbyFill, note, renderLobby, showLobby } from '../ui/lobby';
import { adoptLoaded, render } from '../ui/render';
import { $ } from '../ui/dom';
import { dialog } from '../ui/sheets';
import { goTitle, hideTitle, refreshTitle, showTitle } from '../ui/title';
import {
  DC_GRACE_MS, HEARTBEAT_MS, HOST_RESUME_GRACE_MS, MAX_PLAYERS, RC_LIMIT_MS, TIMEOUT_MS, cleanName, cleanToken, genCode, genToken, hostPeerId,
  type GuestMessage, type HostMessage,
} from './protocol';
import { registerRoom, resolveRoom, unregisterRoom } from './roomApi';

type PeerCtor = typeof Peer;
interface PeerErr { type?: string; message?: string }
interface GuestConn { conn: DataConnection; name: string; seat: number | null; token: string; seen: number; gone: boolean }
type Timer = ReturnType<typeof setTimeout>;

let PeerClass: PeerCtor | null = null;
let peer: Peer | null = null, code = '', guests: GuestConn[] = [], hostConn: DataConnection | null = null, myName = '';
let hb: ReturnType<typeof setInterval> | null = null, lastHost = 0, joinTimer: Timer | null = null, alive = false;
/** 部屋コード API に登録できたときの削除用トークン */
let roomToken: string | null = null;
/* ホスト：席ごとの再接続用トークン（G には入れない＝他の人には見えない）、手番の決め方 */
let seatTokens: Record<number, string> = {}, orderMode: OrderMode = 'random', lobbyOrder: number[] = [], dcShowing: number | null = null;
/* ゲスト：自分のトークン、再接続中か、接続先の PeerJS ID */
let myToken = '', reconnecting = false, rcUntil = 0, rcTimer: Timer | null = null, target = '';
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
  if (t === 'peer-unavailable') return '部屋が見つかりません。コードが合っているか、ホストが部屋の画面を開いたままか確かめてください。';
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return '接続サーバーにつながりません。通信環境を確認してください。';
  if (t === 'browser-incompatible') return 'このブラウザはオンライン対戦に対応していません。';
  return 'オンライン接続でエラーが起きました（' + (t || (e && e.message) || '不明') + '）';
}
function stopAll(): void {
  if (hb) clearInterval(hb); hb = null; if (joinTimer) clearTimeout(joinTimer); joinTimer = null; if (rcTimer) clearTimeout(rcTimer); rcTimer = null; alive = false;
  if (roomToken) { unregisterRoom(code, roomToken); roomToken = null; }
  const p = peer; peer = null; guests = []; hostConn = null;
  if (p) setTimeout(() => { try { p.destroy(); } catch { /* ignore */ } }, 300);
}

/* ===== host ===== */
const guestsAll = (): { name: string; conn: DataConnection | null }[] => [{ name: myName, conn: null }, ...guests];
const slotCount = (): number => { const n = guestsAll().length; return lobbyFill() ? MAX_PLAYERS : n; };
/** 手番の並び（lobbyOrder）を今の人数に合わせる。人数が変わったら席順に戻す */
function normOrder(): void {
  const n = slotCount();
  if (lobbyOrder.length !== n || [...lobbyOrder].sort((a, b) => a - b).join() !== [...Array(n).keys()].join()) lobbyOrder = [...Array(n).keys()];
}
function lobbyMsg(i: number): HostMessage { return { t: 'lobby', players: guestsAll().map(x => x.name), fill: lobbyFill(), you: i, mode: orderMode, order: lobbyOrder }; }
function hostLobbyUpdate(): void {
  if (app.mode !== 'host' || app.G) return;
  normOrder();
  guests.forEach((x, i) => send(x.conn, lobbyMsg(i + 1)));
  renderLobby(guestsAll().map(x => x.name), lobbyFill(), 0, true, orderMode, lobbyOrder);
}
function setOrderMode(m: string | undefined): void { if (app.mode !== 'host' || app.G) return; orderMode = m === 'list' ? 'list' : 'random'; hostLobbyUpdate(); }
function moveUp(k: number): void {
  if (app.mode !== 'host' || app.G || k < 1 || k >= lobbyOrder.length) return;
  [lobbyOrder[k - 1], lobbyOrder[k]] = [lobbyOrder[k], lobbyOrder[k - 1]]; hostLobbyUpdate();
}
/** 部屋コード API へ登録（任意。失敗しても従来どおり PeerJS ID で参加できる） */
function registerCurrentRoom(p: Peer): void {
  const myCode = code;
  void registerRoom(myCode, hostPeerId(myCode)).then(tok => {
    if (!tok) return;
    if (peer === p && code === myCode) roomToken = tok; else unregisterRoom(myCode, tok);
  });
}
/**
 * 今の code で PeerJS のホストを開く。onFail が true を返したら3秒後に開き直す
 * （同じコードで開き直すときは、前の接続がサーバーに残っていることがあるのでしばらく再試行）
 */
function hostPeer(Ctor: PeerCtor, onOpen: (p: Peer) => void, onFail: (why: string, elapsed: number) => boolean): void {
  const t0 = Date.now();
  (function open(): void {
    const p = peer = new Ctor(hostPeerId(code));
    p.on('open', () => { if (peer !== p) return; alive = true; note(''); onOpen(p); });
    p.on('connection', c => { if (peer === p) onGuest(c); });
    p.on('disconnected', () => { if (peer === p && alive) try { p.reconnect(); } catch { /* ignore */ } });
    p.on('error', (e: PeerErr) => {
      if (peer !== p) return;
      if (e.type === 'unavailable-id' && !alive) { peer = null; try { p.destroy(); } catch { /* ignore */ } if (onFail('unavailable', Date.now() - t0)) setTimeout(open, 3000); return; }
      if (e.type === 'peer-unavailable') return;
      if (!alive) onFail(errText(e), Date.now() - t0);
      else console.warn('peer error', e);
    });
  })();
}
async function host(name: string): Promise<void> {
  myName = cleanName(name); note('接続中…');
  let Ctor: PeerCtor;
  try { Ctor = await load(); } catch (e) { note((e as Error).message); return; }
  app.mode = 'host'; app.me = 0; app.G = null; guests = []; seatTokens = {}; lobbyOrder = [];
  let attempt = 0; code = genCode();
  hostPeer(Ctor, p => { showLobby(true, code, roomUrl()); hostLobbyUpdate(); startHeartbeat(); registerCurrentRoom(p); }, why => {
    if (why === 'unavailable' && attempt++ < 5) { code = genCode(); return true; }
    note(why === 'unavailable' ? '部屋を作れませんでした。もう一度お試しください。' : why); stopAll(); app.mode = null; showTitle('online'); return false;
  });
}
/** ホストがリロードしたとき：保存した状態と同じ部屋コードで再開。ゲストはトークンで自分の席に戻ってくる */
async function resumeHost(): Promise<void> {
  const s: HostSave | null = loadHostSave();
  if (!s) { store.del(SAVE_HOST); refreshTitle(); return; }
  myName = s.G.players[0].name; code = s.code; note('部屋を開き直しています…');
  let Ctor: PeerCtor;
  try { Ctor = await load(); } catch (e) { note((e as Error).message); return; }
  app.mode = 'host'; app.me = 0; app.G = null; guests = []; seatTokens = s.tokens || {}; orderMode = s.orderMode || 'random';
  hostPeer(Ctor, p => {
    const G = app.G = s.G; adoptLoaded(); hideTitle();
    G.busy = false; if (G.offer) G.offer = null;
    G.players.forEach((pl, i) => { if (pl.type === 'remote') { pl.disconnected = true; watchDc(i, HOST_RESUME_GRACE_MS); } });
    log(G, 'ホストが再開しました。フレンドの再接続を待っています');
    startHeartbeat(); update(); registerCurrentRoom(p);
    if (G.phase !== 'over' && isCpu(G, G.cur)) resumeCpu(G.cur);
  }, (why, elapsed) => {
    if (why === 'unavailable' && elapsed < 60000) { note('前の接続が残っています。部屋コードを取り戻しています…'); return true; }
    note(why === 'unavailable' ? '同じ部屋コードを取り戻せませんでした。少し待ってからもう一度お試しください。' : why);
    stopAll(); app.mode = null; showTitle('menu'); return false;
  });
}
/** ホストの状態を保存する（終わったゲームは消す） */
function save(): void {
  const G = app.G;
  if (app.mode !== 'host' || !G) return;
  if (G.phase === 'over') { store.del(SAVE_HOST); return; }
  const s: HostSave = { v: 2, code, G, tokens: seatTokens, orderMode, at: Date.now() };
  store.set(SAVE_HOST, JSON.stringify(s));
}
function onGuest(c: DataConnection): void {
  const g: GuestConn = { conn: c, name: '', seat: null, token: '', seen: Date.now(), gone: false };
  c.on('data', d => { g.seen = Date.now(); onHostData(g, d); });
  c.on('close', () => guestGone(g));
  c.on('error', () => guestGone(g));
}
function reject(g: GuestConn, reason: string): void { send(g.conn, { t: 'reject', reason }); setTimeout(() => { try { g.conn.close(); } catch { /* ignore */ } }, 500); }
function onHostData(g: GuestConn, raw: unknown): void {
  if (!raw || typeof raw !== 'object') return;
  const d = raw as GuestMessage;
  if (d.t === 'hello') {
    const tok = cleanToken(d.token);
    const G = app.G;
    if (G) {
      /* 再接続：トークンが一致する席に戻す */
      const s = tok ? Object.keys(seatTokens).map(Number).find(k => seatTokens[k] === tok) : undefined;
      if (s === undefined || !G.players[s]) { reject(g, 'このゲームはもう始まっています。'); return; }
      if (G.players[s].type !== 'remote') { reject(g, 'あなたの席はCPUに交代しました。'); return; }
      guests.filter(x => x.seat === s && x !== g).forEach(x => { x.gone = true; try { x.conn.close(); } catch { /* ignore */ } });
      guests = guests.filter(x => !x.gone);
      g.name = G.players[s].name; g.seat = s; g.token = tok; guests.push(g);
      send(g.conn, { t: 'welcome', code, rejoin: true }); send(g.conn, { t: 'start', seat: s });
      const pl = G.players[s];
      if (pl.disconnected) { pl.disconnected = false; log(G, `${pl.name}が再接続しました`); }
      seatBack(s); update(); return;
    }
    if (guests.length + 1 >= MAX_PLAYERS) { reject(g, '部屋が満員です。'); return; }
    g.name = cleanName(d.name); g.token = tok || genToken(); guests.push(g);
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
  guests = guests.filter(x => x !== g);
  const s = g.seat; if (s === null || !G.players[s] || G.players[s].type !== 'remote') return;
  const pl = G.players[s]; pl.disconnected = true; log(G, `${pl.name}の接続が切れました（再接続を待っています）`); update();
  watchDc(s, DC_GRACE_MS);
}
/** しばらく待っても戻らなければ、CPUに交代するか聞く */
function watchDc(s: number, ms: number): void {
  const gid = app.G ? app.G.gid : '';
  setTimeout(() => {
    const G = app.G;
    if (app.mode !== 'host' || !G || G.gid !== gid) return;
    const pl = G.players[s]; if (!pl || pl.type !== 'remote' || !pl.disconnected || dcQueue.includes(s)) return;
    dcQueue.push(s); if (dcShowing === null) askDc();
  }, ms);
}
/** 席 s のゲストが戻ってきた：交代の確認を取り下げる */
function seatBack(s: number): void {
  const i = dcQueue.indexOf(s); if (i >= 0) dcQueue.splice(i, 1);
  if (dcShowing === s) { dcShowing = null; $('#dlgBg').classList.remove('show'); askDc(); }
}
function askDc(): void {
  dcShowing = null;
  const G0 = app.G;
  while (dcQueue.length && G0 && G0.players[dcQueue[0]] && !G0.players[dcQueue[0]].disconnected) dcQueue.shift();
  if (!dcQueue.length || app.mode !== 'host' || !G0) return;
  const s = dcQueue[0], pl = G0.players[s]; dcShowing = s;
  dialog('接続が切れました', `${pl.name}の接続が切れたままです。CPUに交代して続けるか、ゲームを終了してください。（戻ってきたら自動で再開します）`, [
    { label: 'ゲームを終了', fn: () => { dcShowing = null; dcQueue.length = 0; broadcast({ t: 'end', reason: 'ホストがゲームを終了しました。' }); store.del(SAVE_HOST); goTitle(); } },
    {
      label: 'CPUに交代', pri: true, fn: () => {
        dcShowing = null; dcQueue.shift();
        const G = app.G;
        if (G && G.players[s] && G.players[s].disconnected) {
          const p = G.players[s]; p.type = 'cpu'; p.disconnected = false; p.name = p.name + '🤖'; delete seatTokens[s];
          log(G, `${p.name}（CPU）が代わりに参加`); update(); resumeCpu(s);
        }
        askDc();
      },
    },
  ]);
}
function broadcast(m: HostMessage): void { guests.forEach(x => { if (!x.gone) send(x.conn, m); }); }
function startHeartbeat(): void {
  if (hb) clearInterval(hb); lastHost = Date.now();
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
  normOrder();
  const seq = orderMode === 'list' && lobbyOrder.length === seats.length ? lobbyOrder.slice() : shuffle(seats.map((_, i) => i));
  seatTokens = {};
  guests.forEach((g, i) => { g.seat = i + 1; seatTokens[i + 1] = g.token; send(g.conn, { t: 'start', seat: i + 1, token: g.token }); });
  hideTitle(); newGame(seats, seq);
}
function restart(): void {
  const G = app.G;
  if (app.mode !== 'host' || !G) return;
  const seats: Seat[] = G.players.map(p => ({ name: p.name, type: p.disconnected ? 'cpu' : p.type }));
  G.players.forEach((p, i) => { if (p.disconnected) delete seatTokens[i]; });
  const seq = orderMode === 'list' && G.seq ? G.seq.slice() : shuffle(seats.map((_, i) => i));
  newGame(seats, seq);
}

/* ===== guest ===== */
async function join(name: string, c: string, token?: string): Promise<void> {
  myName = cleanName(name); code = c; myToken = token || genToken(); reconnecting = false; note('接続中…');
  try { await load(); } catch (e) { note((e as Error).message); return; }
  // 部屋コード API で引ければその ID に、だめなら従来どおり「接頭辞＋コード」でつなぐ
  target = (await resolveRoom(c)) ?? hostPeerId(c);
  app.mode = 'guest'; app.G = null;
  connect(false);
}
function connect(isRc: boolean): void {
  const Ctor = PeerClass; if (!Ctor) return;
  const p = peer = new Ctor();
  joinTimer = setTimeout(() => {
    if (peer !== p || alive) return;
    if (isRc) { retry(); return; }
    note('部屋に接続できませんでした。コードと通信環境を確かめてください。'); stopAll(); app.mode = null; showTitle(app.G ? 'menu' : 'online');
  }, isRc ? 9000 : 15000);
  p.on('open', () => {
    if (peer !== p) return;
    const hc = hostConn = p.connect(target, { reliable: true });
    hc.on('open', () => send(hc, { t: 'hello', name: myName, token: myToken }));
    hc.on('data', d => { lastHost = Date.now(); onGuestData(d); });
    hc.on('close', () => { if (hostConn === hc) hostLost(); });
    hc.on('error', () => { if (hostConn === hc) hostLost(); });
  });
  p.on('error', (e: PeerErr) => {
    if (peer !== p) return;
    if (isRc) { if (!alive) retry(); return; }
    if (!alive) {
      /* 保存していた部屋がもう無い：「オンライン対戦に戻る」に古い部屋が残り続けないよう消す */
      if (e.type === 'peer-unavailable') { const s = loadGuestSave(); if (s && s.code === code) store.del(SAVE_GUEST); }
      note(errText(e)); stopAll(); app.mode = null; showTitle('online');
    }
    else console.warn('peer error', e);
  });
}
function saveGuest(seat: number): void {
  const s: GuestSave = { code, token: myToken, name: myName, seat, at: Date.now() };
  store.set(SAVE_GUEST, JSON.stringify(s));
}
function onGuestData(raw: unknown): void {
  if (!raw || typeof raw !== 'object' || app.mode !== 'guest') return;
  const d = raw as HostMessage;
  switch (d.t) {
    case 'welcome':
      alive = true; if (joinTimer) clearTimeout(joinTimer); note('');
      if (d.rejoin) { if (reconnecting) { reconnecting = false; $('#dlgBg').classList.remove('show'); } }
      else showLobby(false, code, roomUrl());
      startHeartbeat(); break;
    case 'lobby': if (!app.G) renderLobby(d.players, d.fill, d.you, false, d.mode, d.order); break;
    case 'reject':
      if (app.G || reconnecting) { reconnecting = false; store.del(SAVE_GUEST); stopAll(); app.mode = null; goTitle(); dialog('参加できません', d.reason || '参加できませんでした。', [{ label: 'OK', pri: true }]); break; }
      store.del(SAVE_GUEST); note(d.reason || '参加できませんでした。'); stopAll(); app.mode = null; showTitle(loadGuestSave() ? 'menu' : 'online'); break;
    case 'start': app.me = d.seat; saveGuest(d.seat); break;
    case 'state': {
      const ng = d.G; if (!ng || !ng.players) return;
      const fresh = !app.G || app.G.gid !== ng.gid;
      app.G = ng; if (fresh) { adoptLoaded(); hideTitle(); }
      if (ng.phase === 'over') store.del(SAVE_GUEST); // 終わった対戦には戻らない
      app.pending = false; render(); break;
    }
    case 'end': { const r = d.reason || 'ゲームが終了しました。'; store.del(SAVE_GUEST); stopAll(); app.mode = null; goTitle(); dialog('対戦終了', r, [{ label: 'OK', pri: true }]); break; }
    case 'ping': send(hostConn, { t: 'pong' }); break;
  }
}
/** ホストとの接続が切れた：対戦中ならしばらく再接続を試みる（ホストのリロードに対応） */
function hostLost(): void {
  if (app.mode !== 'guest') return;
  if (reconnecting) { retry(); return; }
  if (app.G && app.G.phase !== 'over' && myToken) {
    reconnecting = true; rcUntil = Date.now() + RC_LIMIT_MS; alive = false; if (hb) clearInterval(hb); hb = null;
    dialog('接続が切れました', 'ホストに再接続しています…（ホストがリロードした場合は、ホストが「再開」すると戻れます）', [
      { label: 'タイトルへ', fn: () => { reconnecting = false; stopAll(); app.mode = null; goTitle(); } }]);
    retry(); return;
  }
  stopAll(); app.mode = null; goTitle();
  dialog('接続が切れました', 'ホストとの接続が切れました。タイトルに戻ります。', [{ label: 'OK', pri: true }]);
}
function retry(): void {
  if (app.mode !== 'guest' || !reconnecting) return;
  if (joinTimer) clearTimeout(joinTimer); if (rcTimer) clearTimeout(rcTimer);
  const p = peer; peer = null; hostConn = null; if (p) try { p.destroy(); } catch { /* ignore */ }
  if (Date.now() > rcUntil) {
    reconnecting = false; stopAll(); app.mode = null; goTitle();
    dialog('再接続できませんでした', 'ホストに再接続できませんでした。ホストが部屋を再開したら、タイトルの「オンライン対戦に戻る」から戻れます。', [{ label: 'OK', pri: true }]);
    return;
  }
  rcTimer = setTimeout(() => { if (reconnecting && app.mode === 'guest') connect(true); }, 3000);
}
/** タイトルの「オンライン対戦に戻る」 */
function resumeGuest(): void {
  const s = loadGuestSave(); if (!s) { store.del(SAVE_GUEST); refreshTitle(); return; }
  void join(s.name, s.code, s.token);
}

/** 自分から抜ける（⌂など）：保存も消す */
function leave(): void {
  if (app.mode === 'host') { broadcast({ t: 'end', reason: 'ホストが部屋を閉じました。' }); store.del(SAVE_HOST); }
  else if (app.mode === 'guest') { send(hostConn, { t: 'bye' }); store.del(SAVE_GUEST); }
  reconnecting = false; dcQueue.length = 0; dcShowing = null; stopAll();
}
/** ページを閉じる／リロード：対戦中は保存を残し、相手には「終了」を送らない（再接続できるように） */
function pagehide(): void {
  if (app.mode === 'host') {
    if (!app.G) {
      broadcast({ t: 'end', reason: 'ホストが部屋を閉じました。' });
      if (roomToken) { unregisterRoom(code, roomToken); roomToken = null; }
    }
  }
  else if (app.mode === 'guest') { if (!app.G) send(hostConn, { t: 'bye' }); }
}

export const Net = {
  host, join, start, restart, leave, pagehide, save, resumeHost, resumeGuest, setOrderMode, moveUp,
  code: (): string => code,
  url: roomUrl,
  broadcastState: (): void => { if (app.G) broadcast({ t: 'state', G: app.G }); },
  sendAction: (a: Action): void => send(hostConn, { t: 'act', a }),
  lobbyChanged: hostLobbyUpdate,
};
