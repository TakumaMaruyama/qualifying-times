import { readFileSync } from "fs";
import { join } from "path";
import { Pool } from "pg";

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    const check = await pool.query("SELECT COUNT(*)::int AS count FROM meets");
    if (check.rows[0].count > 0) {
      console.log("Database already has data, skipping seed.");
      return;
    }

    const seedPath = join(__dirname, "..", "drizzle", "seed.sql");
    const sql = readFileSync(seedPath, "utf-8");

    console.log("Seeding database...");
    await pool.query(sql);
    console.log("Seed complete.");
  } catch (err) {
    console.error("Seed failed:", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
