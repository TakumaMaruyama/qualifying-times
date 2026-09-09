# 公開準備・適用記録（2026-09-10）

## 対象と許可

- 対象: `qualifying-times.replit.app`。年齢の初期全選択・全選択ボタンを含む検索UI、確認済み10大会・水路15区分・1,954標準記録。
- 最新のユーザー指示「公開まで」によりGitHub反映・本番公開を許可済み。
- Replitにだけ存在する応援機能と既存データを保持する。

## 公開前の修正と検証

- Next.js / eslint-config-nextを16.3.4へ固定。Drizzle ORMを0.45.2へ更新し、npm 10互換の公開registryロックを使用。
- `npm audit --omit=dev`: 本番依存の指摘0件。開発依存の全件解消を意味しない。
- `npm run build` からseedを分離。接続できないDBアドレスを指定しても本番ビルドが通ることを確認。
- UI28件、lint、型チェック、検索API回帰、15区分1,954行同期、対象外9区分の保持、再実行・rollbackの使い捨てDB検証が通過。
- 本番DBを伴う更新とアプリの公開は別操作。公開ビルドではDBを更新しない。

## 本番標準記録の適用準備

- Replit正規UIの Database → 本番データベース → 設定で、ポイントインタイムリカバリがオン・過去7日間であることを確認。スケジュールされたバックアップはオフ。
- 本番一覧の適用前表示はmeets 15、sources 19、standards 1,978、cheer_clicks 406行。応援数は利用により増加するため固定値の一致を完了条件にしない。
- `node scripts/generate-current-standards-sql.mjs /tmp/current-standards-2026-09-10.sql` で正規SQLコンソール向けの適用SQLを生成。
- 生成SQL SHA-256: `8eaafd8824ad7404d94d53e81c561a9840618a8a153b7785cfd1e3ec686929cc`。
- `node scripts/test-generate-current-standards-sql.mjs` で既存同期処理との値の等価性、対象外の保持、冪等、失敗後rollbackを確認。独立レビューで本番適用を止める指摘なし。
- SQLはsources・meets・standardsのみを対象に、同じ大会・年度・水路の公式表全体を同期。全1,954行・大会identity・出典内容の集合比較ガードが失敗するとcommitされない。コンソールがエラーで後続処理を止めた場合は同じ接続で `ROLLBACK;` を実行する。
- 既存行のIDは保持。新規standardのIDは生成SQLと通常同期処理で異なる場合があるが、表示値・検索・参照整合性に差はない。

## 現在の適用状態

- 本番DBへの書き込みは未実施。自動承認レビューが、以前の読み取り専用指定を理由に検証用SQLスニペット作成を却下した。SQL作成・実行を含む具体的な本番DB更新許可をユーザーへ確認中。
- 本番公開の実行・公開URLでの確認は、実施結果をこの記録へ追記する。
