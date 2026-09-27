/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 部屋コード API のベース URL（例: /api, https://example.com/api）。空なら使わない */
  readonly VITE_ROOM_API_BASE?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** ビルド時に埋め込むコミット（短い SHA。取れないときは 'dev'） */
declare const __APP_COMMIT__: string;
/** ビルド日時（ISO 8601） */
declare const __BUILD_TIME__: string;
