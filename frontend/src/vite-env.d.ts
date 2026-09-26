/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 部屋コード API のベース URL（例: /api, https://example.com/api）。空なら使わない */
  readonly VITE_ROOM_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
