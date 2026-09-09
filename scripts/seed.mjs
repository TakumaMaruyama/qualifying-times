import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import pg from "pg";
import { applyCurrentStandards, readCurrentStandards } from "./current-standards.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function toUpsertSql(seedSql) {
  return seedSql.replace(
    /INSERT INTO (\w+) \(([^)]+)\) VALUES \(([\s\S]*?)\) ON CONFLICT \(id\) DO NOTHING;/g,
    (statement, table, columnList, values) => {
      const columns = columnList.split(",").map((column) => column.trim());
      const updateColumns = columns.filter((column) => column !== "id");
      if (updateColumns.length === 0) {
        return statement;
      }
      const updateSet = updateColumns
        .map((column) => `${column} = EXCLUDED.${column}`)
        .join(", ");
      return `INSERT INTO ${table} (${columnList}) VALUES (${values}) ON CONFLICT (id) DO UPDATE SET ${updateSet};`;
    },
  );
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
    const seedPath = join(__dirname, "..", "drizzle", "seed.sql");
    const rawSql = readFileSync(seedPath, "utf-8");
    const sql = toUpsertSql(rawSql);

    console.log("Applying seed.sql (upsert mode)...");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      const updated = await applyCurrentStandards(client, current);
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

main();
