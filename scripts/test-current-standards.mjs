import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { applyCurrentStandards, readCurrentStandards } from "./current-standards.mjs";

const current = readCurrentStandards();
const db = await PGlite.create();
try {
  const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    await db.exec(readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  }
  await db.exec(readFileSync(new URL("../drizzle/seed.sql", import.meta.url), "utf8"));
  const originalMeets = (await db.query("SELECT * FROM meets ORDER BY id")).rows;
  const originalRows = (await db.query("SELECT * FROM standards ORDER BY id")).rows;
  await db.query("BEGIN");
  const counts = await applyCurrentStandards(db, current);
  await db.query("COMMIT");

  for (const meet of current) {
    const { rows: [registered] } = await db.query("SELECT id FROM meets WHERE level = $1 AND season = $2 AND course = $3 AND name = $4", [meet.level, meet.season, meet.course, meet.name]);
    assert.ok(registered);
    const { rows } = await db.query("SELECT gender, age_min, age_max, event_code, time_ms FROM standards WHERE meet_id = $1", [registered.id]);
    assert.equal(rows.length, meet.rows.length, meet.identity);
    for (const expected of meet.rows) {
      const actual = rows.find((row) => row.gender === expected.gender && row.age_min === expected.age_min && row.age_max === expected.age_max && row.event_code === expected.event_code);
      assert.equal(actual?.time_ms, expected.time_ms, `${meet.identity} ${JSON.stringify(expected)}`);
    }
  }
  const unchangedMeetIds = originalMeets.filter((original) => !current.some((meet) => meet.level === original.level && meet.season === original.season && meet.course === original.course && meet.name === original.name)).map((meet) => meet.id);
  const { rows: preserved } = await db.query("SELECT * FROM standards WHERE meet_id = ANY($1::uuid[]) ORDER BY id", [unchangedMeetIds]);
  assert.deepEqual(preserved, originalRows.filter((row) => unchangedMeetIds.includes(row.meet_id)));

  // Reapplying must not create duplicate meets, sources, or standard records.
  async function snapshot() {
    return Promise.all(["sources", "meets", "standards"].map(async (table) =>
      (await db.query(`SELECT to_jsonb(t) - 'updated_at' AS row FROM ${table} t ORDER BY id`)).rows,
    ));
  }
  const beforeRepeat = await snapshot();
  await db.query("BEGIN");
  await applyCurrentStandards(db, current);
  await db.query("COMMIT");
  assert.deepEqual(await snapshot(), beforeRepeat);

  // A mid-import failure must roll back preceding meet/standard updates too.
  await db.query("BEGIN");
  await assert.rejects(() => applyCurrentStandards(db, [
    { ...current[0], rows: current[0].rows.slice(0, 1) },
    { ...current[1], rows: [{ ...current[1].rows[0], time_ms: null }] },
  ]));
  await db.query("ROLLBACK");
  assert.deepEqual(await snapshot(), beforeRepeat);

  // Targeted replacement removes retired categories without touching history.
  const first = current[0];
  await db.query("BEGIN");
  await applyCurrentStandards(db, [{ ...first, rows: first.rows.slice(0, 1) }]);
  const { rows: [{ count }] } = await db.query("SELECT count(*)::int AS count FROM standards s JOIN meets m ON m.id = s.meet_id WHERE m.level = $1 AND m.season = $2 AND m.course = $3 AND m.name = $4", [first.level, first.season, first.course, first.name]);
  assert.equal(count, 1);
  await db.query("ROLLBACK");
  console.log(`Standards integration passed: ${counts.meets} meet/course editions, ${counts.standards} official rows; ${unchangedMeetIds.length} historical/unrelated editions preserved; repeat and rollback verified.`);
} finally {
  await db.close();
}
