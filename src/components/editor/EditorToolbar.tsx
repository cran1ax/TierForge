"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTierListStore } from "@/stores/tierListStore";
import { useSaveStatus } from "@/hooks/useAutosave";
import type { SaveStatus } from "@/hooks/useAutosave";
import { useCollab, type ConnectionStatus } from "@/components/collab/CollabProvider";

// ── Save status display config ─────────────────

const STATUS_CONFIG: Record<SaveStatus, { label: string; color: string; icon: string }> = {
  idle:   { label: "",            color: "text-gray-500",   icon: "" },
  saved:  { label: "Saved",      color: "text-emerald-400", icon: "✓" },
  saving: { label: "Saving…",   color: "text-amber-400",   icon: "↻" },
  error:  { label: "Save failed", color: "text-red-400",    icon: "✗" },
};

const CONNECTION_CONFIG: Record<ConnectionStatus, { label: string; dotColor: string }> = {
  disconnected: { label: "Offline",      dotColor: "bg-gray-500" },
  connecting:   { label: "Connecting…", dotColor: "bg-amber-400 animate-pulse" },
  connected:    { label: "Live",         dotColor: "bg-emerald-400" },
};

interface EditorToolbarProps {
  roomId?: string | null;
}

function generateRoomCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

export default function EditorToolbar({ roomId = null }: EditorToolbarProps) {
  const router = useRouter();
  const reset = useTierListStore((s) => s.reset);
  const undo = useTierListStore((s) => s.undo);
  const redo = useTierListStore((s) => s.redo);
  const undoCount = useTierListStore((s) => s.undoStack.length);
  const redoCount = useTierListStore((s) => s.redoStack.length);
  const saveStatus = useSaveStatus();
  const { connectionStatus, participants } = useCollab();
  const [copied, setCopied] = useState(false);

  const canUndo = undoCount > 0;
  const canRedo = redoCount > 0;
  const { label, color, icon } = STATUS_CONFIG[saveStatus];
  const conn = CONNECTION_CONFIG[connectionStatus];
  const isCollabActive = connectionStatus !== "disconnected";
  const isInRoom = Boolean(roomId);

  function handleCollaborate() {
    const code = generateRoomCode();
    router.push(`/room/${code}`);
  }

  function handleCopyInvite() {
    const url = window.location.href;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="flex items-center gap-3">
      <button
        onClick={() => undo()}
        disabled={!canUndo}
        className="rounded-md border border-gray-600 bg-gray-800 px-3 py-1.5 text-sm font-medium text-gray-200
                   hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed
                   transition-colors"
        aria-label="Undo"
        title={`Undo (${undoCount} steps)`}
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
        title={`Redo (${redoCount} steps)`}
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

      <div className="mx-2 h-6 w-px bg-gray-700" aria-hidden="true" />

      {/* Collaborate — only in solo mode (no room yet) */}
      {!isInRoom && (
        <button
          onClick={handleCollaborate}
          className="rounded-md border border-indigo-600 bg-indigo-950 px-3 py-1.5 text-sm font-medium text-indigo-300
                     hover:bg-indigo-900 transition-colors"
          title="Start a live collaboration session"
        >
          🔗 Collaborate
        </button>
      )}

      {/* Copy Invite Link — only when inside a room */}
      {isInRoom && (
        <button
          onClick={handleCopyInvite}
          className="rounded-md border border-indigo-600 bg-indigo-950 px-3 py-1.5 text-sm font-medium text-indigo-300
                     hover:bg-indigo-900 transition-colors"
          title="Copy the room link to share with friends"
        >
          {copied ? "✓ Copied!" : "📋 Copy Invite Link"}
        </button>
      )}

      {/* Step counter + Save status + Collab status */}
      <span className="ml-auto flex items-center gap-3 text-xs text-gray-500">
        <span>{undoCount} undo · {redoCount} redo</span>
        {saveStatus !== "idle" && (
          <span className={`flex items-center gap-1 ${color}`} aria-live="polite">
            <span className={saveStatus === "saving" ? "animate-spin inline-block" : ""}>{icon}</span>
            {label}
          </span>
        )}
        {isCollabActive && (
          <>
            <span className="h-3 w-px bg-gray-700" aria-hidden="true" />
            <span className="flex items-center gap-1.5" title={`${conn.label} — ${participants.length} online`}>
              <span className={`inline-block h-2 w-2 rounded-full ${conn.dotColor}`} />
              <span className="text-gray-400">
                {participants.length} online
              </span>
            </span>
          </>
        )}
      </span>
    </div>
  );
}
