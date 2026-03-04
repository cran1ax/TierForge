"use client";

import { useCallback, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCorners,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
  type DragOverEvent,
  type CollisionDetection,
  pointerWithin,
  rectIntersection,
  getFirstCollision,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  sortableKeyboardCoordinates,
  arrayMove,
} from "@dnd-kit/sortable";
import { useTierListStore } from "@/stores/tierListStore";
import type { Item } from "@/types";
import { useUndoRedoKeyboard } from "@/hooks/useUndoRedoKeyboard";
import { useAutosave, readDraft, clearDraft, type DraftSnapshot } from "@/hooks/useAutosave";
import TierRow from "./TierRow";
import ItemPool from "./ItemPool";
import EditorToolbar from "./EditorToolbar";
import DraggableItem from "./DraggableItem";
import RecoveryBanner from "./RecoveryBanner";
import LiveAnnouncer, { useLiveAnnouncer } from "./LiveAnnouncer";

// ── Stable container IDs ──────────────────────
const POOL_ID = "unranked-pool";

// ── Props ──────────────────────────────────────

interface TierListEditorProps {
  /**
   * The persisted tier list UUID.
   * Pass `null` for demo / offline mode (disables autosave).
   */
  listId?: string | null;
  /**
   * ISO timestamp of when the server last saved this list.
   * Used to decide if a localStorage draft is newer.
   * Not required in demo mode.
   */
  serverSavedAt?: string | null;
}

export default function TierListEditor({
  listId = null,
  serverSavedAt = null,
}: TierListEditorProps) {
  const tiers = useTierListStore((s) => s.tiers);
  const title = useTierListStore((s) => s.title);
  const items = useTierListStore((s) => s.items);
  const moveItem = useTierListStore((s) => s.moveItem);

  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const { message, announce } = useLiveAnnouncer();

  // ── Autosave (only when we have a real listId) ──
  useAutosave(listId ?? null);

  // ── Crash recovery ──────────────────────────
  // Use lazy initializer to avoid setState-in-effect warnings with React 19 compiler.
  const [pendingDraft, setPendingDraft] = useState<DraftSnapshot | null>(() => {
    if (!listId) return null;
    const draft = readDraft(listId);
    if (!draft) return null;

    // If we know the server timestamp, only offer recovery if the draft is newer
    if (serverSavedAt) {
      const draftTime = new Date(draft.savedAt).getTime();
      const serverTime = new Date(serverSavedAt).getTime();
      if (draftTime <= serverTime) {
        // Draft is stale — clean it up silently
        clearDraft(listId);
        return null;
      }
    }

    return draft;
  });

  const handleRestoreDraft = useCallback(() => {
    if (!pendingDraft) return;

    // Apply each tier's items into the store by using moveItem
    // But it's simpler and safer to set the state directly via
    // a "remote" batch — the store.set is internal, so we'll
    // use the Zustand setState escape hatch instead.
    useTierListStore.setState({
      tiers: pendingDraft.tiers,
      unrankedItemIds: pendingDraft.unrankedItemIds,
      undoStack: [],
      redoStack: [],
    });

    setPendingDraft(null);
    if (listId) clearDraft(listId);
  }, [pendingDraft, listId]);

  const handleDiscardDraft = useCallback(() => {
    setPendingDraft(null);
    if (listId) clearDraft(listId);
  }, [listId]);

  // Global Ctrl+Z / Ctrl+Shift+Z keyboard listener
  useUndoRedoKeyboard();

  // Track the last valid over-container to stabilize collision during fast moves
  const lastOverId = useRef<UniqueIdentifier | null>(null);
  const recentlyMovedToNewContainer = useRef(false);

  // ── Sensors ──────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // ── Helpers ──────────────────────────────────

  /** All container IDs (tier IDs + pool) */
  const containerIds = useCallback((): string[] => {
    return [...tiers.map((t) => t.id), POOL_ID];
  }, [tiers]);

  /** Get the ordered item IDs for a container */
  const getContainerItems = useCallback(
    (containerId: string | null): string[] => {
      if (containerId === null || containerId === POOL_ID) {
        return useTierListStore.getState().unrankedItemIds;
      }
      const tier = useTierListStore.getState().tiers.find((t) => t.id === containerId);
      return tier?.itemIds ?? [];
    },
    []
  );

  /** Find which container holds a given itemId */
  const findContainer = useCallback(
    (id: string): string | null => {
      // Is it a container itself?
      if (containerIds().includes(id)) return id;

      // Search tiers
      const state = useTierListStore.getState();
      for (const tier of state.tiers) {
        if (tier.itemIds.includes(id)) return tier.id;
      }
      if (state.unrankedItemIds.includes(id)) return POOL_ID;
      return null;
    },
    [containerIds]
  );

  // ── Custom collision detection ───────────────
  // Uses pointerWithin for containers + closestCorners for items.
  // Falls back to rectIntersection. Stabilizes with lastOverId
  // so the dragged item doesn't flicker between containers.

  const collisionDetection: CollisionDetection = useCallback(
    (args) => {
      // If we just moved to a new container, keep the lastOverId stable
      if (recentlyMovedToNewContainer.current && lastOverId.current) {
        return [{ id: lastOverId.current }];
      }

      // First: try pointer-within (best for dropping into containers)
      const pointerCollisions = pointerWithin(args);
      const collisions = pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);

      let overId = getFirstCollision(collisions, "id");

      if (overId != null) {
        // If hovering over a container, prefer its sortable children
        if (containerIds().includes(overId as string)) {
          const containerItems = getContainerItems(overId as string);
          if (containerItems.length > 0) {
            const closestInContainer = closestCorners({
              ...args,
              droppableContainers: args.droppableContainers.filter(
                (c) => c.id !== overId && containerItems.includes(c.id as string)
              ),
            });
            const closestId = getFirstCollision(closestInContainer, "id");
            if (closestId) {
              overId = closestId;
            }
          }
        }
        lastOverId.current = overId;
        return [{ id: overId }];
      }

      return [];
    },
    [containerIds, getContainerItems]
  );

  // ── Drag handlers ────────────────────────────

  const handleDragStart = useCallback(
    (event: DragStartEvent) => {
      const item = items[event.active.id as string];
      if (item) {
        setActiveItem(item);
        announce(`Picked up ${item.label}`);
      }
    },
    [items, announce]
  );

  const handleDragOver = useCallback(
    (event: DragOverEvent) => {
      const { active, over } = event;
      if (!over) return;

      const activeId = active.id as string;
      const overId = over.id as string;

      const activeContainer = findContainer(activeId);
      let overContainer = findContainer(overId);

      // If over a container directly, use that container
      if (containerIds().includes(overId)) {
        overContainer = overId;
      }

      if (!activeContainer || !overContainer || activeContainer === overContainer) {
        return; // Same container — let onDragEnd handle reordering
      }

      // Cross-container move: commit immediately so the UI updates live
      recentlyMovedToNewContainer.current = true;

      const overItems = getContainerItems(overContainer);
      const overIndex = overItems.indexOf(overId);

      // Determine insert index
      let newIndex: number;
      if (containerIds().includes(overId)) {
        // Dropped on the container itself — append
        newIndex = overItems.length;
      } else {
        // Dropped on an item — figure out before/after
        const isBelowOverItem =
          over &&
          active.rect.current.translated &&
          active.rect.current.translated.top > over.rect.top + over.rect.height / 2;

        const modifier = isBelowOverItem ? 1 : 0;
        newIndex = overIndex >= 0 ? overIndex + modifier : overItems.length;
      }

      // Normalize container to tierId | null
      const toTierId = overContainer === POOL_ID ? null : overContainer;
      moveItem(activeId, toTierId, newIndex);
    },
    [findContainer, containerIds, getContainerItems, moveItem]
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveItem(null);
      recentlyMovedToNewContainer.current = false;

      if (!over) {
        announce("Dropped outside — cancelled");
        return;
      }

      const activeId = active.id as string;
      const overId = over.id as string;

      const activeContainer = findContainer(activeId);
      const overContainer = findContainer(overId);

      if (!activeContainer || !overContainer) return;

      if (activeContainer === overContainer) {
        // Same-container reorder
        const containerItems = getContainerItems(activeContainer);
        const oldIndex = containerItems.indexOf(activeId);
        const newIndex = containerItems.indexOf(overId);

        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          const reordered = arrayMove(containerItems, oldIndex, newIndex);
          const toTierId = activeContainer === POOL_ID ? null : activeContainer;

          // Apply by moving to the new index
          // We need the target index after removal, so use the reordered array position
          const targetIndex = reordered.indexOf(activeId);
          moveItem(activeId, toTierId, targetIndex);
        }
      }
      // Cross-container was already handled in onDragOver

      const item = items[activeId];
      const finalContainer = findContainer(activeId);
      const targetLabel =
        finalContainer === POOL_ID || finalContainer === null
          ? "Unranked"
          : tiers.find((t) => t.id === finalContainer)?.label ?? "tier";
      announce(`Dropped ${item?.label ?? "item"} in ${targetLabel}`);
    },
    [findContainer, getContainerItems, moveItem, items, tiers, announce]
  );

  const handleDragCancel = useCallback(() => {
    setActiveItem(null);
    recentlyMovedToNewContainer.current = false;
    announce("Drag cancelled");
  }, [announce]);

  // ── Render ───────────────────────────────────

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      {/* Header */}
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-white">{title}</h1>
        <EditorToolbar />
      </div>

      {/* Crash recovery banner */}
      {pendingDraft && (
        <RecoveryBanner
          draft={pendingDraft}
          onRestore={handleRestoreDraft}
          onDiscard={handleDiscardDraft}
        />
      )}

      {/* DnD Context wraps everything */}
      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetection}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
        autoScroll={{
          enabled: true,
          threshold: { x: 0.2, y: 0.2 },
          acceleration: 15,
        }}
      >
        {/* Tier rows */}
        <div className="space-y-2">
          {tiers.map((tier) => (
            <TierRow key={tier.id} tier={tier} />
          ))}
        </div>

        {/* Unranked item pool */}
        <ItemPool />

        {/* Drag overlay — rendered in a portal above everything */}
        <DragOverlay
          dropAnimation={{
            duration: 200,
            easing: "cubic-bezier(0.18, 0.67, 0.6, 1.22)",
          }}
        >
          {activeItem ? (
            <DraggableItem item={activeItem} isOverlay />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Accessibility */}
      <LiveAnnouncer message={message} />
    </div>
  );
}
