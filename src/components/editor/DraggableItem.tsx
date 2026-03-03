"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { motion } from "framer-motion";
import type { Item } from "@/types";

interface DraggableItemProps {
  item: Item;
  /** Is this item currently being dragged? (overlay uses this) */
  isOverlay?: boolean;
}

/** Get a deterministic background color from the item label */
function getAvatarColor(label: string): string {
  const colors = [
    "bg-violet-600",
    "bg-pink-600",
    "bg-sky-600",
    "bg-emerald-600",
    "bg-amber-600",
    "bg-rose-600",
    "bg-teal-600",
    "bg-indigo-600",
  ];
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = label.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash) % colors.length];
}

export default function DraggableItem({ item, isOverlay = false }: DraggableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: item.id,
    data: { type: "item", item },
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <motion.div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      layout={!isOverlay}
      layoutId={isOverlay ? undefined : item.id}
      className={`
        flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium
        select-none cursor-grab active:cursor-grabbing
        transition-shadow
        ${isDragging && !isOverlay ? "opacity-30" : "opacity-100"}
        ${
          isOverlay
            ? "shadow-xl ring-2 ring-indigo-400 scale-105 bg-gray-900 border-gray-600 text-white"
            : "bg-gray-800 border-gray-700 text-gray-100 hover:border-gray-500 hover:shadow-md"
        }
      `}
      role="button"
      aria-roledescription="draggable item"
      aria-label={item.label}
      tabIndex={0}
    >
      {/* Avatar circle */}
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${getAvatarColor(item.label)}`}
      >
        {item.label.charAt(0).toUpperCase()}
      </span>
      <span className="truncate">{item.label}</span>
    </motion.div>
  );
}
