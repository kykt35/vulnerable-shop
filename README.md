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

### Attacker

- `PORT`（既定: 9000）
- `TARGET_BASE`（既定: `http://localhost:8000`。攻撃対象のShop URL）

## 体験に使う導線（概要）

- **XSS**:
  - `/search` の検索語が無エスケープで反映（反射型）
  - `/products/:id` のコメントが無エスケープで表示（保存型）
- **SQL Injection**:
  - `/login` のユーザー名/パスワードが文字列結合SQL
  - `/search` の `q` が文字列結合SQL（UNION/コメント構文が有効）
- **フォーム値改ざん**: `/purchase/:productId` の `unit_price_yen` / `total_yen` を改ざんして送信
- **CSRF**:
  - Attacker の `/` でコメント投稿を偽装
  - Attacker の `/auto-purchase` で購入リクエストを自動送信

詳しい手順は起動後に画面内の「Hands-on」リンクを参照してください（Shop側に手順を表示します）。

## 注意

- このアプリは意図的に脆弱です。**本番利用・社内ネットワークへの持ち込み禁止**を推奨します。
