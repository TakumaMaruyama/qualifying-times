# 標準記録検索アプリ

Next.js (App Router) + TypeScript + Tailwind + Drizzle + PostgreSQL で作成した、
全国レベル / 九州レベル / 県レベル（鹿児島）の標準記録検索アプリです。

大会名と種目・年齢別の標準記録を表示します。大会日時や会場などの開催情報は検索結果に表示しません。標準記録の短水路・長水路・共通の区別は残しています。
年度を指定しない検索では、大会名・レベル・プール長ごとに最新登録年度を使います。最新年度にない年齢・性別の記録を旧年度で補完しません。

## 標準記録の更新（2026-09-09確認）

- `data/standards/national-current.json` / `regional-current.json`: 公式資料から確認した標準記録。
- [全国大会の出典](docs/national-standards-sources.md) / [九州・鹿児島の出典](docs/regional-standards-sources.md)
- 次年度の数値表を確認できない大会は、確認できた直近の公式記録を使用しています。公式資料の自動取得・自動更新は行いません。
- `npm run db:seed` は不足している既存シードだけを追加し（既存IDは変更しない）、この公式記録だけを単一トランザクションで同期します。
- 同じ大会名・レベル・年度・プール長の記録は公式表全体で置き換え、削除された種目・年齢区分を残しません。別年度と無関係な大会は保持します。開催情報の入力は不要です。
- `npm run build` はDBを更新しません。標準記録の同期は公開とは別に実行します。適用先DBを確認し、既存DBの更新前にはバックアップを取得してください。旧年度は保持されますが、同じ年度内の訂正前の値へ戻すにはバックアップの復元が必要です。

## 検証

```bash
npm run lint
npx tsc --noEmit
npm run test:data
npm run test:search
npm run test:ui
```

データ同期・検索のテストは、実環境の `DATABASE_URL` を使わず、使い捨てのローカルPostgreSQL互換DB（PGlite）を使用します。検索テストはローカルの5100 / 55439番ポートを使います。
公式データ入りのローカル画面は `node scripts/test-search.mjs --preview` で確認できます。終了時にデータは破棄されます。
`node scripts/test-search.mjs --preview --production` は使い捨てDBにseedを適用した後、本番ビルドと起動を確認できます。

## 検索画面

- 初回は年齢を全選択して表示します。個別に変更でき、「全選択」ボタンでまとめて選び直せます。
- 次回は保存した条件で結果を直接表示します。結果画面では性別・年齢を変えるだけで更新します。
- 全国／九州／鹿児島を切り替え、大会を一段で開閉します。同じ大会の長水路・短水路・共通はカード内で選択します。
- 前回の地域・大会・水路を端末内に保存します。使えなくなった大会・水路は表示可能な先頭に戻ります。
- 選手名・履歴と表示の説明は折りたたんでいます。共有URLの条件は保存条件より優先されます。
- タイムの先頭のゼロだけを表示時に省略します。API・保存データの値は変えません。横長の表は種目列を固定して表の中でスクロールします。
- 通信失敗時は同じ条件で再試行できます。端末の保存機能が使えなくても検索できます。

## 技術スタック

- Next.js 16 (App Router)
- TypeScript
- Tailwind CSS
- PostgreSQL
- Drizzle ORM + drizzle-kit
- zod

## 必要な環境変数

`.env` を作成して以下を設定してください。

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME
ADMIN_PASSWORD=your_admin_password
```

## セットアップ

```bash
npm install
npm run db:generate
npm run db:migrate
npm run dev
```

## 主要ページ

- `/` 検索フォーム
- `/result` 検索結果表示
- `/admin/import` 管理画面（JSONプレビュー/登録 + 取込済み記録の閲覧・編集）

## API

- `POST /api/search`
- `POST /api/admin/login`
- `GET /api/admin/session`
- `POST /api/admin/preview`
- `POST /api/admin/import`
- `GET /api/admin/records`
- `GET /api/admin/records/:meetId`
- `POST /api/admin/records/:meetId`
- `PATCH /api/admin/records/:meetId/:recordId`
- `DELETE /api/admin/records/:meetId/:recordId`

### 管理APIリクエスト（preview/import）

```json
{
  "level": "national",
  "season": 2026,
  "course": "SCM",
  "meetName": "2026 県春季記録会",
  "meetDate": "2026-05-03",
  "meetDateEnd": "2026-05-05",
  "meetMetadata": { "category": "県予選" },
  "jsonText": "{ ... }"
}
```

- `course` は `SCM` / `LCM` / `ANY`（短水路・長水路共通）
- `ANY` は水路別に区分されていない共通の標準記録です。出場資格の細則は公式要項に従います。
- `meetDate` は任意（`YYYY-MM-DD`）
- `meetDateEnd` は任意（`YYYY-MM-DD`、`meetDate` と同日またはそれ以降）

### 検索APIレスポンス（抜粋）

```json
{
  "targetAges": [11, 12, 13],
  "season": 2026,
  "course": "SCM",
  "gender": "M",
  "results": {
    "national": [
      {
        "meet_id": "uuid",
        "meet_name": "全国大会A",
        "meet_season": 2026,
        "meet_course": "SCM",
        "items": [{ "event_code": "FR_50", "age": 11, "time": "00:29.80" }]
      }
    ],
    "kyushu": [],
    "kagoshima": []
  }
}
```

## 管理画面の入力JSON形式

```json
{
  "source": {
    "title": "string",
    "url": "string | null",
    "pages": [1, 2, 3]
  },
  "rows": [
    {
      "gender": "M",
      "age_min": 11,
      "age_max": 12,
      "event_code": "FR_50",
      "time": "29.80"
    }
  ]
}
```

- `event_code` は `/^((FR|BK|BR|FL|IM)_\d{2,4}|(FRR|MRR)_\dX\d{2,4})$/`
- `time` は `59.87`, `1:02.34`, `00:29.80`, `10:12.34` を許容
- 壊れた行はエラーとして除外

## DB構成（概要）

- `meets`:
  - `level, season, course, name` で一意
  - `metadata_json` に任意情報を保存
- `standards`:
  - `meet_id` に紐づく大会単位データ
  - 一意キーは `(meet_id, gender, age_min, age_max, event_code)`

## サンプルJSON

```json
{
  "source": {"title":"sample","url":null,"pages":null},
  "rows":[
    {"gender":"M","age_min":11,"age_max":12,"event_code":"FR_50","time":"29.80"},
    {"gender":"M","age_min":11,"age_max":12,"event_code":"FR_100","time":"1:05.20"},
    {"gender":"F","age_min":13,"age_max":14,"event_code":"IM_200","time":"2:28.50"},
    {"gender":"M","age_min":13,"age_max":14,"event_code":"FRR_4X100","time":"4:12.34"}
  ]
}
```

## Replit Deploy

1. Replit Secrets に `DATABASE_URL` と `ADMIN_PASSWORD` を設定
2. 初回は `npm run db:migrate` を実行してスキーマを作成。適用先とバックアップを確認して `npm run db:seed` を別途実行（buildではDBを更新しない）
3. Deploy 設定の Build command は `npm run build`、Start command は `npm run start` にしてデプロイ
