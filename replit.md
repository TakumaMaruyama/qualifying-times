# 標準記録検索アプリ (Japanese Swimming Qualification Standards Search App)

## Overview
A Next.js web application for searching Japanese swimming competition qualification standards. Users search by gender and selected age groups. Results show each meet’s latest registered standards by pool type, without competition dates or venue metadata.

## Tech Stack
- **Framework**: Next.js 16.3.4 with App Router (webpack mode)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4 with PostCSS
- **Database**: PostgreSQL with Drizzle ORM
- **Runtime**: Node.js 20

## Database Schema
Tables: `meets`, `standards`, `sources`
- Uses PostgreSQL enums for gender, pool type, level
- Managed via Drizzle Kit migrations

## Key Configuration

### Tailwind CSS v4 Compatibility Fix
Tailwind CSS v4 generates `url(...)` CSS values (with literal `...` ellipsis) for mask utilities. webpack's css-loader tries to resolve these as file paths, causing build errors.

**Fix**: A local PostCSS plugin (`postcss-fix-tailwind-urls/`) is symlinked into `node_modules` and runs after `@tailwindcss/postcss` to replace `url(...)` with `url(data:,)`.

- `postcss.config.cjs` — uses both `@tailwindcss/postcss` and `postcss-fix-tailwind-urls`
- `postcss-fix-tailwind-urls/` — local PostCSS plugin package (symlinked to node_modules)

### Dev Server
- Runs on port 5000 with `--webpack` flag (Turbopack can't load lightningcss native binaries in Replit)
- `allowedDevOrigins` configured from `REPLIT_DOMAINS` env var

### Admin Panel
- Protected by `ADMIN_PASSWORD` secret (cookie-based auth)
- Used for importing competition standards data

## Project Structure
```
src/
  app/          # Next.js App Router pages
  components/   # React components
  db/           # Drizzle ORM client and schema
  lib/          # Utilities (auth, date helpers, search service)
postcss-fix-tailwind-urls/  # Local PostCSS plugin for Tailwind v4 compatibility
```

## Environment Variables
- `DATABASE_URL` — PostgreSQL connection string (auto-provisioned)
- `ADMIN_PASSWORD` — Admin panel authentication password
- `REPLIT_DOMAINS` — Set by Replit, used for CORS allowedDevOrigins

## Database Seeding
- `drizzle/seed.sql` — 開発環境からエクスポートしたシードデータ（sources, meets, standards）
- `scripts/seed.mjs` — シードを実行するスクリプト（既存IDは変更せず、不足分だけ追加して公式スナップショットを同期）
- `npm run db:seed` — シードスクリプトの実行コマンド
- 初回は `npm run db:migrate` でスキーマを作成
- `data/standards/*-current.json` — 2026-09-09に公式資料から確認した記録。大会名・年度・プール長ごとに同期し、旧年度は保持。
- デプロイ時のビルドコマンド: `npm run build`（DB更新なし）。公式記録の同期は適用先・バックアップを確認し、公開とは別に実行する。

## Known Issues / Notes
- Must use `--webpack` flag in dev (not Turbopack) because lightningcss native binaries can't load in Replit's Turbopack sandbox
- The `postcss-fix-tailwind-urls` symlink in `node_modules` must be preserved across npm installs (or recreated)
