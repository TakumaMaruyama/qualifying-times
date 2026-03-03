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
    const seedPath = join(__dirname, "..", "drizzle", "seed.sql");
    const sql = readFileSync(seedPath, "utf-8");

    console.log("Applying seed.sql...");
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
