"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import { useTierListStore } from "@/stores/tierListStore";
import DraggableItem from "./DraggableItem";

const POOL_ID = "unranked-pool";

export default function ItemPool() {
  const items = useTierListStore((s) => s.items);
  const unrankedItemIds = useTierListStore((s) => s.unrankedItemIds);

  const { setNodeRef, isOver } = useDroppable({
    id: POOL_ID,
    data: { type: "pool" },
  });

  return (
    <div
      className={[
        "rounded-lg border-2 border-dashed p-4 transition-all duration-200",
        isOver
          ? "border-indigo-400 bg-indigo-950/20 shadow-lg shadow-indigo-500/10"
          : "border-gray-600 bg-gray-900/30",
      ].join(" ")}
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
          <div
            className={[
              "flex h-10 w-full items-center justify-center rounded-md border-2 border-dashed transition-all duration-200",
              isOver
                ? "border-indigo-400 bg-indigo-900/20 text-indigo-300"
                : "border-gray-700 text-gray-500",
            ].join(" ")}
          >
            <span className="text-sm italic">
              {isOver ? "Drop here" : "All items have been ranked! 🎉"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
