import { create } from "zustand";
import type {
  Item,
  Tier,
  TierListState,
  InverseOperation,
  UndoEntry,
} from "@/types";
import { demoTierList } from "@/lib/demo-data";

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const MAX_UNDO_STACK = 50;

// ──────────────────────────────────────────────
// Store shape: TierListState + actions + undo
// ──────────────────────────────────────────────

/** Source of an operation — local actions are undoable, remote are not */
export type OperationSource = "local" | "remote";

interface TierListActions {
  /**
   * Move an item to a target tier at a specific index.
   * Automatically finds the item's current container.
   * `toTierId` = null means the unranked pool.
   * `source` = "remote" skips undo stack (default: "local").
   */
  moveItem: (
    itemId: string,
    toTierId: string | null,
    toIndex: number,
    source?: OperationSource
  ) => void;

  /**
   * Rename a tier label.
   * `source` = "remote" skips undo stack (default: "local").
   */
  renameTier: (
    tierId: string,
    newLabel: string,
    source?: OperationSource
  ) => void;

  /** Initialize from a set of items. Clears undo/redo stacks. */
  initializeFromTemplate: (items: Item[]) => void;

  /** Reset to initial demo state. Clears undo/redo stacks. */
  reset: () => void;

  /** Pop the undo stack and apply the inverse operation */
  undo: () => void;

  /** Pop the redo stack and re-apply the forward operation */
  redo: () => void;
}

interface UndoRedoState {
  undoStack: UndoEntry[];
  redoStack: UndoEntry[];
}

export type TierListStore = TierListState & UndoRedoState & TierListActions;

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
  return null;
}

/** Get the current index of `itemId` within its container */
function findItemIndex(
  tiers: Tier[],
  unrankedItemIds: string[],
  itemId: string,
  containerId: string | null
): number {
  if (containerId === null) {
    return unrankedItemIds.indexOf(itemId);
  }
  const tier = tiers.find((t) => t.id === containerId);
  return tier ? tier.itemIds.indexOf(itemId) : -1;
}

/** Remove `itemId` from its current container. */
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

/** Insert `itemId` at `toIndex` (clamped to bounds). */
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

/** Dev-time invariant: every item appears exactly once. */
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

// ── Apply an InverseOperation to the current state ──

function applyInverseOp(
  state: TierListStore,
  op: InverseOperation
): Partial<TierListStore> {
  switch (op.type) {
    case "MOVE_ITEM": {
      const { itemId, toTierId, toIndex } = op;
      if (!state.items[itemId]) return {};
      const fromTierId = findItemContainer(state.tiers, state.unrankedItemIds, itemId);
      const afterRemove = removeItem(state.tiers, state.unrankedItemIds, itemId, fromTierId);
      const afterInsert = insertItem(afterRemove.tiers, afterRemove.unrankedItemIds, itemId, toTierId, toIndex);
      assertNoItemLoss(afterInsert.tiers, afterInsert.unrankedItemIds, state.items);
      return { tiers: afterInsert.tiers, unrankedItemIds: afterInsert.unrankedItemIds };
    }
    case "RENAME_TIER": {
      const { tierId, toLabel } = op;
      return {
        tiers: state.tiers.map((tier: Tier) =>
          tier.id === tierId ? { ...tier, label: toLabel } : tier
        ),
      };
    }
  }
}

// ── Initial state ─────────────────────────────

const initialState: TierListState & UndoRedoState = {
  title: demoTierList.title,
  tiers: demoTierList.tiers,
  unrankedItemIds: demoTierList.unrankedItemIds,
  items: demoTierList.items,
  undoStack: [],
  redoStack: [],
};

// ── Store ─────────────────────────────────────

export const useTierListStore = create<TierListStore>()(
  (set) => ({
    ...initialState,

    moveItem: (itemId, toTierId, toIndex, source = "local") => {
      set((state) => {
        // Guard: item must exist
        if (!state.items[itemId]) return state;
        // Guard: target tier must exist
        if (toTierId !== null && !state.tiers.some((t) => t.id === toTierId)) {
          return state;
        }

        // 1. Capture origin BEFORE the move (needed for inverse)
        const fromTierId = findItemContainer(state.tiers, state.unrankedItemIds, itemId);
        const fromIndex = findItemIndex(state.tiers, state.unrankedItemIds, itemId, fromTierId);

        // 2. Same container, same index → no-op
        if (fromTierId === toTierId) {
          const container =
            fromTierId === null
              ? state.unrankedItemIds
              : state.tiers.find((t) => t.id === fromTierId)!.itemIds;
          if (container.indexOf(itemId) === toIndex) return state;
        }

        // 3. Apply move
        const afterRemove = removeItem(state.tiers, state.unrankedItemIds, itemId, fromTierId);
        const afterInsert = insertItem(afterRemove.tiers, afterRemove.unrankedItemIds, itemId, toTierId, toIndex);
        assertNoItemLoss(afterInsert.tiers, afterInsert.unrankedItemIds, state.items);

        // 4. Actual index after clamping (for accurate forward replay)
        const actualToIndex = findItemIndex(afterInsert.tiers, afterInsert.unrankedItemIds, itemId, toTierId);

        // 5. Build undo entry (only for local operations)
        let undoStack = state.undoStack;
        let redoStack = state.redoStack;

        if (source === "local") {
          const entry: UndoEntry = {
            inverse: { type: "MOVE_ITEM", itemId, toTierId: fromTierId, toIndex: fromIndex },
            forward: { type: "MOVE_ITEM", itemId, toTierId, toIndex: actualToIndex },
            timestamp: Date.now(),
          };
          undoStack = [...state.undoStack, entry].slice(-MAX_UNDO_STACK);
          redoStack = []; // any new local action clears the redo stack
        }

        return {
          tiers: afterInsert.tiers,
          unrankedItemIds: afterInsert.unrankedItemIds,
          undoStack,
          redoStack,
        };
      });
    },

    renameTier: (tierId, newLabel, source = "local") => {
      set((state) => {
        const tier = state.tiers.find((t: Tier) => t.id === tierId);
        if (!tier) return state;
        if (tier.label === newLabel) return state;

        const oldLabel = tier.label;

        let undoStack = state.undoStack;
        let redoStack = state.redoStack;

        if (source === "local") {
          const entry: UndoEntry = {
            inverse: { type: "RENAME_TIER", tierId, toLabel: oldLabel },
            forward: { type: "RENAME_TIER", tierId, toLabel: newLabel },
            timestamp: Date.now(),
          };
          undoStack = [...state.undoStack, entry].slice(-MAX_UNDO_STACK);
          redoStack = [];
        }

        return {
          tiers: state.tiers.map((t: Tier) =>
            t.id === tierId ? { ...t, label: newLabel } : t
          ),
          undoStack,
          redoStack,
        };
      });
    },

    initializeFromTemplate: (items: Item[]) => {
      const itemMap: Record<string, Item> = {};
      for (const item of items) {
        itemMap[item.id] = item;
      }
      set((state) => ({
        items: itemMap,
        unrankedItemIds: items.map((i) => i.id),
        tiers: state.tiers.map((tier) => ({ ...tier, itemIds: [] })),
        undoStack: [],
        redoStack: [],
      }));
    },

    reset: () => {
      set({ ...initialState, undoStack: [], redoStack: [] });
    },

    undo: () => {
      set((state) => {
        if (state.undoStack.length === 0) return state;

        const stack = [...state.undoStack];
        const entry = stack.pop()!;

        // Apply the inverse operation
        const patch = applyInverseOp(state, entry.inverse);

        return {
          ...patch,
          undoStack: stack,
          redoStack: [...state.redoStack, entry].slice(-MAX_UNDO_STACK),
        };
      });
    },

    redo: () => {
      set((state) => {
        if (state.redoStack.length === 0) return state;

        const stack = [...state.redoStack];
        const entry = stack.pop()!;

        // Apply the forward operation
        const patch = applyInverseOp(state, entry.forward);

        return {
          ...patch,
          redoStack: stack,
          undoStack: [...state.undoStack, entry].slice(-MAX_UNDO_STACK),
        };
      });
    },
  })
);
