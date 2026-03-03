import type { Item, Tier, TierListState } from "@/types";

// ──────────────────────────────────────────────
// Hardcoded demo template — "Programming Languages"
// 15 items, 5 tiers (S / A / B / C / D)
// ──────────────────────────────────────────────

const items: Item[] = [
  { id: "item-1",  label: "TypeScript" },
  { id: "item-2",  label: "Python" },
  { id: "item-3",  label: "Rust" },
  { id: "item-4",  label: "Go" },
  { id: "item-5",  label: "JavaScript" },
  { id: "item-6",  label: "C#" },
  { id: "item-7",  label: "Java" },
  { id: "item-8",  label: "Swift" },
  { id: "item-9",  label: "Kotlin" },
  { id: "item-10", label: "C++" },
  { id: "item-11", label: "Ruby" },
  { id: "item-12", label: "PHP" },
  { id: "item-13", label: "Elixir" },
  { id: "item-14", label: "Haskell" },
  { id: "item-15", label: "Lua" },
];

const tiers: Tier[] = [
  { id: "tier-s", label: "S", color: "bg-red-500",    itemIds: [] },
  { id: "tier-a", label: "A", color: "bg-orange-500", itemIds: [] },
  { id: "tier-b", label: "B", color: "bg-yellow-500", itemIds: [] },
  { id: "tier-c", label: "C", color: "bg-green-500",  itemIds: [] },
  { id: "tier-d", label: "D", color: "bg-blue-500",   itemIds: [] },
];

/** Build the Item lookup map */
const itemMap: Record<string, Item> = {};
for (const item of items) {
  itemMap[item.id] = item;
}

/** Ready-to-use demo state — all items start in the unranked pool */
export const demoTierList: TierListState = {
  title: "Programming Languages Tier List",
  tiers,
  unrankedItemIds: items.map((i) => i.id),
  items: itemMap,
};
