/**
 * 部屋コード登録 API（backend）の型定義。
 * 型のみを置き、実行時コードは持たない（frontend / backend ともに `import type` で参照する）。
 */

/** POST /api/rooms のリクエスト */
export interface RoomCreateRequest {
  /** 5文字の部屋コード（A-Z, 2-9 のうち紛らわしい I, O, 0, 1 を除く） */
  code: string;
  /** ホストの PeerJS ID */
  peerId: string;
}

/** GET /api/rooms/:code のレスポンス */
export interface RoomInfo {
  code: string;
  peerId: string;
  /** 失効時刻（UNIX ミリ秒） */
  expiresAt: number;
}

/** POST /api/rooms のレスポンス。hostToken は DELETE 時に x-host-token ヘッダーで渡す */
export interface RoomCreateResponse extends RoomInfo {
  hostToken: string;
}

/** GET /api/health のレスポンス */
export interface HealthResponse {
  status: 'ok';
  rooms: number;
}

/** エラーレスポンス */
export interface ApiError {
  error: string;
}
