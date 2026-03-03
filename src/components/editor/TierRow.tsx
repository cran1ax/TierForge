"use client";

import { useDroppable } from "@dnd-kit/core";
import {
  SortableContext,
  horizontalListSortingStrategy,
} from "@dnd-kit/sortable";
import type { Tier } from "@/types";
import { useTierListStore } from "@/stores/tierListStore";
import DraggableItem from "./DraggableItem";
import { useState, useCallback } from "react";

interface TierRowProps {
  tier: Tier;
}

export default function TierRow({ tier }: TierRowProps) {
  const items = useTierListStore((s) => s.items);
  const renameTier = useTierListStore((s) => s.renameTier);

  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(tier.label);

  const { setNodeRef, isOver } = useDroppable({
    id: tier.id,
    data: { type: "tier", tierId: tier.id },
  });

  const handleLabelDoubleClick = useCallback(() => {
    setEditValue(tier.label);
    setIsEditing(true);
  }, [tier.label]);

  const commitRename = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== tier.label) {
      renameTier(tier.id, trimmed);
    }
    setIsEditing(false);
  }, [editValue, tier.id, tier.label, renameTier]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") commitRename();
      if (e.key === "Escape") setIsEditing(false);
    },
    [commitRename]
  );

  return (
    <div
      className={`flex min-h-[72px] rounded-lg border transition-colors ${
        isOver
          ? "border-indigo-400 bg-indigo-950/30"
          : "border-gray-700 bg-gray-900/50"
      }`}
    >
      {/* Tier label */}
      <div
        className={`flex w-20 shrink-0 items-center justify-center rounded-l-lg font-bold text-white text-lg ${tier.color}`}
        onDoubleClick={handleLabelDoubleClick}
        title="Double-click to rename"
      >
        {isEditing ? (
          <input
            className="w-14 bg-transparent text-center text-white font-bold outline-none border-b-2 border-white/60"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={handleKeyDown}
            maxLength={4}
            autoFocus
            aria-label={`Rename tier ${tier.label}`}
          />
        ) : (
          <span>{tier.label}</span>
        )}
      </div>

      {/* Droppable items area */}
      <div
        ref={setNodeRef}
        className="flex flex-1 flex-wrap items-center gap-2 p-2"
      >
        <SortableContext
          items={tier.itemIds}
          strategy={horizontalListSortingStrategy}
        >
          {tier.itemIds.map((itemId) => {
            const item = items[itemId];
            if (!item) return null;
            return <DraggableItem key={itemId} item={item} />;
          })}
        </SortableContext>

        {/* Empty state */}
        {tier.itemIds.length === 0 && (
          <span className="text-sm text-gray-500 italic px-2">
            Drop items here
          </span>
        )}
      </div>
    </div>
  );
}
