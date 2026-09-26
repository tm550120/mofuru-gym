# 開拓の島 モフルジム

島に道とジムを建てて、モンスター「モフル」を進化させ、ジムバトルで競うボードゲームです。スマホのブラウザでそのまま遊べます。

**遊ぶ：** https://tm550120.github.io/mofuru-gym/

## 遊び方（モード）

URL を開くとタイトル画面が出るので、モードを選びます。ゲーム中は右上の「⌂」でタイトルに戻れます。

- **CPUと対戦**：あなた＋CPU 2人で遊びます。
- **フレンド対戦（オンライン）**：2〜3人で遊びます。
  1. ニックネームを入れて「部屋を作ってフレンドを招待」を押すと、5文字の部屋コードと招待リンクが出ます。
  2. フレンドはリンクを開くか、コードを入力して「参加する」を押します。
  3. 全員そろったらホストが「ゲーム開始」。「空いた席をCPUで埋める」をオンにすると、2人でもCPUを入れて3人で遊べます。
  - 通信は PeerJS（WebRTC）でブラウザ同士を直接つなぎます（接続の仲介に PeerJS の無料公開サーバーを使用）。ゲームの進行はホストの端末が管理します。
  - 途中で誰かの接続が切れると、ホストが「CPUに交代」か「ゲームを終了」を選べます。ホストが抜けると対戦は終了します。
  - 途中参加・再接続には対応していません。ネットワーク環境によってはつながらないことがあります。

## ルールの概要

- サイコロの合計と同じ数字の土地に接するジムは資源を1枚、都市は2枚もらえます。
- 資源を使って道・ジム・都市を建てます。
- 同じ資源3枚で、モフルが5つのタイプ（草・炎・風・光・岩）のどれかに進化します。
- 7が出たら、出した人が進化済みなら相手のジムにバトルを挑めます。
- バトルはサイコロ1個＋ボーナス（進化+2、相性有利+1、都市ジム+1）。勝つと相手の資源を1枚奪い、バッジを1個もらいます。負けると進化前に戻ります。
- バッジを最初に3個集めた人がチャンピオン（+2点）。より多く集めた人が現れると移ります。
- ジム1点、都市2点、最長の道2点、チャンピオン2点。先に10点で勝ち。

タイプ相性：風 → 炎 → 草 → 岩 → 光 → 風（左が右に強い）

## ファイル構成

npm workspaces のモノレポです。

| パス | 内容 |
| --- | --- |
| `frontend/` | ゲーム本体（Vite + TypeScript）。GitHub Pages に置くのはこのビルド結果 `frontend/dist` |
| `frontend/index.html` | 画面の HTML |
| `frontend/src/style.css` | スタイル |
| `frontend/src/game/` | ルール・状態・型（盤面生成、資源、建設、進化、バトル、得点、最長の道）。DOM に依存しない |
| `frontend/src/cpu/` | CPU の思考 |
| `frontend/src/app/` | ゲームの進行（初期配置・ターン・CPU の手番）とアプリ状態 |
| `frontend/src/net/` | オンライン対戦（PeerJS ラッパー、メッセージ型、部屋コード API クライアント） |
| `frontend/src/ui/` | 画面の描画と操作（盤面、バトル演出、シート、タイトル、ロビー） |
| `frontend/src/storage.ts` | localStorage のラッパー（ニックネーム保存） |
| `frontend/public/` | `manifest.webmanifest`（ホーム画面に追加したときの設定）とアイコン画像 |
| `backend/` | Node.js + TypeScript（Fastify）の小さな API サーバー |
| `shared/` | frontend / backend で共有する API の型（型のみ） |
| `.github/workflows/pages.yml` | `frontend/dist` を GitHub Pages にデプロイする |

### バックエンド（任意）

フロントエンドはバックエンドなしでも完全に動きます（CPU 対戦はオフラインで、オンライン対戦は PeerJS で）。バックエンドの役割は次のとおりです。

| メソッド / パス | 内容 |
| --- | --- |
| `GET /api/health` | `{ "status": "ok", "rooms": 登録中の部屋数 }` |
| `POST /api/rooms` | `{ code, peerId }` を登録（有効期限つき、既定2時間）。`201` で `hostToken` を返す。不正な値は `400`、登録済みは `409` |
| `GET /api/rooms/:code` | 部屋コードからホストの PeerJS ID を返す。無ければ `404` |
| `DELETE /api/rooms/:code` | `x-host-token` ヘッダーが正しければ削除（`204`）。違えば `403` |
| それ以外 | `frontend/dist` があれば静的ファイルとして配信 |

部屋コードの登録簿はメモリ上だけにあり、再起動で消えます。フロントエンドは `VITE_ROOM_API_BASE` が設定されているときだけ API を使い、ホストは部屋を作ったときに登録・閉じたときに削除、ゲストは参加時にコードを引きます。API に届かない・見つからないときは、従来どおり PeerJS ID（`mofuru-gym-<コード>`）で直接つなぎます。

環境変数：`PORT`（既定 8787）、`HOST`（既定 127.0.0.1）、`STATIC_DIR`（既定 `frontend/dist`、空文字で配信しない）、`ROOM_TTL_MS`、`CORS_ORIGIN`（別オリジンから API を呼ぶとき）。

## ローカルで動かす

Node.js 20.19 以上が必要です。

```sh
npm install
npm run dev        # バックエンド(:8787) とフロントエンド(:5173) を同時に起動
```

http://localhost:5173/ を開きます。開発時は `/api` がバックエンドに中継されます（`frontend/.env.development`）。フロントエンドだけ動かすなら `npm run dev -w frontend` です。

その他のコマンド：

```sh
npm run build      # frontend/dist と backend/dist を作る
npm test           # Vitest（ゲームロジックとバックエンド API）
npm run typecheck  # 全パッケージの型チェック
npm start          # ビルド済みのバックエンドを起動（frontend/dist も配信）
npm run preview -w frontend   # ビルドしたフロントエンドだけを確認
```

同じオリジンでバックエンドから配信し、部屋コード API も使う場合は `VITE_ROOM_API_BASE=/api npm run build` でビルドしてから `npm start` します。

## GitHub Pages へのデプロイ

`main` に push すると `.github/workflows/pages.yml` が型チェック・テスト・`frontend` のビルドを行い、`frontend/dist` を GitHub Pages に公開します。ビルドは相対パス（Vite の `base: './'`）なので `/mofuru-gym/` 配下でもそのまま動きます。

初回だけ、リポジトリの Settings → Pages → Build and deployment の Source を「GitHub Actions」に切り替えてください（これまでのブランチ直下の `index.html` はもうありません）。
