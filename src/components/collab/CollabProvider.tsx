"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  getSocket,
  type AckResponse,
  type OperationPayload,
  type Participant,
  type PresenceEvent,
  type RemoteOperationEvent,
  type SocketOperation,
} from "@/lib/socket";
import { useTierListStore } from "@/stores/tierListStore";

// ──────────────────────────────────────────────
// TierForge — Collaboration Provider
// ──────────────────────────────────────────────

// ── Context shape ──────────────────────────────

export type ConnectionStatus = "disconnected" | "connecting" | "connected";

interface CollabContextValue {
  /** Current Socket.IO connection status */
  connectionStatus: ConnectionStatus;
  /** Participants currently in the room (including self) */
  participants: Participant[];
  /** The most recent rejection message (auto-clears after 3s) */
  rejectionToast: string | null;
}

const CollabContext = createContext<CollabContextValue>({
  connectionStatus: "disconnected",
  participants: [],
  rejectionToast: null,
});

export function useCollab(): CollabContextValue {
  return useContext(CollabContext);
}

// ── Props ──────────────────────────────────────

interface CollabProviderProps {
  /** Room to join (e.g. tier list ID or a shared room code) */
  roomId: string;
  /** Current user ID (mocked for now) */
  userId: string;
  /** Display name shown to other participants */
  displayName: string;
  children: ReactNode;
}

// ── Constants ──────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 15_000;
const TOAST_DURATION_MS = 3_000;

// ── Provider ───────────────────────────────────

export default function CollabProvider({
  roomId,
  userId,
  displayName,
  children,
}: CollabProviderProps) {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("disconnected");
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [rejectionToast, setRejectionToast] = useState<string | null>(null);

  // Refs for values needed inside callbacks without causing re-subscriptions
  const roomIdRef = useRef(roomId);
  const userIdRef = useRef(userId);
  roomIdRef.current = roomId;
  userIdRef.current = userId;

  // ── Flag to suppress emitting remote ops back to the server ──
  // When we receive a remote-operation and apply it to the store,
  // the store subscription would fire. We use this flag to skip it.
  const isApplyingRemote = useRef(false);

  // ── Toast auto-clear ──
  const showToast = useCallback((message: string) => {
    setRejectionToast(message);
    setTimeout(() => setRejectionToast(null), TOAST_DURATION_MS);
  }, []);

  // ── Main effect: connect, join, subscribe ────

  useEffect(() => {
    // Skip socket connection entirely in solo/demo mode
    if (!roomId) return;

    const socket = getSocket();
    const store = useTierListStore;

    // -- Connection lifecycle ---

    function onConnect() {
      setConnectionStatus("connected");
      // Join/rejoin the room
      socket.emit(
        "join-room",
        { roomId: roomIdRef.current, userId: userIdRef.current, displayName } as const,
        (res: AckResponse) => {
          if (res.ok && res.participants) {
            setParticipants(res.participants);
          }
        },
      );
    }

    function onDisconnect() {
      setConnectionStatus("disconnected");
    }

    function onConnectError() {
      setConnectionStatus("disconnected");
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("connect_error", onConnectError);

    // -- Presence updates ---

    function onPresence(event: PresenceEvent) {
      if (event.roomId === roomIdRef.current) {
        setParticipants(event.participants);
      }
    }
    socket.on("presence", onPresence);

    // -- Remote operations ---

    function onRemoteOperation(event: RemoteOperationEvent) {
      const { operation } = event;
      isApplyingRemote.current = true;

      try {
        switch (operation.type) {
          case "MOVE_ITEM":
            store.getState().moveItem(
              operation.itemId,
              operation.toTierId,
              operation.toIndex,
              "remote",
            );
            break;
          case "RENAME_TIER":
            store.getState().renameTier(
              operation.tierId,
              operation.newLabel,
              "remote",
            );
            break;
        }
      } finally {
        // Use microtask to ensure the flag outlives the synchronous
        // store update + any subscriber firing in the same tick.
        queueMicrotask(() => {
          isApplyingRemote.current = false;
        });
      }
    }
    socket.on("remote-operation", onRemoteOperation);

    // -- Local operation detection ---
    // We subscribe to the store and detect local ops by watching
    // the undoStack grow. Remote ops never push to the undoStack
    // (they pass source="remote"), so only local ops trigger this.

    let prevUndoLength = store.getState().undoStack.length;

    const unsubStore = store.subscribe((state) => {
      // Skip if we're applying a remote operation
      if (isApplyingRemote.current) return;

      const undoGrew = state.undoStack.length > prevUndoLength;
      prevUndoLength = state.undoStack.length;

      if (!undoGrew) return;

      // The newest undo entry contains the forward operation
      const latest = state.undoStack[state.undoStack.length - 1];
      if (!latest) return;

      // Build the Operation payload from the undo entry's forward op
      let operation: SocketOperation | null = null;

      if (latest.forward.type === "MOVE_ITEM") {
        // For the server we need fromTierId too — we can reconstruct it
        // from the inverse (the inverse.toTierId IS the original fromTierId)
        const inv = latest.inverse;
        if (inv.type === "MOVE_ITEM") {
          operation = {
            type: "MOVE_ITEM",
            itemId: latest.forward.itemId,
            fromTierId: inv.toTierId,      // where it was before
            toTierId: latest.forward.toTierId,
            toIndex: latest.forward.toIndex,
          };
        }
      } else if (latest.forward.type === "RENAME_TIER") {
        const inv = latest.inverse;
        if (inv.type === "RENAME_TIER") {
          operation = {
            type: "RENAME_TIER",
            tierId: latest.forward.tierId,
            oldLabel: inv.toLabel,           // what it was before
            newLabel: latest.forward.toLabel,
          };
        }
      }

      if (!operation) return;

      const payload: OperationPayload = {
        roomId: roomIdRef.current,
        userId: userIdRef.current,
        operation,
      };

      socket.emit("operation", payload, (res: AckResponse) => {
        if (!res.ok) {
          // --- Rejection: revert the operation via undo ---
          // The operation we just emitted is the top of the undo stack,
          // so calling undo() will reverse it cleanly.
          store.getState().undo();
          showToast(res.error);
        }
      });

      // Track the new length AFTER we've potentially been acked
      prevUndoLength = state.undoStack.length;
    });

    // -- Heartbeat ---

    const heartbeatTimer = setInterval(() => {
      if (socket.connected) {
        socket.emit("heartbeat", {}, () => {});
      }
    }, HEARTBEAT_INTERVAL_MS);

    // -- Connect ---

    setConnectionStatus("connecting");
    socket.connect();

    // -- Cleanup ---

    return () => {
      clearInterval(heartbeatTimer);
      unsubStore();
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("connect_error", onConnectError);
      socket.off("presence", onPresence);
      socket.off("remote-operation", onRemoteOperation);
      socket.disconnect();
      setConnectionStatus("disconnected");
      setParticipants([]);
    };
  }, [roomId, userId, displayName, showToast]);

  // ── Render ───────────────────────────────────

  return (
    <CollabContext.Provider
      value={{ connectionStatus, participants, rejectionToast }}
    >
      {children}

      {/* Rejection toast overlay */}
      {rejectionToast && (
        <div
          role="alert"
          className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-lg border border-red-700/50
                     bg-red-950/90 px-4 py-2.5 text-sm text-red-200 shadow-xl backdrop-blur-sm
                     animate-in fade-in slide-in-from-bottom-4"
        >
          <span className="mr-2">⚠️</span>
          {rejectionToast}
        </div>
      )}
    </CollabContext.Provider>
  );
}
