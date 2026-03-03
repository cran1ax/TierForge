"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useTierListStore } from "@/stores/tierListStore";
import DraggableItem from "./DraggableItem";

export default function ItemPool() {
  const items = useTierListStore((s) => s.items);
  const unrankedItemIds = useTierListStore((s) => s.unrankedItemIds);

  const { setNodeRef, isOver } = useDroppable({
    id: "unranked-pool",
    data: { type: "pool" },
  });

  return (
    <div
      className={`rounded-lg border-2 border-dashed p-4 transition-colors ${
        isOver
          ? "border-indigo-400 bg-indigo-950/20"
          : "border-gray-600 bg-gray-900/30"
      }`}
    >
      <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-gray-400">
        Unranked Items
      </h2>
      <div
        ref={setNodeRef}
        className="flex min-h-[48px] flex-wrap items-center gap-2"
      >
        <SortableContext
          items={unrankedItemIds}
          strategy={horizontalListSortingStrategy}
        >
          {unrankedItemIds.map((itemId) => {
            const item = items[itemId];
            if (!item) return null;
            return <DraggableItem key={itemId} item={item} />;
          })}
        </SortableContext>

        {unrankedItemIds.length === 0 && (
          <span className="text-sm text-gray-500 italic">
            All items have been ranked! 🎉
          </span>
        )}
      </div>
    </div>
  );
}
