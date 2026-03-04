"use client";

import { useCallback } from "react";
import type { DraftSnapshot } from "@/hooks/useAutosave";

// ──────────────────────────────────────────────
// TierForge — Crash Recovery Banner
// ──────────────────────────────────────────────

interface RecoveryBannerProps {
  draft: DraftSnapshot;
  onRestore: () => void;
  onDiscard: () => void;
}

function formatTimeAgo(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function RecoveryBanner({
  draft,
  onRestore,
  onDiscard,
}: RecoveryBannerProps) {
  const handleRestore = useCallback(() => onRestore(), [onRestore]);
  const handleDiscard = useCallback(() => onDiscard(), [onDiscard]);

  const itemCount = draft.tiers.reduce((sum, t) => sum + t.itemIds.length, 0);
  const timeAgo = formatTimeAgo(draft.savedAt);

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-700/50
                 bg-amber-950/60 px-4 py-3 text-sm text-amber-200 shadow-lg"
    >
      {/* Icon */}
      <span className="text-lg" aria-hidden="true">
        ⚠️
      </span>

      {/* Message */}
      <p className="flex-1">
        <strong>Unsaved changes found</strong> from {timeAgo} —{" "}
        {itemCount} item{itemCount !== 1 ? "s" : ""} ranked across{" "}
        {draft.tiers.filter((t) => t.itemIds.length > 0).length} tier
        {draft.tiers.filter((t) => t.itemIds.length > 0).length !== 1
          ? "s"
          : ""}
        .
      </p>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          onClick={handleRestore}
          className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white
                     hover:bg-amber-500 transition-colors"
        >
          Restore
        </button>
        <button
          onClick={handleDiscard}
          className="rounded-md border border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-300
                     hover:bg-amber-900/50 transition-colors"
        >
          Discard
        </button>
      </div>
    </div>
  );
}
