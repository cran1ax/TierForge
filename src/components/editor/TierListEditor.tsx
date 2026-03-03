"use client";

import { useCallback, useState } from "react";
import {
  DndContext,
  DragOverlay,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { useTierListStore } from "@/stores/tierListStore";
import type { Item } from "@/types";
import TierRow from "./TierRow";
import ItemPool from "./ItemPool";
import EditorToolbar from "./EditorToolbar";
import DraggableItem from "./DraggableItem";
import LiveAnnouncer, { useLiveAnnouncer } from "./LiveAnnouncer";

export default function TierListEditor() {
  const tiers = useTierListStore((s) => s.tiers);
  const title = useTierListStore((s) => s.title);
  const items = useTierListStore((s) => s.items);
  const moveItem = useTierListStore((s) => s.moveItem);

  const [activeItem, setActiveItem] = useState<Item | null>(null);
  const { message, announce } = useLiveAnnouncer();

  // ── Sensors ──────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // ── Helpers ──────────────────────────────────

  /** Find which container (tierId or null for pool) holds an item */
  const findContainer = useCallback(
    (itemId: string): string | null => {
      for (const tier of tiers) {
        if (tier.itemIds.includes(itemId)) return tier.id;
      }
      return null; // in the unranked pool
    },
    [tiers]
  );

  /** Resolve a droppable/sortable ID to a container ID */
  const resolveContainerId = useCallback(
    (id: string): string | null => {
      // If the id is a tier id itself (dropped on the droppable zone)
      if (tiers.some((t) => t.id === id)) return id;
      // If it's the pool
      if (id === "unranked-pool") return null;
      // Otherwise it's an item id — find its container
      return findContainer(id);
    },
    [tiers, findContainer]
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

  const handleDragOver = useCallback(() => {}, []);

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      setActiveItem(null);

      if (!over) {
        announce("Dropped outside — cancelled");
        return;
      }

      const itemId = active.id as string;
      const fromTierId = findContainer(itemId);
      const overContainerId = resolveContainerId(over.id as string);

      // Figure out the index within the target container
      let toIndex = 0;
      if (overContainerId === null) {
        // Dropping into unranked pool
        const pool = useTierListStore.getState().unrankedItemIds;
        const overIndex = pool.indexOf(over.id as string);
        toIndex = overIndex >= 0 ? overIndex : pool.length;
      } else {
        // Dropping into a tier
        const tier = useTierListStore
          .getState()
          .tiers.find((t) => t.id === overContainerId);
        if (tier) {
          const overIndex = tier.itemIds.indexOf(over.id as string);
          toIndex = overIndex >= 0 ? overIndex : tier.itemIds.length;
        }
      }

      // Only move if something actually changed
      if (fromTierId === overContainerId) {
        // Same container — reorder
        const container =
          overContainerId === null
            ? useTierListStore.getState().unrankedItemIds
            : useTierListStore
                .getState()
                .tiers.find((t) => t.id === overContainerId)?.itemIds ?? [];
        const oldIndex = container.indexOf(itemId);
        if (oldIndex === toIndex) return;
      }

      moveItem(itemId, fromTierId, overContainerId, toIndex);

      const item = items[itemId];
      const targetLabel =
        overContainerId === null
          ? "Unranked"
          : tiers.find((t) => t.id === overContainerId)?.label ?? "tier";
      announce(`Dropped ${item?.label ?? "item"} in ${targetLabel}`);
    },
    [findContainer, resolveContainerId, moveItem, items, tiers, announce]
  );

  const handleDragCancel = useCallback(() => {
    setActiveItem(null);
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

      {/* DnD Context wraps everything */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
        onDragCancel={handleDragCancel}
      >
        {/* Tier rows */}
        <div className="space-y-2">
          {tiers.map((tier) => (
            <TierRow key={tier.id} tier={tier} />
          ))}
        </div>

        {/* Unranked item pool */}
        <ItemPool />

        {/* Drag overlay — renders on top of everything */}
        <DragOverlay dropAnimation={{ duration: 200, easing: "ease" }}>
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
