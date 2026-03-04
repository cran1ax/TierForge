import {
  pgTable,
  uuid,
  text,
  timestamp,
  integer,
  jsonb,
  index,
} from "drizzle-orm/pg-core";

// ──────────────────────────────────────────────
// TierForge — Database Schema  (Drizzle ORM + Neon Postgres)
// ──────────────────────────────────────────────

/**
 * Users
 *
 * Minimal profile for now — no auth provider columns yet.
 * `id` is a UUID so we can safely generate IDs on the client
 * or server without collisions.
 */
export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

/**
 * Templates
 *
 * A template defines the *items* that can be ranked
 * (e.g. "Programming Languages", "Marvel Movies").
 * `item_count` is denormalised for fast listing pages.
 */
export const templates = pgTable("templates", {
  id: uuid("id").defaultRandom().primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  itemCount: integer("item_count").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull()
    .$onUpdate(() => new Date()),
});

/**
 * Template Items
 *
 * The individual rankable items that belong to a template.
 * `sort_order` controls the default display / pool order.
 */
export const templateItems = pgTable(
  "template_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    imageUrl: text("image_url"),
    sortOrder: integer("sort_order").default(0).notNull(),
  },
  (table) => [
    index("template_items_template_id_idx").on(table.templateId),
  ],
);

/**
 * Tier Lists
 *
 * A user's *ranking* created from a template.
 *
 * `tier_data` stores the full ranking state as JSONB so we can
 * save / restore without joins.  Shape matches the frontend
 * `TierListState` type (tiers + unrankedItemIds).
 *
 * Example tier_data:
 * ```json
 * {
 *   "tiers": [
 *     { "id": "s", "label": "S", "color": "bg-red-500", "itemIds": ["ts","rust"] },
 *     ...
 *   ],
 *   "unrankedItemIds": ["lua","php"]
 * }
 * ```
 */
export const tierLists = pgTable(
  "tier_lists",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    creatorId: uuid("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    tierData: jsonb("tier_data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("tier_lists_creator_id_idx").on(table.creatorId),
    index("tier_lists_template_id_idx").on(table.templateId),
  ],
);

// ── Type helpers (inferred from schema) ────────

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;

export type Template = typeof templates.$inferSelect;
export type NewTemplate = typeof templates.$inferInsert;

export type TemplateItem = typeof templateItems.$inferSelect;
export type NewTemplateItem = typeof templateItems.$inferInsert;

export type TierList = typeof tierLists.$inferSelect;
export type NewTierList = typeof tierLists.$inferInsert;
