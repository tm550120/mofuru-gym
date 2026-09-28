/* ゲームの保存（リロードしても同じ盤面・同じ状態から再開できるように、状態を変えるたびに保存する） */
import { vp } from '../game/rules';
import type { GameState } from '../game/types';
import { loadJSON, store } from '../storage';

export const SAVE_CPU = 'mofuru-save-cpu', SAVE_HOST = 'mofuru-save-host', SAVE_GUEST = 'mofuru-save-guest';
export const SAVE_VERSION = 2;

export type OrderMode = 'random' | 'list';

/** CPU 対戦の保存 */
export interface CpuSave { v: number; ME: number; G: GameState; info: string; at: number }
/** ホストの保存（席ごとの再接続トークンは G に入れない＝他の人には見えない） */
export interface HostSave { v: number; code: string; G: GameState; tokens: Record<number, string>; orderMode: OrderMode; at: number }
/** ゲストの保存（同じ席に戻るためのトークン） */
export interface GuestSave { code: string; token: string; name: string; seat: number; at: number }

/** タイトルの「続きから」に出す説明 */
export function saveInfo(g: GameState, me: number): string {
  return `${g.phase === 'setup' ? '初期配置中' : 'ターン' + ((g.turnN || 0) + 1)}・${g.players[me].name} ★${vp(g, me)}点`;
}

/** CPU 対戦を保存する（終わったゲームは消す） */
export function saveCpu(g: GameState, me: number): void {
  if (g.phase === 'over') { store.del(SAVE_CPU); return; }
  const s: CpuSave = { v: SAVE_VERSION, ME: me, G: g, info: saveInfo(g, me), at: Date.now() };
  store.set(SAVE_CPU, JSON.stringify(s));
}

export function loadCpuSave(): CpuSave | null {
  const s = loadJSON<CpuSave>(SAVE_CPU);
  return s && s.v === SAVE_VERSION && s.G && s.G.players && s.G.seq ? s : null;
}
export function loadHostSave(): HostSave | null {
  const s = loadJSON<HostSave>(SAVE_HOST);
  return s && s.v === SAVE_VERSION && s.G && s.code ? s : null;
}
/** ゲストの保存はこの時間を過ぎたら使わない（終わった部屋の「戻る」がずっと残らないように） */
export const GUEST_SAVE_TTL_MS = 12 * 60 * 60 * 1000;
/** ゲストの保存が「オンライン対戦に戻る」に使えるか */
export function isUsableGuestSave(s: GuestSave | null, now: number): s is GuestSave {
  return !!s && !!s.code && !!s.token && typeof s.at === 'number' && now - s.at < GUEST_SAVE_TTL_MS;
}
export function loadGuestSave(): GuestSave | null {
  const s = loadJSON<GuestSave>(SAVE_GUEST);
  return isUsableGuestSave(s, Date.now()) ? s : null;
}
