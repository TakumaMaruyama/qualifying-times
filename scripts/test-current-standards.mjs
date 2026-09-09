import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { applyCurrentStandards, readCurrentStandards } from "./current-standards.mjs";
import { applySeedAndCurrentStandards } from "./seed.mjs";

const current = readCurrentStandards();
const db = await PGlite.create();
try {
  const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
  for (const entry of journal.entries) {
    await db.exec(readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
  }

  async function assertCurrentSnapshots() {
    let rowCount = 0;
    for (const meet of current) {
      const { rows: [registered] } = await db.query("SELECT id FROM meets WHERE level = $1 AND season = $2 AND course = $3 AND name = $4", [meet.level, meet.season, meet.course, meet.name]);
      assert.ok(registered);
      const { rows } = await db.query("SELECT gender, age_min, age_max, event_code, time_ms FROM standards WHERE meet_id = $1", [registered.id]);
      assert.equal(rows.length, meet.rows.length, meet.identity);
      rowCount += rows.length;
      for (const expected of meet.rows) {
        const actual = rows.find((row) => row.gender === expected.gender && row.age_min === expected.age_min && row.age_max === expected.age_max && row.event_code === expected.event_code);
        assert.equal(actual?.time_ms, expected.time_ms, `${meet.identity} ${JSON.stringify(expected)}`);
      }
    }
    assert.equal(rowCount, 1954);
  }

  // Bootstrap an empty migrated database through the same entry point used by db:seed.
  await db.query("BEGIN");
  const counts = await applySeedAndCurrentStandards(db, current);
  await db.query("COMMIT");
  assert.deepEqual(counts, { meets: 15, standards: 1954 });
  await assertCurrentSnapshots();

  const seededMeets = (await db.query("SELECT * FROM meets ORDER BY id")).rows;
  const unrelatedMeet = seededMeets.find((meet) => !current.some((currentMeet) =>
    currentMeet.level === meet.level && currentMeet.season === meet.season
      && currentMeet.course === meet.course && currentMeet.name === meet.name,
  ));
  assert.ok(unrelatedMeet, "A seed-only meet is required for preservation testing");
  const { rows: [unrelatedStandard] } = await db.query(`SELECT s.id, s.source_id FROM standards s
    JOIN sources source ON source.id = s.source_id WHERE s.meet_id = $1 ORDER BY s.id LIMIT 1`, [unrelatedMeet.id]);
  assert.ok(unrelatedStandard, "The seed-only meet needs a sourced standard");

  const preservedTime = 98765;
  const preservedMetadata = { fixture: "keep-existing-meet" };
  const preservedSourceTitle = "keep-existing-source";
  await db.query("UPDATE standards SET time_ms = $1 WHERE id = $2", [preservedTime, unrelatedStandard.id]);
  await db.query("UPDATE meets SET metadata_json = $1::jsonb WHERE id = $2", [JSON.stringify(preservedMetadata), unrelatedMeet.id]);
  await db.query("UPDATE sources SET title = $1 WHERE id = $2", [preservedSourceTitle, unrelatedStandard.source_id]);

  const originalMeets = (await db.query("SELECT * FROM meets ORDER BY id")).rows;
  const originalRows = (await db.query("SELECT * FROM standards ORDER BY id")).rows;
  await db.query("BEGIN");
  await applySeedAndCurrentStandards(db, current);
  await db.query("COMMIT");

  const { rows: [preservedStandard] } = await db.query("SELECT time_ms FROM standards WHERE id = $1", [unrelatedStandard.id]);
  const { rows: [preservedMeet] } = await db.query("SELECT metadata_json FROM meets WHERE id = $1", [unrelatedMeet.id]);
  const { rows: [preservedSource] } = await db.query("SELECT title FROM sources WHERE id = $1", [unrelatedStandard.source_id]);
  assert.equal(preservedStandard.time_ms, preservedTime);
  assert.deepEqual(preservedMeet.metadata_json, preservedMetadata);
  assert.equal(preservedSource.title, preservedSourceTitle);

  await assertCurrentSnapshots();
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
  await applySeedAndCurrentStandards(db, current);
  await db.query("COMMIT");
  assert.deepEqual(await snapshot(), beforeRepeat);

  // A mid-import failure must roll back preceding meet/standard updates too.
  await db.query("BEGIN");
  await assert.rejects(() => applySeedAndCurrentStandards(db, [
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
