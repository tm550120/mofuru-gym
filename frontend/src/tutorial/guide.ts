/* ガイド付きチュートリアルの案内（吹き出し・スポットライト・進み具合）。
 * ゲームは本物の画面と進行をそのまま使い、ここは「次に押す場所を示す」「台本にない操作を止める」だけを行う。
 * 台本（置く場所・サイコロの目・手順）は script.ts。状態は保存しないので、再読み込みすると最初からになる */
import { newGame, setDirector } from '../app/session';
import { app } from '../app/state';
import { vp } from '../game/rules';
import type { GameState } from '../game/types';
import { $ } from '../ui/dom';
import { goTitle, hideTitle, showTitle } from '../ui/title';
import { CHAPTERS, ME, SEATS, SEQ, STEPS, boardRng, makeDirector, type Step } from './script';

/** 進行中の手順（-1 は案内していない） */
let idx = -1;
let g: GameState | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let ended = false;

export const guideActive = (): boolean => idx >= 0;
/** しめくくり（チュートリアル完了）まで進んだか */
export const guideEnded = (): boolean => ended;

export function startGuide(): void {
  stopGuide();
  app.mode = 'tutorial'; app.me = ME; app.pending = false;
  setDirector(makeDirector());
  hideTitle();
  newGame(SEATS, SEQ, boardRng());
  g = app.G; idx = 0; ended = false;
  document.body.classList.add('guiding');
  $('#guide').hidden = false;
  show();
  timer = setInterval(tick, 120);
}

/** 案内をやめる（ゲームの後始末は呼び出し側が goTitle で行う） */
export function stopGuide(): void {
  if (timer) clearInterval(timer);
  timer = null; idx = -1; g = null; ended = false;
  setDirector(null);
  document.body.classList.remove('guiding');
  $('#guide').hidden = true; $('#gEnd').classList.remove('show');
}

function leave(panel: 'menu' | 'cpu'): void {
  stopGuide(); goTitle();
  if (panel === 'cpu') showTitle('cpu');
}

const isDone = (s: Step): boolean => (!s.done || (!!g && s.done(g))) && (!s.doneSel || !!document.querySelector(s.doneSel));

function tick(): void {
  if (idx < 0 || ended) return;
  if (app.G !== g) { stopGuide(); return; }
  const s = STEPS[idx];
  if (s.kind !== 'info' && isDone(s)) { next(); return; }
  place();
}

function next(): void {
  if (idx < 0) return;
  if (idx + 1 >= STEPS.length) { finish(); return; }
  idx++; show();
}

/** 手順の説明を吹き出しに出す */
function show(): void {
  const s = STEPS[idx];
  $('#gCh').textContent = `${s.ch}/${CHAPTERS.length}`;
  $('#gTitle').textContent = CHAPTERS[s.ch - 1];
  $('#gText').textContent = s.text;
  $('#gNext').hidden = s.kind !== 'info';
  const hint = $('#gHint');
  $('#gBubble').hidden = false;
  hint.hidden = s.kind === 'info';
  hint.textContent = s.kind === 'tap' ? '👆 光っているところをタップ' : '⏳ CPU の動きを待っています…';
  $('#gBubble').dataset.kind = s.kind;
  place();
}

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

/** 対象を枠で囲み、吹き出しを対象に重ならない側へ置く（盤面は描き直されるので毎回測り直す） */
function place(): void {
  if (idx < 0) return;
  const s = STEPS[idx], ring = $('#gRing'), bub = $('#gBubble');
  const el = s.target ? document.querySelector(s.target) : null;
  /* シートの中でスクロールしないと見えない対象は、見える位置まで送る */
  if (el instanceof HTMLElement && el.closest('.sheet')) {
    const q = el.getBoundingClientRect(), box = el.closest('.sheet')!.getBoundingClientRect();
    const vv0 = window.visualViewport, w0 = vv0 ? vv0.width : window.innerWidth, h0 = vv0 ? vv0.height : window.innerHeight;
    if (q.top < box.top || q.bottom > Math.min(box.bottom, h0)) el.scrollIntoView({ block: 'center', inline: 'nearest' });
    else if (q.left < 0 || q.right > w0) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  const rc = el ? el.getBoundingClientRect() : null;
  const r = rc && (rc.width > 0 || rc.height > 0) ? rc : null;
  /* 見えている範囲に収める（内容がはみ出して画面が縮小表示されているときも、見えている側を基準にする） */
  const vv = window.visualViewport;
  const vw = Math.min(document.documentElement.clientWidth, vv ? vv.width : Infinity), vh = Math.min(window.innerHeight, vv ? vv.height : Infinity);
  if (r) {
    const pad = 4;
    ring.hidden = false;
    ring.style.left = `${r.left - pad}px`; ring.style.top = `${r.top - pad}px`;
    ring.style.width = `${r.width + pad * 2}px`; ring.style.height = `${r.height + pad * 2}px`;
    ring.classList.toggle('dim', s.kind !== 'wait');
  } else ring.hidden = true;
  const bw = bub.offsetWidth, bh = bub.offsetHeight, gap = 12;
  let top: number;
  if (!r) top = s.kind === 'wait' ? 8 : (vh - bh) / 2;
  /* 盤面の上の対象は、島が隠れないよう盤面の下（操作パネルの上）に置く */
  else if (el && el.closest('#board') && !s.side) top = $('#boardWrap').getBoundingClientRect().bottom + 4;
  else {
    const above = r.top - gap - bh, below = r.bottom + gap;
    const fitsAbove = above >= 8, fitsBelow = below + bh <= vh - 8;
    const preferAbove = s.side ? s.side === 'above' : r.top + r.height / 2 > vh / 2;
    if (preferAbove ? fitsAbove || !fitsBelow : !fitsBelow && fitsAbove) top = above; else top = below;
  }
  bub.style.top = `${clamp(top, 8, Math.max(8, vh - bh - 8))}px`;
  const cx = r ? r.left + r.width / 2 : vw / 2;
  bub.style.left = `${clamp(cx - bw / 2, 8, Math.max(8, vw - bw - 8))}px`;
}

/** 台本にない操作をしたとき：吹き出しをゆらして、押す場所をもう一度示す */
function nudge(): void {
  const bub = $('#gBubble');
  bub.classList.remove('nudge'); void bub.offsetWidth; bub.classList.add('nudge');
}

/** 案内中は、指示した対象と案内自身のボタン以外のタップを止める */
function guard(e: Event): void {
  if (idx < 0) return;
  const t = e.target as Element | null;
  if (!t || !t.closest) return;
  if (t.closest('#gBubble, #gEnd')) return;
  const s = STEPS[idx];
  if (!ended && s.kind === 'tap' && s.target) {
    const el = document.querySelector(s.target);
    /* 押したらすぐ次の手順へ進める（続けて2回押しても、2回目は台本にない操作として止まる） */
    if (el && (el === t || el.contains(t))) { setTimeout(tick, 0); return; }
  }
  e.preventDefault(); e.stopPropagation();
  if (!ended) nudge();
}

/** しめくくり：勝利条件と得点のおさらい */
function finish(): void {
  const G = g; if (!G) return;
  ended = true;
  const gyms = G.V.filter(v => v.owner === ME && !v.city).length, cities = G.V.filter(v => v.owner === ME && v.city).length;
  $('#gEndNow').textContent = `いまのあなた：ジム${gyms}つ（${gyms}点）＋都市${cities}つ（${cities * 2}点）＝ ★${vp(G, ME)}点、🏅バッジ${G.players[ME].badges}個`;
  /* ゲームはここで止める（このあとの CPU の番は進めない） */
  app.G = null;
  $('#gRing').hidden = true; $('#gBubble').hidden = true;
  $('#gEnd').classList.add('show');
}


export function initGuide(): void {
  document.addEventListener('click', guard, true);
  window.addEventListener('resize', place);
  $('#gNext').onclick = next;
  $('#gQuit').onclick = () => { if (confirm('チュートリアルをやめて、タイトルに戻りますか？')) leave('menu'); };
  $('#gPlay').onclick = () => leave('cpu');
  $('#gHome').onclick = () => leave('menu');
}
