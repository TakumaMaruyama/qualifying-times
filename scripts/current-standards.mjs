import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { z } from "zod";

const rowSchema = z.object({
  gender: z.enum(["M", "F"]),
  age_min: z.number().int().min(0).max(120),
  age_max: z.number().int().min(0).max(120),
  event_code: z.string().regex(/^((FR|BK|BR|FL|IM)_\d{2,4}|(FRR|MRR)_\dX\d{2,4})$/),
  time: z.string().regex(/^(\d{1,3}|\d{1,2}:[0-5]\d)\.\d{2}$/),
});
const catalogSchema = z.object({
  asOf: z.iso.date(),
  meets: z.array(z.object({
    name: z.string().min(1),
    level: z.enum(["national", "kyushu", "kagoshima"]),
    season: z.number().int().min(1900).max(3000),
    course: z.enum(["SCM", "LCM", "ANY"]),
    source: z.object({
      title: z.string().min(1),
      url: z.string().url(),
      pages: z.array(z.number().int().nonnegative()).nullable(),
    }),
    rows: z.array(rowSchema).min(1),
  })).min(1),
});

function stableId(value) {
  const hex = createHash("sha256").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

export function readCurrentStandards() {
  const catalogs = ["national-current.json", "regional-current.json"].map((file) => {
    const parsed = catalogSchema.safeParse(JSON.parse(readFileSync(new URL(`../data/standards/${file}`, import.meta.url), "utf8")));
    if (!parsed.success) {
      throw new Error(`Invalid ${file}: ${parsed.error.issues.slice(0, 5).map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; ")}`);
    }
    return parsed.data;
  });
  const identities = new Set();
  return catalogs.flatMap((catalog) => catalog.meets.map((meet) => {
    const identity = [meet.level, meet.season, meet.course, meet.name].join("|");
    if (identities.has(identity)) throw new Error(`Duplicate meet: ${identity}`);
    identities.add(identity);
    const rows = meet.rows.map((row) => {
      const parts = row.time.split(":");
      const seconds = parts.length === 2 ? Number(parts[0]) * 60 + Number(parts[1]) : Number(parts[0]);
      const time_ms = Math.round(seconds * 1000);
      if (row.age_min > row.age_max || time_ms <= 0) throw new Error(`Invalid standard: ${identity}`);
      return { ...row, time_ms };
    });
    for (const [index, row] of rows.entries()) {
      if (rows.slice(0, index).some((other) => other.gender === row.gender && other.event_code === row.event_code
        && other.age_min <= row.age_max && other.age_max >= row.age_min)) {
        throw new Error(`Overlapping ages: ${identity} ${row.gender} ${row.event_code}`);
      }
    }
    return { ...meet, rows, identity };
  }));
}

// Caller owns the transaction. Only these exact meet/season/course snapshots
// are replaced; historical editions and unrelated meets remain available.
export async function applyCurrentStandards(client, current = readCurrentStandards()) {
  for (const meet of current) {
    const sourceId = stableId(`source|${meet.identity}|${JSON.stringify(meet.source)}`);
    await client.query(`INSERT INTO sources (id, title, url, pages_json)
      VALUES ($1, $2, $3, $4::jsonb)
      ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, url = EXCLUDED.url, pages_json = EXCLUDED.pages_json`,
    [sourceId, meet.source.title, meet.source.url, JSON.stringify(meet.source.pages)]);
    const { rows: [registered] } = await client.query(`INSERT INTO meets (id, level, season, course, name)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (level, season, course, name) DO UPDATE SET updated_at = now()
      RETURNING id`, [stableId(`meet|${meet.identity}`), meet.level, meet.season, meet.course, meet.name]);
    const rowsJson = JSON.stringify(meet.rows.map((row) => ({
      ...row, id: stableId(`standard|${registered.id}|${row.gender}|${row.age_min}|${row.age_max}|${row.event_code}`),
    })));
    await client.query(`INSERT INTO standards (id, meet_id, gender, age_min, age_max, event_code, time_ms, source_id)
      SELECT r.id, $1::uuid, r.gender::gender, r.age_min, r.age_max, r.event_code, r.time_ms, $2::uuid
      FROM jsonb_to_recordset($3::jsonb) AS r(id uuid, gender text, age_min integer, age_max integer, event_code text, time_ms integer)
      ON CONFLICT (meet_id, gender, age_min, age_max, event_code)
      DO UPDATE SET time_ms = EXCLUDED.time_ms, source_id = EXCLUDED.source_id, updated_at = now()`,
    [registered.id, sourceId, rowsJson]);
    await client.query(`DELETE FROM standards s WHERE s.meet_id = $1 AND NOT EXISTS (
      SELECT 1 FROM jsonb_to_recordset($2::jsonb) AS r(gender text, age_min integer, age_max integer, event_code text)
      WHERE s.gender::text = r.gender AND s.age_min = r.age_min AND s.age_max = r.age_max AND s.event_code = r.event_code
    )`, [registered.id, rowsJson]);
  }
  return { meets: current.length, standards: current.reduce((sum, meet) => sum + meet.rows.length, 0) };
}
