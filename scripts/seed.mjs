import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join, resolve } from "path";
import pg from "pg";
import { applyCurrentStandards, readCurrentStandards } from "./current-standards.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function readSeedSql() {
  return readFileSync(join(__dirname, "..", "drizzle", "seed.sql"), "utf-8");
}

async function executeSql(client, sql) {
  if (typeof client.exec === "function") {
    await client.exec(sql);
    return;
  }
  await client.query(sql);
}

// Caller owns the transaction. The exported seed file retains its original
// ON CONFLICT (id) DO NOTHING clauses, then current snapshots replace only
// their exact level/season/course/name identities.
export async function applySeedAndCurrentStandards(client, current = readCurrentStandards()) {
  await executeSql(client, readSeedSql());
  return applyCurrentStandards(client, current);
}

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new pg.Pool({ connectionString: databaseUrl });

  try {
    const current = readCurrentStandards();
    console.log("Bootstrapping missing seed rows and synchronizing current official standards...");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const updated = await applySeedAndCurrentStandards(client, current);
      await client.query("COMMIT");
      console.log(`Current official standards: ${updated.meets} meets / ${updated.standards} rows.`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
    console.log("Seed complete.");
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

const isEntryPoint = process.argv[1] !== undefined
  && fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isEntryPoint) {
  main();
}
