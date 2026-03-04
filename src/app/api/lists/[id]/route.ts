import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/server/db";
import { tierLists } from "@/server/db/schema";
import type { Tier } from "@/types";

// ──────────────────────────────────────────────
// TierForge — /api/lists/[id]  (GET + PUT)
// ──────────────────────────────────────────────

// ── Shared types for this route ────────────────

/**
 * The JSONB shape stored in `tier_lists.tier_data`.
 * This is the *ranking* portion of TierListState —
 * `items` live in the `template_items` table, not here.
 */
interface TierData {
  tiers: Tier[];
  unrankedItemIds: string[];
}

/** PUT request body */
interface UpdateTierListBody {
  tierData: TierData;
}

/** Shape returned by GET (and after a successful PUT) */
interface TierListResponse {
  id: string;
  creatorId: string;
  templateId: string;
  title: string;
  tierData: TierData;
  createdAt: Date;
  updatedAt: Date;
}

// ── Helpers ────────────────────────────────────

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Minimal runtime check that `tierData` has the expected shape.
 * We don't pull in zod to keep the MVP light — this covers the
 * essentials and TypeScript guards the rest at compile time.
 */
function isValidTierData(value: unknown): value is TierData {
  if (typeof value !== "object" || value === null) return false;
  const obj = value as Record<string, unknown>;

  if (!Array.isArray(obj.tiers)) return false;
  if (!Array.isArray(obj.unrankedItemIds)) return false;

  // Every tier must have at minimum { id, label, color, itemIds }
  for (const tier of obj.tiers) {
    if (typeof tier !== "object" || tier === null) return false;
    const t = tier as Record<string, unknown>;
    if (typeof t.id !== "string") return false;
    if (typeof t.label !== "string") return false;
    if (typeof t.color !== "string") return false;
    if (!Array.isArray(t.itemIds)) return false;
  }

  return true;
}

// ── Route params type ──────────────────────────

type RouteContext = { params: Promise<{ id: string }> };

// ── GET /api/lists/[id] ────────────────────────

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<NextResponse<TierListResponse | { error: string }>> {
  const { id } = await context.params;

  if (!isValidUUID(id)) {
    return NextResponse.json(
      { error: "Invalid tier list ID." },
      { status: 400 },
    );
  }

  const row = await db.query.tierLists.findFirst({
    where: eq(tierLists.id, id),
  });

  if (!row) {
    return NextResponse.json(
      { error: "Tier list not found." },
      { status: 404 },
    );
  }

  return NextResponse.json({
    id: row.id,
    creatorId: row.creatorId,
    templateId: row.templateId,
    title: row.title,
    tierData: row.tierData as TierData,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}

// ── PUT /api/lists/[id] ────────────────────────

export async function PUT(
  request: Request,
  context: RouteContext,
): Promise<NextResponse<TierListResponse | { error: string }>> {
  const { id } = await context.params;

  if (!isValidUUID(id)) {
    return NextResponse.json(
      { error: "Invalid tier list ID." },
      { status: 400 },
    );
  }

  // ── Parse & validate body ──

  let body: UpdateTierListBody;
  try {
    body = (await request.json()) as UpdateTierListBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  if (!body.tierData || !isValidTierData(body.tierData)) {
    return NextResponse.json(
      { error: "Invalid or missing tierData in request body." },
      { status: 422 },
    );
  }

  // ── Update ──

  const updated = await db
    .update(tierLists)
    .set({ tierData: body.tierData })
    .where(eq(tierLists.id, id))
    .returning();

  if (updated.length === 0) {
    return NextResponse.json(
      { error: "Tier list not found." },
      { status: 404 },
    );
  }

  const row = updated[0];

  return NextResponse.json({
    id: row.id,
    creatorId: row.creatorId,
    templateId: row.templateId,
    title: row.title,
    tierData: row.tierData as TierData,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  });
}
