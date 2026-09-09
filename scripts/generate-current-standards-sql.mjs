import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

import { readCurrentStandards } from "./current-standards.mjs";

function stableId(value) {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

function literal(value) {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}

function jsonLiteral(value) {
  return `${literal(JSON.stringify(value))}::jsonb`;
}

function sourceId(meet) {
  return stableId(`source|${meet.identity}|${JSON.stringify(meet.source)}`);
}

function canonicalMeetId(meet) {
  return stableId(`meet|${meet.identity}`);
}

function sourceTuple(meet) {
  return `(${literal(sourceId(meet))}::uuid, ${literal(meet.source.title)}::text, ${literal(meet.source.url)}::text, ${jsonLiteral(meet.source.pages)})`;
}

function meetTuple(meet) {
  return `(${literal(meet.level)}::standard_level, ${meet.season}::integer, ${literal(meet.course)}::course, ${literal(meet.name)}::text)`;
}

function standardTuple(meet, row) {
  const id = stableId(`standard|${canonicalMeetId(meet)}|${row.gender}|${row.age_min}|${row.age_max}|${row.event_code}`);
  return `(${literal(id)}::uuid, ${literal(row.gender)}::gender, ${row.age_min}::integer, ${row.age_max}::integer, ${literal(row.event_code)}::text, ${row.time_ms}::integer)`;
}

function expectedStandardTuple(meet, row) {
  return `(${literal(meet.level)}::standard_level, ${meet.season}::integer, ${literal(meet.course)}::course, ${literal(meet.name)}::text, ${literal(row.gender)}::gender, ${row.age_min}::integer, ${row.age_max}::integer, ${literal(row.event_code)}::text, ${row.time_ms}::integer, ${literal(sourceId(meet))}::uuid)`;
}

function standardsUpsertSql(meet) {
  const values = meet.rows.map((row) => standardTuple(meet, row)).join(",\n  ");
  const identity = meetTuple(meet);
  return `-- ${meet.identity}\nINSERT INTO standards (id, meet_id, gender, age_min, age_max, event_code, time_ms, source_id)
SELECT r.id, m.id, r.gender, r.age_min, r.age_max, r.event_code, r.time_ms, ${literal(sourceId(meet))}::uuid
FROM (VALUES
  ${values}
) AS r(id, gender, age_min, age_max, event_code, time_ms)
JOIN meets m ON (m.level, m.season, m.course, m.name) = ${identity}
ON CONFLICT (meet_id, gender, age_min, age_max, event_code)
DO UPDATE SET time_ms = EXCLUDED.time_ms, source_id = EXCLUDED.source_id, updated_at = now();

DELETE FROM standards s
WHERE s.meet_id = (SELECT id FROM meets WHERE (level, season, course, name) = ${identity})
  AND NOT EXISTS (
    SELECT 1 FROM (VALUES
      ${meet.rows.map((row) => `(${literal(row.gender)}::gender, ${row.age_min}::integer, ${row.age_max}::integer, ${literal(row.event_code)}::text)`).join(",\n      ")}
    ) AS expected(gender, age_min, age_max, event_code)
    WHERE expected.gender = s.gender
      AND expected.age_min = s.age_min
      AND expected.age_max = s.age_max
      AND expected.event_code = s.event_code
  );`;
}

function guardSql(current) {
  const expectedStandards = current.flatMap((meet) => meet.rows.map((row) => expectedStandardTuple(meet, row))).join(",\n    ");
  const expectedSources = current.map(sourceTuple).join(",\n    ");
  const expectedMeets = current.map(meetTuple).join(",\n    ");
  const count = current.reduce((sum, meet) => sum + meet.rows.length, 0);

  return `-- Fail the transaction if any of the 1,954 expected rows, sources, or meet identities differ.
WITH expected_standards(level, season, course, name, gender, age_min, age_max, event_code, time_ms, source_id) AS (
  VALUES
    ${expectedStandards}
), expected_sources(id, title, url, pages_json) AS (
  VALUES
    ${expectedSources}
), expected_meets(level, season, course, name) AS (
  VALUES
    ${expectedMeets}
), actual_standards AS (
  SELECT m.level, m.season, m.course, m.name, s.gender, s.age_min, s.age_max, s.event_code, s.time_ms, s.source_id
  FROM standards s JOIN meets m ON m.id = s.meet_id
  JOIN expected_meets e ON (e.level, e.season, e.course, e.name) = (m.level, m.season, m.course, m.name)
), actual_sources AS (
  SELECT s.id, s.title, s.url, s.pages_json FROM sources s JOIN expected_sources e ON e.id = s.id
), actual_meets AS (
  SELECT m.level, m.season, m.course, m.name FROM meets m JOIN expected_meets e
    ON (e.level, e.season, e.course, e.name) = (m.level, m.season, m.course, m.name)
), differences AS (
  (SELECT * FROM expected_standards EXCEPT SELECT * FROM actual_standards)
  UNION ALL (SELECT * FROM actual_standards EXCEPT SELECT * FROM expected_standards)
), source_differences AS (
  (SELECT * FROM expected_sources EXCEPT SELECT * FROM actual_sources)
  UNION ALL (SELECT * FROM actual_sources EXCEPT SELECT * FROM expected_sources)
), meet_differences AS (
  (SELECT * FROM expected_meets EXCEPT SELECT * FROM actual_meets)
  UNION ALL (SELECT * FROM actual_meets EXCEPT SELECT * FROM expected_meets)
)
SELECT 1 / CASE WHEN
  (SELECT count(*) FROM expected_standards) = ${count}
  AND (SELECT count(*) FROM actual_standards) = ${count}
  AND NOT EXISTS (SELECT 1 FROM differences)
  AND NOT EXISTS (SELECT 1 FROM source_differences)
  AND NOT EXISTS (SELECT 1 FROM meet_differences)
THEN 1 ELSE 0 END AS current_standards_guard;`;
}

export function generateCurrentStandardsSql(current = readCurrentStandards()) {
  const sourceValues = current.map(sourceTuple).join(",\n  ");
  const meetValues = current.map((meet) => `(${literal(canonicalMeetId(meet))}::uuid, ${meetTuple(meet).slice(1, -1)})`).join(",\n  ");
  return `-- Generated by scripts/generate-current-standards-sql.mjs. Do not edit.\n-- Scope: ${current.length} official meet/course snapshots and ${current.reduce((sum, meet) => sum + meet.rows.length, 0)} standards only.\nBEGIN;\n\nINSERT INTO sources (id, title, url, pages_json)\nVALUES\n  ${sourceValues}\nON CONFLICT (id) DO UPDATE SET\n  title = EXCLUDED.title, url = EXCLUDED.url, pages_json = EXCLUDED.pages_json;\n\nINSERT INTO meets (id, level, season, course, name)\nVALUES\n  ${meetValues}\nON CONFLICT (level, season, course, name) DO UPDATE SET updated_at = now();\n\n${current.map(standardsUpsertSql).join("\n\n")}\n\n${guardSql(current)}\n\nCOMMIT;\n`;
}

const isEntryPoint = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isEntryPoint) {
  const outputPath = process.argv[2] ?? "/tmp/current-standards.sql";
  const sql = generateCurrentStandardsSql();
  writeFileSync(outputPath, sql, "utf8");
  console.log(`Generated ${outputPath} (${Buffer.byteLength(sql)} bytes).`);
}
