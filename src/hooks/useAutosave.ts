"use client";

import { useEffect, useRef, useCallback, useSyncExternalStore } from "react";
import { useTierListStore } from "@/stores/tierListStore";
import type { Tier } from "@/types";

// ──────────────────────────────────────────────
// TierForge — Autosave & Crash Recovery Hook
// ──────────────────────────────────────────────

// ── Types ──────────────────────────────────────

export type SaveStatus = "idle" | "saved" | "saving" | "error";

/** The shape we persist to localStorage for draft recovery */
export interface DraftSnapshot {
  tiers: Tier[];
  unrankedItemIds: string[];
  /** ISO timestamp of when the draft was saved locally */
  savedAt: string;
}

/** What the PUT API expects */
interface TierDataPayload {
  tierData: {
    tiers: Tier[];
    unrankedItemIds: string[];
  };
}

// ── localStorage helpers ───────────────────────

function getDraftKey(listId: string): string {
  return `draft_${listId}`;
}

export function readDraft(listId: string): DraftSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(getDraftKey(listId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftSnapshot;
    // Minimal shape check
    if (!Array.isArray(parsed.tiers) || !Array.isArray(parsed.unrankedItemIds) || !parsed.savedAt) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeDraft(listId: string, tiers: Tier[], unrankedItemIds: string[]): void {
  try {
    const snapshot: DraftSnapshot = {
      tiers,
      unrankedItemIds,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(getDraftKey(listId), JSON.stringify(snapshot));
  } catch {
    // localStorage might be full or unavailable — fail silently
  }
}

export function clearDraft(listId: string): void {
  try {
    localStorage.removeItem(getDraftKey(listId));
  } catch {
    // ignore
  }
}

// ── Save status store (external store pattern) ─
// Using a module-level store so multiple components can subscribe
// to the save status without prop drilling.

let _saveStatus: SaveStatus = "idle";
const _listeners = new Set<() => void>();

function setSaveStatus(status: SaveStatus): void {
  _saveStatus = status;
  _listeners.forEach((l) => l());
}

function subscribeSaveStatus(listener: () => void): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}

function getSaveStatusSnapshot(): SaveStatus {
  return _saveStatus;
}

/** Read the current save status from any component */
export function useSaveStatus(): SaveStatus {
  return useSyncExternalStore(subscribeSaveStatus, getSaveStatusSnapshot, () => "idle" as const);
}

// ── The hook ───────────────────────────────────

/**
 * Subscribes to the tier list store. On any change to `tiers` or
 * `unrankedItemIds`:
 *
 * 1. **Immediately** writes to localStorage (crash recovery).
 * 2. **Debounces** a PUT request by `DEBOUNCE_MS` (server save).
 *
 * Call this once from `TierListEditor`.
 */
export function useAutosave(listId: string | null): void {
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortController = useRef<AbortController | null>(null);
  const isMounted = useRef(true);

  // Stable save function
  const saveToDB = useCallback(
    async (tiers: Tier[], unrankedItemIds: string[], id: string) => {
      // Cancel any in-flight request
      abortController.current?.abort();
      abortController.current = new AbortController();

      setSaveStatus("saving");

      try {
        const payload: TierDataPayload = {
          tierData: { tiers, unrankedItemIds },
        };

        const res = await fetch(`/api/lists/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: abortController.current.signal,
        });

        if (!isMounted.current) return;

        if (res.ok) {
          setSaveStatus("saved");
          // Draft is now persisted — clear local backup
          clearDraft(id);
        } else {
          console.error(`[Autosave] PUT failed: ${res.status}`);
          setSaveStatus("error");
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          return; // expected — a newer save replaced this one
        }
        if (!isMounted.current) return;
        console.error("[Autosave] Network error:", err);
        setSaveStatus("error");
      }
    },
    [],
  );

  useEffect(() => {
    isMounted.current = true;

    if (!listId) return;

    const DEBOUNCE_MS = 2000;

    // Subscribe to tiers + unrankedItemIds changes
    const unsub = useTierListStore.subscribe(
      (state, prevState) => {
        const tiersChanged = state.tiers !== prevState.tiers;
        const unrankedChanged = state.unrankedItemIds !== prevState.unrankedItemIds;

        if (!tiersChanged && !unrankedChanged) return;

        // 1. Immediately persist to localStorage
        writeDraft(listId, state.tiers, state.unrankedItemIds);

        // 2. Debounce the server save
        if (debounceTimer.current) {
          clearTimeout(debounceTimer.current);
        }
        debounceTimer.current = setTimeout(() => {
          saveToDB(state.tiers, state.unrankedItemIds, listId);
        }, DEBOUNCE_MS);
      },
    );

    return () => {
      isMounted.current = false;
      unsub();
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      abortController.current?.abort();
    };
  }, [listId, saveToDB]);
}
