"use client";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Item } from "@/types";

interface DraggableItemProps {
  item: Item;
  /** Rendered inside DragOverlay — no sortable hooks needed */
  isOverlay?: boolean;
}

/** Deterministic avatar color from item label */
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

/** Static card content shared by sortable + overlay */
function ItemCard({ item, isDragging, isOverlay }: {
  item: Item;
  isDragging: boolean;
  isOverlay: boolean;
}) {
  return (
    <div
      className={[
        "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
        "select-none cursor-grab active:cursor-grabbing",
        "transition-all duration-200",
        isDragging && !isOverlay
          ? "opacity-0 scale-95"                                    // ghost left behind
          : "opacity-100 scale-100",
        isOverlay
          ? "shadow-2xl ring-2 ring-indigo-400 bg-gray-900 border-gray-500 text-white z-50"
          : "bg-gray-800 border-gray-700 text-gray-100 hover:border-gray-500 hover:shadow-md",
      ].join(" ")}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${getAvatarColor(item.label)}`}
      >
        {item.label.charAt(0).toUpperCase()}
      </span>
      <span className="truncate">{item.label}</span>
    </div>
  );
}

export default function DraggableItem({ item, isOverlay = false }: DraggableItemProps) {
  // Overlay items are not sortable — just render the card
  if (isOverlay) {
    return <ItemCard item={item} isDragging={false} isOverlay />;
  }

  return <SortableItem item={item} />;
}

/** Sortable wrapper — only rendered for in-place items (not the overlay) */
function SortableItem({ item }: { item: Item }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
    isSorting,
  } = useSortable({
    id: item.id,
    data: { type: "item", item },
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: isSorting ? transition : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <ItemCard item={item} isDragging={isDragging} isOverlay={false} />
    </div>
  );
}
