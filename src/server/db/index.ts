import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

// ──────────────────────────────────────────────
// TierForge — Database Connection  (Neon Serverless + Drizzle)
// ──────────────────────────────────────────────

/**
 * We use Neon's HTTP driver (`neon-http`) which is ideal for
 * serverless / edge deployments — no persistent TCP connection
 * needed.  Each query is a single HTTP request to Neon.
 *
 * The connection string is read from the `DATABASE_URL` env var
 * which Neon provides in its dashboard.
 */

function getConnectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. " +
        "Add it to .env.local (see .env.example for the format).",
    );
  }
  return url;
}

const sql = neon(getConnectionString());

/**
 * Drizzle instance — import this wherever you need DB access:
 *
 * ```ts
 * import { db } from "@/server/db";
 * const rows = await db.select().from(schema.users);
 * ```
 */
export const db = drizzle(sql, { schema });
