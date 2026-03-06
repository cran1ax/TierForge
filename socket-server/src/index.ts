import express from "express";
import http from "node:http";
import { Server, type Socket } from "socket.io";
import cors from "cors";

// ──────────────────────────────────────────────
// TierForge — Real-Time Collaboration Server
// ──────────────────────────────────────────────
//
// Standalone Socket.IO server that handles:
//   • Room management   (join-room / leave)
//   • Operation relay    (MOVE_ITEM / RENAME_TIER broadcast)
//   • Presence tracking  (in-memory map of who's in each room)
//   • Conflict resolution (2-second item locks)
//   • Heartbeat          (keep-alive / latency check)
//
// Run:  npm run dev          (tsx watch — auto-reload)
// Prod: npm run build && npm start
// ──────────────────────────────────────────────

// ── Config ─────────────────────────────────────

const PORT = Number(process.env.PORT) || 3001;

// Support a comma-separated list of allowed origins via CORS_ORIGINS or the
// legacy CORS_ORIGIN single-value env var. Example:
//   CORS_ORIGINS="http://localhost:3000,https://your-app.vercel.app"
const rawOrigins = process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "http://localhost:3000";
const ALLOWED_ORIGINS = rawOrigins
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/** How long an item lock is held (ms) */
const LOCK_DURATION_MS = 2_000;

/** Disconnect a socket if no heartbeat arrives within this window (ms) */
const HEARTBEAT_TIMEOUT_MS = 30_000;

// ── Types ──────────────────────────────────────

/** Matches the Next.js client's Operation type */
interface MoveItemOperation {
  type: "MOVE_ITEM";
  itemId: string;
  fromTierId: string | null;
  toTierId: string | null;
  toIndex: number;
}

interface RenameTierOperation {
  type: "RENAME_TIER";
  tierId: string;
  oldLabel: string;
  newLabel: string;
}

type Operation = MoveItemOperation | RenameTierOperation;

/** Payload the client sends when joining a room */
interface JoinRoomPayload {
  roomId: string;
  userId: string;
  displayName: string;
}

/** Payload the client sends with an operation */
interface OperationPayload {
  roomId: string;
  userId: string;
  operation: Operation;
}

/** A single participant in a room */
interface Participant {
  socketId: string;
  userId: string;
  displayName: string;
  joinedAt: number;
  lastHeartbeat: number;
}

/** An item-level lock */
interface ItemLock {
  userId: string;
  expiresAt: number;
}

// ── In-memory state ────────────────────────────

/** roomId → Map<socketId, Participant> */
const rooms = new Map<string, Map<string, Participant>>();

/** `${roomId}:${itemId}` → ItemLock */
const itemLocks = new Map<string, ItemLock>();

// ── Helpers ────────────────────────────────────

function getRoomParticipants(roomId: string): Participant[] {
  const room = rooms.get(roomId);
  return room ? Array.from(room.values()) : [];
}

function addParticipant(roomId: string, participant: Participant): void {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, new Map());
  }
  rooms.get(roomId)!.set(participant.socketId, participant);
}

function removeParticipant(roomId: string, socketId: string): void {
  const room = rooms.get(roomId);
  if (!room) return;
  room.delete(socketId);
  // Clean up empty rooms
  if (room.size === 0) {
    rooms.delete(roomId);
  }
}

function lockKey(roomId: string, itemId: string): string {
  return `${roomId}:${itemId}`;
}

/**
 * Try to acquire a lock on an item for a user.
 * Returns `true` if the lock was acquired (or already held by the same user).
 * Returns `false` if the item is locked by someone else.
 */
function tryAcquireLock(
  roomId: string,
  itemId: string,
  userId: string,
): boolean {
  const key = lockKey(roomId, itemId);
  const existing = itemLocks.get(key);
  const now = Date.now();

  if (existing) {
    // Lock expired → overwrite
    if (existing.expiresAt <= now) {
      // fall through
    }
    // Same user → refresh
    else if (existing.userId === userId) {
      // fall through
    }
    // Different user, still active → reject
    else {
      return false;
    }
  }

  itemLocks.set(key, { userId, expiresAt: now + LOCK_DURATION_MS });
  return true;
}

/** Periodically clean up expired locks to prevent memory leaks */
function purgeExpiredLocks(): void {
  const now = Date.now();
  for (const [key, lock] of itemLocks) {
    if (lock.expiresAt <= now) {
      itemLocks.delete(key);
    }
  }
}

// Run lock cleanup every 10 seconds
setInterval(purgeExpiredLocks, 10_000);

// ── Validation ─────────────────────────────────

function isValidOperation(op: unknown): op is Operation {
  if (typeof op !== "object" || op === null) return false;
  const o = op as Record<string, unknown>;

  if (o.type === "MOVE_ITEM") {
    return (
      typeof o.itemId === "string" &&
      (o.fromTierId === null || typeof o.fromTierId === "string") &&
      (o.toTierId === null || typeof o.toTierId === "string") &&
      typeof o.toIndex === "number"
    );
  }

  if (o.type === "RENAME_TIER") {
    return (
      typeof o.tierId === "string" &&
      typeof o.oldLabel === "string" &&
      typeof o.newLabel === "string"
    );
  }

  return false;
}

// ── Express + Socket.IO setup ──────────────────

const app = express();
// Use a function origin validator so we can allow a small set of production
// domains (e.g. your Vercel app) as well as localhost during development.
app.use(
  cors({
    origin: (origin, callback) => {
      // `origin` will be undefined for non-browser requests (curl, server-to-server).
      if (!origin) return callback(null, true);
      if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
      return callback(new Error("CORS origin not allowed"));
    },
    credentials: true,
  }),
);

// Health check endpoint
app.get("/health", (_req, res) => {
  const roomCount = rooms.size;
  const totalParticipants = Array.from(rooms.values()).reduce(
    (sum, r) => sum + r.size,
    0,
  );
  res.json({
    status: "ok",
    uptime: process.uptime(),
    rooms: roomCount,
    participants: totalParticipants,
    activeLocks: itemLocks.size,
  });
});

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,
    methods: ["GET", "POST"],
    credentials: true,
  },
  pingInterval: 25_000,
  pingTimeout: 20_000,
});

// ── Socket event handlers ──────────────────────

io.on("connection", (socket: Socket) => {
  console.log(`[connect] ${socket.id}`);

  /** The room this socket is currently in (at most one) */
  let currentRoomId: string | null = null;
  let currentUserId: string | null = null;

  // Heartbeat timeout — disconnect if silent too long
  let heartbeatTimer: ReturnType<typeof setTimeout> | null = null;

  function resetHeartbeatTimer(): void {
    if (heartbeatTimer) clearTimeout(heartbeatTimer);
    heartbeatTimer = setTimeout(() => {
      console.log(`[timeout] ${socket.id} — no heartbeat for ${HEARTBEAT_TIMEOUT_MS}ms`);
      socket.disconnect(true);
    }, HEARTBEAT_TIMEOUT_MS);
  }

  resetHeartbeatTimer();

  // ── join-room ────────────────────────────────

  socket.on("join-room", (payload: unknown, ack?: (res: unknown) => void) => {
    const p = payload as JoinRoomPayload;
    if (!p?.roomId || !p?.userId || !p?.displayName) {
      ack?.({ ok: false, error: "Invalid join-room payload." });
      return;
    }

    // Leave previous room if any
    if (currentRoomId) {
      socket.leave(currentRoomId);
      removeParticipant(currentRoomId, socket.id);
      io.to(currentRoomId).emit("presence", {
        roomId: currentRoomId,
        participants: getRoomParticipants(currentRoomId),
      });
    }

    currentRoomId = p.roomId;
    currentUserId = p.userId;

    const participant: Participant = {
      socketId: socket.id,
      userId: p.userId,
      displayName: p.displayName,
      joinedAt: Date.now(),
      lastHeartbeat: Date.now(),
    };

    socket.join(p.roomId);
    addParticipant(p.roomId, participant);

    const participants = getRoomParticipants(p.roomId);
    console.log(
      `[join-room] ${p.displayName} (${socket.id}) → room ${p.roomId} (${participants.length} online)`,
    );

    // Broadcast updated presence to everyone in the room
    io.to(p.roomId).emit("presence", {
      roomId: p.roomId,
      participants,
    });

    ack?.({ ok: true, participants });
  });

  // ── operation ────────────────────────────────

  socket.on("operation", (payload: unknown, ack?: (res: unknown) => void) => {
    const p = payload as OperationPayload;
    if (!p?.roomId || !p?.userId || !p?.operation) {
      ack?.({ ok: false, error: "Invalid operation payload." });
      return;
    }

    if (!isValidOperation(p.operation)) {
      ack?.({ ok: false, error: "Malformed operation." });
      return;
    }

    // ── Item lock check (MOVE_ITEM only) ──
    if (p.operation.type === "MOVE_ITEM") {
      const acquired = tryAcquireLock(p.roomId, p.operation.itemId, p.userId);
      if (!acquired) {
        ack?.({
          ok: false,
          error: `Item "${p.operation.itemId}" is locked by another user.`,
        });
        return;
      }
    }

    // ── Broadcast to everyone else in the room ──
    socket.to(p.roomId).emit("remote-operation", {
      userId: p.userId,
      operation: p.operation,
      timestamp: Date.now(),
    });

    ack?.({ ok: true });
  });

  // ── heartbeat ────────────────────────────────

  socket.on("heartbeat", (payload: unknown, ack?: (res: unknown) => void) => {
    resetHeartbeatTimer();

    // Update participant's lastHeartbeat
    if (currentRoomId) {
      const room = rooms.get(currentRoomId);
      const participant = room?.get(socket.id);
      if (participant) {
        participant.lastHeartbeat = Date.now();
      }
    }

    ack?.({ ok: true, serverTime: Date.now() });
  });

  // ── disconnect ───────────────────────────────

  socket.on("disconnect", (reason) => {
    console.log(`[disconnect] ${socket.id} — ${reason}`);

    if (heartbeatTimer) clearTimeout(heartbeatTimer);

    if (currentRoomId) {
      removeParticipant(currentRoomId, socket.id);

      // Release any locks held by this user in the room
      if (currentUserId) {
        const prefix = `${currentRoomId}:`;
        for (const [key, lock] of itemLocks) {
          if (key.startsWith(prefix) && lock.userId === currentUserId) {
            itemLocks.delete(key);
          }
        }
      }

      // Broadcast updated presence
      io.to(currentRoomId).emit("presence", {
        roomId: currentRoomId,
        participants: getRoomParticipants(currentRoomId),
      });
    }
  });
});

// ── Start ──────────────────────────────────────

server.listen(PORT, () => {
  console.log(`\n🚀 TierForge Socket Server running on http://localhost:${PORT}`);
  console.log(`   CORS allowed origins: ${ALLOWED_ORIGINS.join(", ")}`);
  console.log(`   Lock duration: ${LOCK_DURATION_MS}ms\n`);
});
