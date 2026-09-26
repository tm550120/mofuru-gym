/* バックエンドの部屋コード API（任意）。
   VITE_ROOM_API_BASE が空なら何もしない（GitHub Pages 版の既定）。
   届かない・失敗したときは null / false を返し、呼び出し側は従来の PeerJS ID 方式で続ける */
import type { RoomCreateRequest, RoomCreateResponse, RoomInfo } from '@mofuru-gym/shared';

const BASE = (import.meta.env.VITE_ROOM_API_BASE || '').replace(/\/+$/, '');
const TIMEOUT_MS = 1500;
const PEER_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

export const roomApiEnabled = (): boolean => BASE !== '';

async function call(path: string, init: RequestInit = {}): Promise<Response | null> {
  if (!BASE) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(BASE + path, { ...init, signal: ctl.signal });
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** 部屋コード → ホストの PeerJS ID を登録する。成功したら削除用トークンを返す */
export async function registerRoom(code: string, peerId: string): Promise<string | null> {
  const body: RoomCreateRequest = { code, peerId };
  const res = await call('/rooms', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!res || !res.ok) return null;
  try {
    const data = (await res.json()) as RoomCreateResponse;
    return typeof data.hostToken === 'string' ? data.hostToken : null;
  } catch {
    return null;
  }
}

/** 部屋コードからホストの PeerJS ID を引く（見つからない・届かないときは null） */
export async function resolveRoom(code: string): Promise<string | null> {
  const res = await call('/rooms/' + encodeURIComponent(code));
  if (!res || !res.ok) return null;
  try {
    const data = (await res.json()) as RoomInfo;
    return typeof data.peerId === 'string' && PEER_ID_RE.test(data.peerId) ? data.peerId : null;
  } catch {
    return null;
  }
}

/** 登録を消す（部屋を閉じたとき） */
export function unregisterRoom(code: string, hostToken: string): void {
  void call('/rooms/' + encodeURIComponent(code), { method: 'DELETE', headers: { 'x-host-token': hostToken }, keepalive: true });
}
