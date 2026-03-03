import { create } from "zustand";
import { temporal } from "zundo";
import type { Item, Tier, TierListState } from "@/types";
import { demoTierList } from "@/lib/demo-data";

// ──────────────────────────────────────────────
// Store shape: TierListState + actions
// ──────────────────────────────────────────────

interface TierListActions {
  /**
   * Move an item to a target tier at a specific index.
   * Automatically finds the item's current container.
   * `toTierId` = null means the unranked pool.
   * Guarantees: no duplicates, items never disappear.
   */
  moveItem: (itemId: string, toTierId: string | null, toIndex: number) => void;

  /** Rename a tier label (no-op if tierId not found) */
  renameTier: (tierId: string, newLabel: string) => void;

  /**
   * Initialize (or re-initialize) from a set of items.
   * Resets tiers to empty and places all items in the unranked pool.
   */
  initializeFromTemplate: (items: Item[]) => void;

  /** Reset to initial demo state */
  reset: () => void;
}

export type TierListStore = TierListState & TierListActions;

// ── Pure helpers (no store dependency) ────────

/** Find which container currently holds `itemId`. Returns tierId or null (pool). */
function findItemContainer(
  tiers: Tier[],
  unrankedItemIds: string[],
  itemId: string
): string | null {
  for (const tier of tiers) {
    if (tier.itemIds.includes(itemId)) return tier.id;
  }
  if (unrankedItemIds.includes(itemId)) return null;
  // Item not found anywhere — shouldn't happen, but return null as fallback
  return null;
}

/** Remove `itemId` from its current container and return the new state slices. */
function removeItem(
  tiers: Tier[],
  unrankedItemIds: string[],
  itemId: string,
  fromTierId: string | null
): { tiers: Tier[]; unrankedItemIds: string[] } {
  if (fromTierId === null) {
    return {
      tiers,
      unrankedItemIds: unrankedItemIds.filter((id) => id !== itemId),
    };
  }
  return {
    unrankedItemIds,
    tiers: tiers.map((tier) =>
      tier.id === fromTierId
        ? { ...tier, itemIds: tier.itemIds.filter((id) => id !== itemId) }
        : tier
    ),
  };
}

/**
 * Insert `itemId` into the target container at `toIndex`.
 * Clamps `toIndex` to valid bounds so items never disappear.
 */
function insertItem(
  tiers: Tier[],
  unrankedItemIds: string[],
  itemId: string,
  toTierId: string | null,
  toIndex: number
): { tiers: Tier[]; unrankedItemIds: string[] } {
  if (toTierId === null) {
    const next = [...unrankedItemIds];
    const clampedIndex = Math.max(0, Math.min(toIndex, next.length));
    next.splice(clampedIndex, 0, itemId);
    return { tiers, unrankedItemIds: next };
  }
  return {
    unrankedItemIds,
    tiers: tiers.map((tier) => {
      if (tier.id !== toTierId) return tier;
      const next = [...tier.itemIds];
      const clampedIndex = Math.max(0, Math.min(toIndex, next.length));
      next.splice(clampedIndex, 0, itemId);
      return { ...tier, itemIds: next };
    }),
  };
}

/**
 * Validate that every known item ID appears exactly once across
 * all tiers + the unranked pool. Used as a dev-time assertion.
 */
function assertNoItemLoss(
  tiers: Tier[],
  unrankedItemIds: string[],
  items: Record<string, Item>
): void {
  if (process.env.NODE_ENV === "production") return;

  const allPlaced = [
    ...unrankedItemIds,
    ...tiers.flatMap((t) => t.itemIds),
  ];
  const expected = Object.keys(items);

  const placed = new Set(allPlaced);
  if (placed.size !== allPlaced.length) {
    console.error("[TierListStore] Duplicate item detected!", allPlaced);
  }
  for (const id of expected) {
    if (!placed.has(id)) {
      console.error(`[TierListStore] Item "${id}" disappeared!`);
    }
  }
}

// ── Initial state ─────────────────────────────

const initialState: TierListState = {
  title: demoTierList.title,
  tiers: demoTierList.tiers,
  unrankedItemIds: demoTierList.unrankedItemIds,
  items: demoTierList.items,
};

// ── Store with undo / redo via zundo ──────────

export const useTierListStore = create<TierListStore>()(
  temporal(
    (set) => ({
      ...initialState,

      moveItem: (itemId, toTierId, toIndex) => {
        set((state) => {
          // Guard: item must exist in the items map
          if (!state.items[itemId]) return state;

          // Guard: if moving to a tier, it must exist
          if (toTierId !== null && !state.tiers.some((t) => t.id === toTierId)) {
            return state;
          }

          // 1. Find where the item currently lives
          const fromTierId = findItemContainer(
            state.tiers,
            state.unrankedItemIds,
            itemId
          );

          // 2. Same container, same index → no-op
          if (fromTierId === toTierId) {
            const container =
              fromTierId === null
                ? state.unrankedItemIds
                : state.tiers.find((t) => t.id === fromTierId)!.itemIds;
            const currentIndex = container.indexOf(itemId);
            if (currentIndex === toIndex) return state;
          }

          // 3. Remove from source
          const afterRemove = removeItem(
            state.tiers,
            state.unrankedItemIds,
            itemId,
            fromTierId
          );

          // 4. Insert at target
          const afterInsert = insertItem(
            afterRemove.tiers,
            afterRemove.unrankedItemIds,
            itemId,
            toTierId,
            toIndex
          );

          // 5. Dev-time invariant check
          assertNoItemLoss(afterInsert.tiers, afterInsert.unrankedItemIds, state.items);

          return {
            tiers: afterInsert.tiers,
            unrankedItemIds: afterInsert.unrankedItemIds,
          };
        });
      },

      renameTier: (tierId, newLabel) => {
        set((state) => ({
          tiers: state.tiers.map((tier: Tier) =>
            tier.id === tierId ? { ...tier, label: newLabel } : tier
          ),
        }));
      },

      initializeFromTemplate: (items: Item[]) => {
        const itemMap: Record<string, Item> = {};
        for (const item of items) {
          itemMap[item.id] = item;
        }
        set((state) => ({
          items: itemMap,
          unrankedItemIds: items.map((i) => i.id),
          // Reset all tiers to empty but keep the tier structure
          tiers: state.tiers.map((tier) => ({ ...tier, itemIds: [] })),
        }));
      },

      reset: () => {
        set({ ...initialState });
      },
    }),
    {
      // zundo options
      limit: 50,
      equality: (pastState, currentState) =>
        JSON.stringify(pastState.tiers) === JSON.stringify(currentState.tiers) &&
        JSON.stringify(pastState.unrankedItemIds) ===
          JSON.stringify(currentState.unrankedItemIds),
      // Only track tier/unranked changes for undo (items map is static)
      partialize: (state) => {
        return {
          tiers: state.tiers,
          unrankedItemIds: state.unrankedItemIds,
          title: state.title,
        } as unknown as TierListStore;
      },
    }
  )
);
