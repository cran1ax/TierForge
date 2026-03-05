import { io, type Socket } from "socket.io-client";

// ──────────────────────────────────────────────
// TierForge — Socket.IO Client Singleton
// ──────────────────────────────────────────────
//
// Lazy singleton so the socket is only created once regardless
// of how many components import this module.  The connection is
// NOT opened until `connect()` is called explicitly.
// ──────────────────────────────────────────────

const SOCKET_URL =
  process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001";

// ── Shared event types (mirrored from socket-server) ──

export interface Participant {
  socketId: string;
  userId: string;
  displayName: string;
  joinedAt: number;
  lastHeartbeat: number;
}

export interface MoveItemOp {
  type: "MOVE_ITEM";
  itemId: string;
  fromTierId: string | null;
  toTierId: string | null;
  toIndex: number;
}

export interface RenameTierOp {
  type: "RENAME_TIER";
  tierId: string;
  oldLabel: string;
  newLabel: string;
}

export type SocketOperation = MoveItemOp | RenameTierOp;

export interface JoinRoomPayload {
  roomId: string;
  userId: string;
  displayName: string;
}

export interface OperationPayload {
  roomId: string;
  userId: string;
  operation: SocketOperation;
}

export interface RemoteOperationEvent {
  userId: string;
  operation: SocketOperation;
  timestamp: number;
}

export interface PresenceEvent {
  roomId: string;
  participants: Participant[];
}

export type AckResponse =
  | { ok: true; participants?: Participant[]; serverTime?: number }
  | { ok: false; error: string };

// ── Singleton ──────────────────────────────────

let _socket: Socket | null = null;

export function getSocket(): Socket {
  if (!_socket) {
    _socket = io(SOCKET_URL, {
      autoConnect: false,       // manual connect via CollabProvider
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1_000,
      reconnectionDelayMax: 10_000,
      timeout: 10_000,
    });
  }
  return _socket;
}
