import { create } from "zustand";
import { temporal } from "zundo";
import type { Tier, TierListState } from "@/types";
import { demoTierList } from "@/lib/demo-data";

// ──────────────────────────────────────────────
// Store shape: TierListState + actions
// ──────────────────────────────────────────────

interface TierListActions {
  /** Move an item from one container to another at a specific index */
  moveItem: (
    itemId: string,
    fromTierId: string | null,
    toTierId: string | null,
    toIndex: number
  ) => void;

  /** Rename a tier label */
  renameTier: (tierId: string, newLabel: string) => void;

  /** Reset to initial demo state */
  reset: () => void;
}

export type TierListStore = TierListState & TierListActions;

// ── Helpers ───────────────────────────────────

/** Remove an item ID from wherever it currently lives */
function removeItemFromSource(
  state: TierListState,
  itemId: string,
  fromTierId: string | null
): TierListState {
  if (fromTierId === null) {
    return {
      ...state,
      unrankedItemIds: state.unrankedItemIds.filter((id) => id !== itemId),
    };
  }
  return {
    ...state,
    tiers: state.tiers.map((tier) =>
      tier.id === fromTierId
        ? { ...tier, itemIds: tier.itemIds.filter((id) => id !== itemId) }
        : tier
    ),
  };
}

/** Insert an item ID into the target container at the given index */
function insertItemAtTarget(
  state: TierListState,
  itemId: string,
  toTierId: string | null,
  toIndex: number
): TierListState {
  if (toTierId === null) {
    const newUnranked = [...state.unrankedItemIds];
    newUnranked.splice(toIndex, 0, itemId);
    return { ...state, unrankedItemIds: newUnranked };
  }
  return {
    ...state,
    tiers: state.tiers.map((tier) => {
      if (tier.id !== toTierId) return tier;
      const newItemIds = [...tier.itemIds];
      newItemIds.splice(toIndex, 0, itemId);
      return { ...tier, itemIds: newItemIds };
    }),
  };
}

// ── Initial state (no actions) ────────────────

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

      moveItem: (itemId, fromTierId, toTierId, toIndex) => {
        set((state) => {
          const afterRemove = removeItemFromSource(state, itemId, fromTierId);
          return insertItemAtTarget(afterRemove, itemId, toTierId, toIndex);
        });
      },

      renameTier: (tierId, newLabel) => {
        set((state) => ({
          tiers: state.tiers.map((tier: Tier) =>
            tier.id === tierId ? { ...tier, label: newLabel } : tier
          ),
        }));
      },

      reset: () => {
        set({ ...initialState });
      },
    }),
    {
      // zundo options
      limit: 50, // max undo stack depth
      equality: (pastState, currentState) =>
        JSON.stringify(pastState.tiers) === JSON.stringify(currentState.tiers) &&
        JSON.stringify(pastState.unrankedItemIds) ===
          JSON.stringify(currentState.unrankedItemIds),
      // Only track tier/unranked changes for undo (items map is static)
      partialize: (state) => {
        // Strip actions and static data from undo history
        return {
          tiers: state.tiers,
          unrankedItemIds: state.unrankedItemIds,
          title: state.title,
        } as unknown as TierListStore;
      },
    }
  )
);
