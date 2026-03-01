import "server-only";

import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

declare global {
  var __pool: Pool | undefined;
}

function getDatabaseUrl(): string {
  return process.env.DATABASE_URL ?? "";
}

const databaseUrl = getDatabaseUrl();

const pool =
  global.__pool ??
  new Pool(databaseUrl ? { connectionString: databaseUrl } : undefined);

if (process.env.NODE_ENV !== "production") {
  global.__pool = pool;
}

export const db = drizzle(pool, { schema });
