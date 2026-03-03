"use client";

import { useStore } from "zustand";
import { useTierListStore } from "@/stores/tierListStore";

export default function EditorToolbar() {
  const reset = useTierListStore((s) => s.reset);

  // zundo v2: temporal store is on useTierListStore.temporal
  const temporalStore = useTierListStore.temporal;
  const undo = useStore(temporalStore, (s) => s.undo);
  const redo = useStore(temporalStore, (s) => s.redo);
  const pastStates = useStore(temporalStore, (s) => s.pastStates);
  const futureStates = useStore(temporalStore, (s) => s.futureStates);

  const canUndo = pastStates.length > 0;
  const canRedo = futureStates.length > 0;

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => undo()}
        disabled={!canUndo}
        className="rounded-md border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-200
                   hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors"
        aria-label="Undo"
        title={`Undo (${pastStates.length} steps)`}
      >
        ↩ Undo
      </button>
      <button
        onClick={() => redo()}
        disabled={!canRedo}
        className="rounded-md border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-200
                   hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors"
        aria-label="Redo"
        title={`Redo (${futureStates.length} steps)`}
      >
        Redo ↪
      </button>

      <div className="mx-2 h-6 w-px bg-gray-700" aria-hidden="true" />

      <button
        onClick={reset}
        className="rounded-md border border-red-800 bg-red-950 px-3 py-1.5 text-sm font-medium text-red-300
                   hover:bg-red-900 transition-colors"
        aria-label="Reset all items to unranked"
        title="Reset tier list"
      >
        ✕ Reset
      </button>

      {/* Step counter */}
      <span className="ml-auto text-xs text-gray-500">
        {pastStates.length} undo · {futureStates.length} redo
      </span>
    </div>
  );
}
