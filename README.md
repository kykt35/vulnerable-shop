# vulnerable-shop

ハンズオン用の「わざと脆弱なECサイト」です。**本番利用厳禁**。

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

## 体験に使う導線（概要）

- **XSS**: 商品詳細の「コメント投稿」→ コメントが無エスケープで表示される
- **SQL Injection**: 「商品検索」→ 文字列結合SQL
- **フォーム値改ざん**: 「購入」フォームの `hidden` 値（unit/total）を改ざん
- **CSRF**: Attackerサイトから Shop の購入を“勝手に”実行

詳しい手順は起動後に画面内の「Hands-on」リンクを参照してください（Shop側に手順を表示します）。

## 注意

- このアプリは意図的に脆弱です。**本番利用・社内ネットワークへの持ち込み禁止**を推奨します。
- ブラウザのCSRF対策（SameSite等）の影響で再現が不安定にならないよう、学習用にShop側へ `GET /csrf/purchase` を用意しています。
