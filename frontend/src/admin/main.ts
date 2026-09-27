/* 管理ページ（admin.html）：試験機能の切り替え・効果音／BGM と演出のテスト・データの削除。
 * ゲーム画面からはリンクしない。アクセスキーはブラウザ内だけの簡易ロック（accessKey.ts 参照）。 */
import '../style.css';
import './admin.css';
import { SAVE_CPU, SAVE_GUEST, SAVE_HOST } from '../app/save';
import { SETTING_KEYS } from '../app/settings';
import { app } from '../app/state';
import { previewBgm } from '../audio/bgm';
import { SONGS, type TrackId } from '../audio/bgm/songs';
import type { BattleSound } from '../audio/outcome';
import { initAudioUnlock, setSoundPreview, sfxBattleStart, sfxDiceTick, sfxResult } from '../audio/sfx';
import { FEATURES, isFeatureId, isFeatureOn, setFeature } from '../features';
import { store } from '../storage';
import { showBattle } from '../ui/battle';
import { $, esc } from '../ui/dom';
import { checkAccessKey } from './accessKey';
import { DEMO_ME, demoBattle, demoGame } from './demo';

const UNLOCK_KEY = 'mofuru-admin-unlocked';
const session = {
  get: (): boolean => { try { return sessionStorage.getItem(UNLOCK_KEY) === '1'; } catch { return false; } },
  set: (on: boolean): void => { try { if (on) sessionStorage.setItem(UNLOCK_KEY, '1'); else sessionStorage.removeItem(UNLOCK_KEY); } catch { /* 無視 */ } },
};

/* ---- アクセスキー ---- */
function showPanel(on: boolean): void {
  $('#gate').hidden = on; $('#panel').hidden = !on;
  if (on) renderPanel();
}
async function tryUnlock(): Promise<void> {
  const inp = $<HTMLInputElement>('#keyIn'), btn = $<HTMLButtonElement>('#keyOk');
  btn.disabled = true;
  const ok = await checkAccessKey(inp.value);
  btn.disabled = false;
  if (!ok) { $('#keyErr').textContent = 'アクセスキーが違います'; inp.select(); return; }
  $('#keyErr').textContent = ''; inp.value = '';
  session.set(true); showPanel(true);
}

/* ---- バージョン・試験機能 ---- */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  try { return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) + '（日本時間）'; }
  catch { return iso; }
}
function renderFeatures(): void {
  $('#featList').innerHTML = FEATURES.map(f => {
    const on = isFeatureOn(f.id);
    return `<div class="feat"><b>${esc(f.name)}</b><small>${esc(f.desc)}</small>
      <div class="seg" data-feat="${f.id}"><button data-on="1" class="${on ? 'sel' : ''}" aria-pressed="${on}">オン</button><button data-on="0" class="${on ? '' : 'sel'}" aria-pressed="${!on}">オフ</button></div></div>`;
  }).join('');
}
function renderPanel(): void {
  $('#verCommit').textContent = __APP_COMMIT__;
  $('#verTime').textContent = formatTime(__BUILD_TIME__);
  renderFeatures();
}

/* ---- 効果音テスト ---- */
function playDice(): void {
  let n = 0;
  const t = setInterval(() => { sfxDiceTick(); if (++n >= 7) clearInterval(t); }, 90);
}
function playSfx(kind: string | undefined): void {
  if (kind === 'start') sfxBattleStart();
  else if (kind === 'dice') playDice();
  else if (kind === 'win' || kind === 'lose' || kind === 'watch') sfxResult(kind);
}

/* ---- BGMテスト（ボタンを押したときだけ流す。ページを開いただけでは流さない） ---- */
const TRACK_JA: Record<TrackId, string> = { title: 'タイトル', game: 'ゲーム', battle: 'バトル' };
const isTrack = (s: string | undefined): s is TrackId => !!s && Object.prototype.hasOwnProperty.call(SONGS, s);
function playBgm(k: string | undefined): void {
  const id = isTrack(k) ? k : null;
  previewBgm(id);
  $('#bgmNow').textContent = id ? `再生中：${TRACK_JA[id]}（${SONGS[id].bpm} BPM）` : '停止中';
}

/* ---- 演出テスト：実際の showBattle をダミーの盤面で再生する ---- */
let demoId = 0;
function playDemo(kind: BattleSound): void {
  if (!app.G) { app.G = demoGame(); app.mode = 'cpu'; app.me = DEMO_ME; }
  showBattle(demoBattle(kind, ++demoId, app.G.players.map(p => p.name)));
}

/* ---- データ（ブラウザのダイアログは使わず、ページ内で確認する） ---- */
const CLEAR: Record<string, { text: string; run: () => void; done: string }> = {
  save: {
    text: '保存データ（CPU対戦の続き・オンライン対戦の再開情報）を削除します。よろしいですか？',
    run: () => [SAVE_CPU, SAVE_HOST, SAVE_GUEST].forEach(k => store.del(k)),
    done: '保存データを削除しました',
  },
  settings: {
    text: '設定（進行スピード・手番・効果音・BGMのオン／オフ）を初期値に戻します。よろしいですか？',
    run: () => SETTING_KEYS.forEach(k => store.del(k)),
    done: '設定を初期化しました',
  },
};
let pending: string | null = null;
function askClear(kind: string | undefined): void {
  if (!kind || !CLEAR[kind]) return;
  pending = kind;
  $('#confirmText').textContent = CLEAR[kind].text;
  $('#confirmYes').textContent = kind === 'save' ? '削除する' : '初期化する';
  $('#dataMsg').textContent = '';
  $('#dataBtns').hidden = true; $('#confirmBox').hidden = false;
  $('#confirmNo').focus();
}
function closeConfirm(): void { pending = null; $('#dataBtns').hidden = false; $('#confirmBox').hidden = true; }

/* ---- 初期化 ---- */
function init(): void {
  // 管理ページはテスト台：試験機能の設定に関係なく効果音を鳴らす
  setSoundPreview(true);
  initAudioUnlock();

  $('#gate').addEventListener('submit', e => { e.preventDefault(); void tryUnlock(); });
  $('#lockBtn').onclick = () => { playBgm('stop'); session.set(false); showPanel(false); $('#keyIn').focus(); };

  $('#featList').addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-on]'); if (!b) return;
    const id = b.closest<HTMLElement>('[data-feat]')?.dataset.feat;
    if (!isFeatureId(id)) return;
    setFeature(id, b.dataset.on === '1'); renderFeatures();
  });
  $('#sfxBtns').addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-sfx]'); if (b) playSfx(b.dataset.sfx);
  });
  $('#bgmBtns').addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-bgm]'); if (b) playBgm(b.dataset.bgm);
  });
  $('#demoBtns').addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-demo]'); if (!b) return;
    const k = b.dataset.demo;
    if (k === 'win' || k === 'lose' || k === 'watch') playDemo(k);
  });
  $('#dataBtns').addEventListener('click', e => {
    const b = (e.target as Element).closest<HTMLButtonElement>('button[data-clear]'); if (b) askClear(b.dataset.clear);
  });
  $('#confirmNo').onclick = closeConfirm;
  $('#confirmYes').onclick = () => {
    const c = pending ? CLEAR[pending] : null; closeConfirm();
    if (c) { c.run(); $('#dataMsg').textContent = c.done; }
  };

  showPanel(session.get());
  if (!session.get()) $('#keyIn').focus();
}

init();
