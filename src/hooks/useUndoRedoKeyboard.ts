"use client";

import { useEffect } from "react";
import { useTierListStore } from "@/stores/tierListStore";

/**
 * Global keyboard listener for undo/redo:
 *   Ctrl+Z       → undo
 *   Ctrl+Shift+Z → redo
 *   Ctrl+Y       → redo (Windows convention)
 *
 * Ignores events when an input/textarea/contentEditable is focused
 * so typing isn't accidentally intercepted.
 */
export function useUndoRedoKeyboard() {
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept when user is typing in an input
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }

      const isCtrlOrMeta = e.ctrlKey || e.metaKey;
      if (!isCtrlOrMeta) return;

      if (e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        useTierListStore.getState().undo();
      } else if (
        (e.key === "z" && e.shiftKey) ||
        (e.key === "y" && !e.shiftKey)
      ) {
        e.preventDefault();
        useTierListStore.getState().redo();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);
}
