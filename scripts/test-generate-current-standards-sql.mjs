import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { PGlite } from "@electric-sql/pglite";

import { applyCurrentStandards, readCurrentStandards } from "./current-standards.mjs";
import { generateCurrentStandardsSql } from "./generate-current-standards-sql.mjs";

const current = readCurrentStandards();

async function migratedDatabase() {
  const db = await PGlite.create();
  const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    await db.exec(readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  }
  await db.exec(readFileSync(new URL("../drizzle/seed.sql", import.meta.url), "utf8"));
  return db;
}

async function normalizedSnapshot(db) {
  return Promise.all(["sources", "meets", "standards"].map(async (table) => {
    const row = table === "standards"
      ? "to_jsonb(t) - 'id' - 'created_at' - 'updated_at'"
      : "to_jsonb(t) - 'created_at' - 'updated_at'";
    return (await db.query(`SELECT ${row} AS row FROM ${table} t ORDER BY (${row})::text`)).rows;
  }));
}

function isCurrentMeet(meet) {
  return current.some((expected) => expected.level === meet.level && expected.season === meet.season
    && expected.course === meet.course && expected.name === meet.name);
}

const sql = generateCurrentStandardsSql();
const implementationDb = await migratedDatabase();
const generatedSqlDb = await migratedDatabase();

try {
  for (const db of [implementationDb, generatedSqlDb]) {
    const { rows: meets } = await db.query("SELECT * FROM meets ORDER BY id");
    const unrelatedMeet = meets.find((meet) => !isCurrentMeet(meet));
    assert.ok(unrelatedMeet);
    const { rows: [unrelatedStandard] } = await db.query(`SELECT s.id, s.source_id FROM standards s
      JOIN sources source ON source.id = s.source_id WHERE s.meet_id = $1 ORDER BY s.id LIMIT 1`, [unrelatedMeet.id]);
    assert.ok(unrelatedStandard);
    await db.query("UPDATE standards SET time_ms = 98765 WHERE id = $1", [unrelatedStandard.id]);
    await db.query("UPDATE meets SET metadata_json = '{\"fixture\":\"keep\"}'::jsonb WHERE id = $1", [unrelatedMeet.id]);
    await db.query("UPDATE sources SET title = 'keep-source' WHERE id = $1", [unrelatedStandard.source_id]);
  }

  await implementationDb.query("BEGIN");
  await applyCurrentStandards(implementationDb, current);
  await implementationDb.query("COMMIT");
  await generatedSqlDb.exec(sql);

  assert.deepEqual(await normalizedSnapshot(generatedSqlDb), await normalizedSnapshot(implementationDb));

  const beforeRepeat = await normalizedSnapshot(generatedSqlDb);
  await generatedSqlDb.exec(sql);
  assert.deepEqual(await normalizedSnapshot(generatedSqlDb), beforeRepeat);

  const rollbackDb = await migratedDatabase();
  try {
    const beforeFailure = await normalizedSnapshot(rollbackDb);
    const invalid = generateCurrentStandardsSql([
      { ...current[0], rows: current[0].rows.slice(0, 1) },
      { ...current[1], rows: [{ ...current[1].rows[0], time_ms: null }] },
    ]);
    await assert.rejects(() => rollbackDb.exec(invalid));
    await rollbackDb.exec("ROLLBACK;");
    assert.deepEqual(await normalizedSnapshot(rollbackDb), beforeFailure);
  } finally {
    await rollbackDb.close();
  }

  console.log("Generated current-standards SQL matches the implementation, preserves unrelated rows, repeats safely, and rolls back on failure.");
} finally {
  await implementationDb.close();
  await generatedSqlDb.close();
}
