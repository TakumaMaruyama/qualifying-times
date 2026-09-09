import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const database = await PGlite.create();
try {
  const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    await database.exec(readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  }
  const userHash = "test-user";
  const cheerDate = "2026-09-10";
  const first = await database.query(
    "INSERT INTO cheer_clicks (user_hash, cheer_date) VALUES ($1, $2) ON CONFLICT (user_hash, cheer_date) DO NOTHING RETURNING id",
    [userHash, cheerDate],
  );
  const duplicate = await database.query(
    "INSERT INTO cheer_clicks (user_hash, cheer_date) VALUES ($1, $2) ON CONFLICT (user_hash, cheer_date) DO NOTHING RETURNING id",
    [userHash, cheerDate],
  );
  const { rows: [{ count }] } = await database.query("SELECT count(*)::int AS count FROM cheer_clicks");
  assert.equal(first.rows.length, 1);
  assert.equal(duplicate.rows.length, 0);
  assert.equal(count, 1);
  console.log("Cheer migration passed: one user can add one click per day; duplicates remain a single row.");
} finally {
  await database.close();
}
