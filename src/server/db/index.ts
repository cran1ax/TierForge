import { neon, type NeonQueryFunction } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
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
 *
 * **Lazy initialisation** — the connection is created on first
 * access so that `import { db }` doesn't throw at build time
 * when the env var isn't available.
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

let _sql: NeonQueryFunction<false, false> | undefined;
let _db: NeonHttpDatabase<typeof schema> | undefined;

/**
 * Drizzle instance — import this wherever you need DB access:
 *
 * ```ts
 * import { db } from "@/server/db";
 * const rows = await db.select().from(schema.users);
 * ```
 *
 * The instance is created lazily on first call, so importing
 * this module during `next build` won't fail when DATABASE_URL
 * is absent.
 */
export function getDb(): NeonHttpDatabase<typeof schema> {
  if (!_db) {
    _sql = neon(getConnectionString());
    _db = drizzle(_sql, { schema });
  }
  return _db;
}

/**
 * Convenience alias — shorthand for `getDb()`.
 *
 * Using a getter on a plain object lets you write `db.select()`
 * exactly like before, but the connection is still lazy.
 */
export const db = new Proxy({} as NeonHttpDatabase<typeof schema>, {
  get(_target, prop, receiver) {
    const realDb = getDb();
    const value = Reflect.get(realDb, prop, receiver);
    return typeof value === "function" ? value.bind(realDb) : value;
  },
});
