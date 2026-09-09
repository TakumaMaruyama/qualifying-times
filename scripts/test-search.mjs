import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";

// Always use an isolated, in-memory database, even if DATABASE_URL is set.
const database = await PGlite.create();
const journal = JSON.parse(readFileSync(new URL("../drizzle/meta/_journal.json", import.meta.url), "utf8"));
for (const entry of journal.entries) {
  await database.exec(readFileSync(new URL(`../drizzle/${entry.tag}.sql`, import.meta.url), "utf8"));
}
// Match pg.Pool's default capacity so concurrent UI searches can use this disposable DB.
const socket = new PGLiteSocketServer({ db: database, host: "127.0.0.1", port: 55439, maxConnections: 10 });
await socket.start();
const env = { ...process.env, DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:55439/postgres" };
const preview = process.argv.includes("--preview");
const production = preview && process.argv.includes("--production");
let app;
let closing;

function close() {
  if (!closing) {
    closing = (async () => {
      if (app && app.exitCode === null && app.signalCode === null) {
        app.kill("SIGTERM");
        await once(app, "exit");
      }
      await socket.stop();
      await database.close();
    })();
  }
  return closing;
}
process.once("SIGINT", async () => { await close(); process.exit(0); });
process.once("SIGTERM", async () => { await close(); process.exit(0); });

try {
  if (preview) {
    const seed = spawn(process.execPath, ["scripts/seed.mjs"], { env, stdio: "inherit" });
    const [code] = await once(seed, "exit");
    assert.equal(code, 0, "Preview seed must succeed");
    if (production) {
      // Exercise the actual deployment build (including a second seed run).
      const build = spawn("npm", ["run", "build"], { env, stdio: "inherit" });
      const [buildCode] = await once(build, "exit");
      assert.equal(buildCode, 0, "Production build must succeed");
    }
  } else {
    // A newer unrelated meet must not hide another meet's latest edition.
    // A newer edition removing an age/gender must not resurrect old rows.
    await database.exec(`
      INSERT INTO meets (id, level, season, course, name, meet_date, metadata_json) VALUES
      ('00000000-0000-4000-8000-000000000001','national',2024,'SCM','大会A','2028-01-01','{"venue":"非表示"}'),
      ('00000000-0000-4000-8000-000000000002','national',2025,'SCM','大会A','2020-01-01',NULL),
      ('00000000-0000-4000-8000-000000000003','national',2024,'LCM','大会A',NULL,NULL),
      ('00000000-0000-4000-8000-000000000004','kyushu',2026,'ANY','大会B',NULL,NULL),
      ('00000000-0000-4000-8000-000000000005','kagoshima',2023,'ANY','大会C',NULL,NULL),
      ('00000000-0000-4000-8000-000000000006','national',2024,'ANY','大会D',NULL,NULL),
      ('00000000-0000-4000-8000-000000000007','national',2025,'ANY','大会D',NULL,NULL);
      INSERT INTO standards (meet_id, gender, age_min, age_max, event_code, time_ms) VALUES
      ('00000000-0000-4000-8000-000000000001','M',9,17,'FR_50',30000),
      ('00000000-0000-4000-8000-000000000002','M',11,12,'FR_50',29000),
      ('00000000-0000-4000-8000-000000000003','M',9,17,'FR_50',31000),
      ('00000000-0000-4000-8000-000000000004','M',9,17,'FR_50',35000),
      ('00000000-0000-4000-8000-000000000005','M',9,17,'FR_50',40000),
      ('00000000-0000-4000-8000-000000000006','F',9,17,'FR_50',32000),
      ('00000000-0000-4000-8000-000000000007','M',9,17,'FR_50',31000);
    `);
  }

  app = spawn(process.execPath, ["node_modules/next/dist/bin/next", ...(production ? ["start"] : ["dev", "--webpack"]), "-p", "5100", "-H", "127.0.0.1"], { env, stdio: "inherit" });
  const baseUrl = "http://127.0.0.1:5100";
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) {
    if (app.exitCode !== null) throw new Error("App exited before becoming ready");
    try { await fetch(`${baseUrl}/api/search`, { method: "POST", body: "{}" }); ready = true; break; } catch { /* waiting for server */ }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  assert.ok(ready, "App must start");
  if (preview) {
    const response = await fetch(`${baseUrl}/api/search`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ gender: "M", course: "ANY", targetAges: [9, 11, 12, 13, 14, 15, 16, 17] }),
    });
    assert.equal(response.status, 200, "Seeded application search must succeed");
    const result = await response.json();
    assert.ok(Object.values(result.results).flat().length > 0, "Seeded search must return official standards");
    console.log("Seeded application search passed.");
    console.log(`Preview with isolated database: ${baseUrl}`);
    await once(app, "exit");
  } else {
    async function search(overrides = {}) {
      const response = await fetch(`${baseUrl}/api/search`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gender: "M", course: "ANY", targetAges: [11, 12], ...overrides }),
      });
      return { status: response.status, body: await response.json() };
    }
    const current = await search();
    assert.equal(current.status, 200);
    const all = Object.values(current.body.results).flat();
    assert.equal(all.length, 5);
    const scm = all.find((meet) => meet.meet_name === "大会A" && meet.meet_course === "SCM");
    assert.equal(scm.meet_season, 2025);
    assert.deepEqual(scm.items.map((item) => item.time), ["00:29.00", "00:29.00"]);
    assert.ok(all.some((meet) => meet.meet_name === "大会C" && meet.meet_season === 2023));
    for (const meet of all) {
      assert.equal("meet_date" in meet, false);
      assert.equal("meet_date_end" in meet, false);
      assert.equal("meet_metadata" in meet, false);
    }
    const short = await search({ course: "SCM" });
    assert.equal(Object.values(short.body.results).flat().length, 4);
    assert.ok(Object.values(short.body.results).flat().every((meet) => meet.meet_course !== "LCM"));
    const removedAge = await search({ targetAges: [9, 17] });
    assert.ok(!removedAge.body.results.national.some((meet) => meet.meet_name === "大会A" && meet.meet_course === "SCM"));
    const removedGender = await search({ gender: "F" });
    assert.equal(Object.values(removedGender.body.results).flat().length, 0);
    const historical = await search({ season: 2024 });
    assert.equal(historical.body.results.national.find((meet) => meet.meet_course === "SCM").items[0].time, "00:30.00");
    for (const input of [{ targetAges: [] }, { targetAges: [8] }, { gender: "X" }, { course: "BAD" }]) {
      assert.equal((await search(input)).status, 400);
    }
    console.log("Search integration passed: latest editions per meet/course, age/gender removals, historical API, common course, no dates/metadata, invalid input.");
  }
} finally {
  await close();
}
