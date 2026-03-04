// ──────────────────────────────────────────────
// TierForge — Core Type Definitions
// ──────────────────────────────────────────────

/** A single rankable item (e.g. a programming language) */
export interface Item {
  id: string;
  label: string;
  /** Optional image URL — falls back to a colored initial avatar */
  imageUrl?: string;
}

/** A single tier row (S / A / B / C / D etc.) */
export interface Tier {
  id: string;
  label: string;
  /** Tailwind-compatible color class, e.g. "bg-red-500" */
  color: string;
  /** Ordered list of Item IDs placed in this tier */
  itemIds: string[];
}

/** Complete editor state — single source of truth */
export interface TierListState {
  /** The template / tier list title */
  title: string;
  /** Ordered tier rows from best to worst */
  tiers: Tier[];
  /** Item IDs that haven't been ranked yet */
  unrankedItemIds: string[];
  /** Lookup map: itemId → Item  (not part of undo history) */
  items: Record<string, Item>;
}

// ── Operations (for future collab / history) ──

export type OperationType = "MOVE_ITEM" | "RENAME_TIER";

export interface MoveItemOperation {
  type: "MOVE_ITEM";
  itemId: string;
  fromTierId: string | null; // null = unranked pool
  toTierId: string | null;   // null = unranked pool
  toIndex: number;
}

export interface RenameTierOperation {
  type: "RENAME_TIER";
  tierId: string;
  oldLabel: string;
  newLabel: string;
}

export type Operation = MoveItemOperation | RenameTierOperation;

// ── Inverse operations (for undo/redo) ────────
// Each forward operation produces an inverse that can restore prior state
// without snapshotting the entire store.

/** Inverse of a MOVE_ITEM — moves it back to its original container + index */
export interface InverseMoveItem {
  type: "MOVE_ITEM";
  itemId: string;
  /** Where to restore the item (the *original* container) */
  toTierId: string | null;
  /** The index it was at before the move */
  toIndex: number;
}

/** Inverse of a RENAME_TIER — restores the previous label */
export interface InverseRenameTier {
  type: "RENAME_TIER";
  tierId: string;
  /** The label to restore */
  toLabel: string;
}

export type InverseOperation = InverseMoveItem | InverseRenameTier;

/** A single entry on the undo/redo stack */
export interface UndoEntry {
  /** The inverse operation that will reverse this action */
  inverse: InverseOperation;
  /** The forward operation that will re-apply this action (used for redo) */
  forward: InverseOperation;
  /** Timestamp for debugging / future merge-window logic */
  timestamp: number;
}

// ── DnD helper types ─────────────────────────

/** Identifies where a draggable item currently lives */
export interface DragSource {
  tierId: string | null; // null = unranked pool
  index: number;
}

/** Identifies a drop target */
export interface DropTarget {
  tierId: string | null;
  index: number;
}
