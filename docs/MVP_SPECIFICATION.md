# TierForge — Reduced MVP Specification

## Core Technical Demo: Collaborative Tier List Editor

**Version:** 0.1 (Stripped MVP)
**Date:** March 2026
**Scope:** 4 capabilities only — real-time collab, undo/redo, autosave, accessible drag-and-drop

---

## Table of Contents

1. [Scope Definition](#1-scope-definition)
2. [Feature Specification](#2-feature-specification)
3. [Tech Stack](#3-tech-stack)
4. [System Architecture](#4-system-architecture)
5. [Database Schema](#5-database-schema)
6. [Real-Time Synchronization](#6-real-time-synchronization)
7. [Project Structure](#7-project-structure)
8. [Development Roadmap](#8-development-roadmap)

---

## 1. Scope Definition

### What This MVP Proves

| Capability | What Gets Built | What Gets Cut |
|---|---|---|
| **Accessible drag-and-drop** | dnd-kit editor with full keyboard nav, screen reader announcements, focus management | Touch tap-to-assign, mobile-specific layouts, multi-select batch move |
| **Undo/Redo** | Zustand temporal middleware, Ctrl+Z/Y, visible toolbar buttons, 50-op stack | Cross-session history persistence, version history viewer, server-side version snapshots |
| **Autosave + recovery** | Debounced save to DB, localStorage crash recovery, "Saved ✓" indicator | Offline queue, conflict resolution UI, background sync |
| **Real-time collaboration** | Socket.IO rooms, live operation broadcast, presence avatars, first-write-wins conflicts | Cursor chat, spectator mode, emoji reactions during collab, room expiry/cleanup |

### What Is Explicitly Cut

- ❌ Challenge mode, share links, social features
- ❌ Comments, reactions, community rankings
- ❌ Template creation flow (use seeded demo templates)
- ❌ User profiles, settings pages, bio/avatar upload
- ❌ Image upload pipeline (use pre-seeded image URLs)
- ❌ Export (PNG, JSON, clipboard)
- ❌ AI features, analytics, notifications
- ❌ Dark/light theme toggle
- ❌ Monetization, pro tier, payments
- ❌ PWA, offline mode, service workers
- ❌ In-editor search/filter (add in Phase 2)

### User Flow (Single Happy Path)

```
1. User opens app → sees list of 3-5 pre-seeded demo templates
2. Clicks a template → lands in the tier list editor
3. Drags items between tiers (mouse or keyboard)
4. Presses Ctrl+Z to undo, Ctrl+Shift+Z to redo
5. Sees "Saved ✓" indicator after each change
6. Clicks "Collaborate" → gets a room link
7. Shares link → second user joins → both see live edits
8. Closes tab → reopens → tier list state fully recovered
```

---

## 2. Feature Specification

### 2.1 — Tier List Editor

**Drag-and-Drop (dnd-kit)**
- Items draggable between tier rows and an "Unranked" pool at the bottom
- Visual drop indicator (blue line) showing exact insertion point
- Auto-scroll when dragging near top/bottom viewport edges
- Spring animation on drop (Framer Motion, ~200ms)
- Items are pre-seeded: each template has 15-30 items with labels + image URLs

**Keyboard Navigation (WCAG 2.1 AA)**
- `Tab` / `Shift+Tab` to move focus between items
- `Space` or `Enter` to pick up the focused item (enters "move mode")
- `Arrow Up/Down` to move item between tiers while in move mode
- `Arrow Left/Right` to change position within a tier
- `Space` or `Enter` to drop; `Escape` to cancel
- Visible focus ring (2px solid, high contrast) on every focusable element
- ARIA live region announces every move: "Moved [item label] to [tier label], position [n]"
- Tier rows have `role="listbox"`, items have `role="option"`
- Color is never the sole indicator — every tier has a text label rendered alongside its color

**Tier Rows**
- Default 5 tiers: S, A, B, C, D (hardcoded defaults, editable labels)
- Editable labels: click to edit inline (ContentEditable with `onBlur` save)
- Fixed color palette per tier (not customizable in this MVP)
- No add/remove tiers in this MVP — keeps editor logic simple

**Items**
- Each item: `{ id, label, imageUrl }` — all pre-seeded from demo templates
- No user image upload in this MVP
- Image rendered as 64×64 thumbnail with label below
- Alt text on every image (`alt={item.label}`)

### 2.2 — Undo / Redo

**Implementation: Zustand + `zundo` (temporal middleware)**
- Every state-mutating action (move item, rename tier) automatically pushes
  previous state onto the undo stack via `zundo`
- Stack depth: 50 operations (sufficient for demo, low memory)
- `Ctrl+Z` triggers undo; `Ctrl+Shift+Z` triggers redo
- Toolbar buttons: ↩ Undo (disabled when stack empty), ↪ Redo (same)
- Undo/redo buttons also have `aria-label` and keyboard-focusable
- Remote operations from collaborators are **not** undoable by the local user
  (you can only undo your own actions)

**State Shape (what gets tracked)**
```typescript
interface TierListState {
  tiers: {
    id: string;
    label: string;
    color: string;
    itemIds: string[];
  }[];
  unrankedItemIds: string[];
}
```

### 2.3 — Autosave + Recovery

**Autosave Flow**
```
User makes a change
  → Zustand state updates (immediate)
  → localStorage.setItem('draft:{listId}', JSON.stringify(state))  (immediate)
  → Debounce timer resets to 2 seconds
  → After 2s of inactivity: PUT /api/lists/[id] with { tierData }
  → On server ack: UI shows "Saved ✓" (green, fades after 2s)
  → On server error: UI shows "Save failed — retrying..." (orange)
  → Retry with exponential backoff: 2s, 4s, 8s (max 3 retries)
```

**Recovery Flow**
```
User opens a tier list page
  → Client fetches server state via GET /api/lists/[id]
  → Client checks localStorage for 'draft:{listId}'
  → If local draft exists AND local draft.updatedAt > server.updatedAt:
      → Show banner: "You have unsaved changes. [Restore] [Discard]"
      → Restore: load local draft into Zustand store, trigger save
      → Discard: delete local draft, use server state
  → If no local draft or server is newer: use server state
```

**Save Status Indicator**
- Fixed position in editor toolbar (top-right)
- Three states: `Saved ✓` (green) / `Saving...` (gray, spinner) / `Save failed` (orange)
- Purely visual — no modal, no blocking, no interruption

### 2.4 — Real-Time Collaboration

**Room Lifecycle**
```
Owner clicks "Collaborate" on their tier list
  → Client calls POST /api/rooms with { tierListId }
  → Server creates room record, generates 6-char alphanumeric code
  → Client receives { roomCode, wsUrl }
  → Client connects to Socket.IO server with roomCode
  → UI shows: "Share this link: tierforge.app/room/{roomCode}" + copy button
  → Room is active until owner explicitly closes it or all users disconnect for 10 min
```

**Joining**
```
User B opens tierforge.app/room/{roomCode}
  → Server validates room exists and is active
  → Server sends current tier list state + participant list
  → Client B initializes Zustand store with received state
  → Socket.IO joins the room channel
  → All participants receive: "User B joined" presence update
```

**Operation Broadcasting**
- Every local Zustand state change emits a Socket.IO event:
  `socket.emit('operation', { type, payload, userId, clientSeq })`
- Server validates (no conflict), assigns `serverSeq`, broadcasts to room
- Other clients receive and apply the operation with animation
- Server persists final state to Postgres on a 5-second debounce (not per-op)

**Presence**
- Each client sends a heartbeat every 10 seconds: `{ userId, displayName }`
- Server tracks presence in-memory (Map, not Redis — single server for MVP)
- UI shows avatar circles (initials) in the toolbar for each connected user
- On disconnect: avatar removed after 15 seconds of no heartbeat

**Conflict Resolution (simplified for MVP)**
```typescript
// Server-side: in-memory lock per item
const itemLocks = new Map<string, { userId: string; expiresAt: number }>();

function handleMoveItem(roomId: string, op: MoveItemOp, userId: string): 'accept' | 'reject' {
  const lock = itemLocks.get(op.itemId);
  const now = Date.now();

  if (lock && lock.userId !== userId && lock.expiresAt > now) {
    return 'reject'; // Another user is moving this item
  }

  // Grant lock for 2 seconds
  itemLocks.set(op.itemId, { userId, expiresAt: now + 2000 });
  return 'accept';
}
```
- Rejected operations: client sees item "snap back" to original position with a
  brief shake animation + toast: "Item was moved by [other user]"

**What Is NOT Built for Collab MVP**
- No cursor positions / hover tracking
- No cursor chat
- No spectator mode (everyone can edit)
- No room permissions / kick / ban
- No room persistence beyond 10 min of inactivity
- No Redis — presence is in-memory on the single Socket.IO server

---

## 3. Tech Stack

### Simplified for Solo Developer + Single Deploy Target

```
FRONTEND
──────────────────────────────────────────────
Next.js 15          App Router, RSC for pages
TypeScript          Strict mode
Zustand + zundo     State + temporal undo/redo middleware
@dnd-kit            Drag-and-drop (core + sortable + accessibility)
Tailwind CSS 4      Styling
shadcn/ui           Accessible primitives (Button, Dialog, Toast)
Framer Motion       Drag/drop spring animations only
socket.io-client    Real-time collab client

BACKEND
──────────────────────────────────────────────
Next.js API Routes  Plain route handlers + Zod validation
Auth.js v5          Google OAuth only (1 provider is enough)
Drizzle ORM         Type-safe DB queries
PostgreSQL          Neon serverless (free tier)
Socket.IO server    Standalone Node.js process for WebSocket rooms

INFRASTRUCTURE
──────────────────────────────────────────────
Vercel              Hosts Next.js app (free tier)
Neon                Serverless Postgres (free: 0.5 GB storage)
Railway             Hosts Socket.IO server ($5/mo or free trial)
```

### What Was Removed from the Full Stack

| Removed | Reason |
|---------|--------|
| tRPC | Plain API routes + Zod are sufficient for ~5 endpoints |
| TanStack Query | Only 2 fetches (template list, tier list data) — overkill |
| Cloudflare R2 | No image upload — images pre-seeded in /public |
| Upstash Redis | Presence is in-memory on single Socket.IO server |
| Sharp | No image processing — pre-seeded images already sized |
| Inngest | No background jobs |
| Resend | No emails |
| Sentry | Not needed for demo |
| Playwright | E2E tests deferred to Phase 2 |
| Husky / lint-staged | Nice-to-have, not MVP |
| React Hook Form | No forms (only inline label editing) |

### Estimated Cost

| Service | Tier | Cost |
|---------|------|:----:|
| Vercel | Hobby | $0 |
| Neon Postgres | Free | $0 |
| Railway (Socket.IO) | Trial / Starter | $0-5 |
| **Total** | | **$0-5/mo** |

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      BROWSER CLIENT                          │
│                                                              │
│  ┌───────────────┐  ┌──────────────┐  ┌──────────────────┐  │
│  │  dnd-kit      │  │  Zustand     │  │  socket.io-client│  │
│  │  Drag/Drop    │  │  + zundo     │  │                  │  │
│  │  + keyboard   │──│  (undo/redo) │──│  Room events     │  │
│  │  + a11y       │  │              │  │  Presence         │  │
│  └───────┬───────┘  └──────┬───────┘  └────────┬─────────┘  │
│          │                 │                    │             │
│          └────────┬────────┘                    │             │
│                   │                             │             │
│          ┌────────▼─────────┐                   │             │
│          │  localStorage    │                   │             │
│          │  (crash recovery)│                   │             │
│          └──────────────────┘                   │             │
└──────────────────┬──────────────────────────────┼────────────┘
                   │ HTTPS                        │ WSS
                   │                              │
┌──────────────────▼────────────┐  ┌──────────────▼────────────┐
│       VERCEL (Next.js)        │  │   RAILWAY (Socket.IO)     │
│                               │  │                           │
│  /api/auth/*   → Auth.js     │  │  Room management          │
│  /api/lists/*  → CRUD        │  │  Operation broadcast      │
│  /api/rooms/*  → Room create │  │  Presence (in-memory Map)  │
│                               │  │  Conflict lock (in-memory)│
│  SSR pages:                   │  │  Debounced state persist   │
│  / (template list)            │  │     │                     │
│  /edit/[id] (editor)          │  │     │ Save every 5s       │
│  /room/[code] (collab entry)  │  │     ▼                     │
│         │                     │  │  ┌────────────────┐       │
│         │                     │  │  │ Neon Postgres  │       │
│         └─────────────────────┼──┼─►│                │       │
│                               │  │  │ • users        │       │
│  Drizzle ORM ─────────────────┼──┼─►│ • tier_lists   │       │
│                               │  │  │ • collab_rooms │       │
│                               │  │  │ • templates    │       │
└───────────────────────────────┘  │  │ • template_items│      │
                                   │  └────────────────┘       │
                                   └───────────────────────────┘
```

### Key Data Flows

**Flow 1: Solo editing with autosave**
```
1. dnd-kit onDragEnd → Zustand moveItem()
2. zundo middleware automatically captures previous state in undo stack
3. State writes to localStorage immediately (crash recovery)
4. Debounce timer starts (2s)
5. After 2s idle → PUT /api/lists/[id] with { tierData }
6. Server persists to Postgres → responds 200
7. UI shows "Saved ✓"
```

**Flow 2: Collaborative edit**
```
1. User A: dnd-kit onDragEnd → Zustand moveItem() → local state updates
2. User A: socket.emit('operation', { type: 'MOVE_ITEM', itemId, toTier, toIndex })
3. Server: validates via item lock → accepts → assigns serverSeq
4. Server: broadcasts to room (excluding sender)
5. User B: receives op → Zustand applyRemoteOp() → UI animates item movement
6. Server: debounced (5s) → persists current room state to Postgres
```

**Flow 3: Crash recovery**
```
1. User had been editing → browser crashes
2. User reopens /edit/[id]
3. Page fetches server state: GET /api/lists/[id]
4. Page checks localStorage for 'draft:[id]'
5. Local draft is newer → banner: "Restore unsaved changes?"
6. User clicks Restore → Zustand loads local draft → triggers save
```

---

## 5. Database Schema

```sql
-- Only 5 tables. That's it.

-- ============================================
-- AUTH (managed mostly by Auth.js)
-- ============================================

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(100) NOT NULL,
    email           VARCHAR(255) UNIQUE NOT NULL,
    image           VARCHAR(500),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Auth.js manages its own accounts/sessions tables via its Drizzle adapter.
-- We don't define them manually.

-- ============================================
-- TEMPLATES (pre-seeded, read-only for MVP)
-- ============================================

CREATE TABLE templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(200) NOT NULL,
    description     TEXT DEFAULT '',
    item_count      INTEGER DEFAULT 0,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE template_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id     UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    label           VARCHAR(200) NOT NULL,
    image_url       VARCHAR(500) NOT NULL,
    sort_order      INTEGER DEFAULT 0
);

CREATE INDEX idx_template_items_template ON template_items(template_id, sort_order);

-- ============================================
-- TIER LISTS (user-created rankings)
-- ============================================

CREATE TABLE tier_lists (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    creator_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    template_id     UUID NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
    title           VARCHAR(200) NOT NULL DEFAULT 'Untitled Tier List',

    -- Complete state as JSONB — loaded and saved as a single blob
    -- Shape: { tiers: [{ id, label, color, itemIds }], unrankedItemIds: [] }
    tier_data       JSONB NOT NULL,

    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_tier_lists_creator ON tier_lists(creator_id);

-- ============================================
-- COLLABORATION ROOMS (ephemeral)
-- ============================================

CREATE TABLE collab_rooms (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tier_list_id    UUID NOT NULL REFERENCES tier_lists(id) ON DELETE CASCADE,
    owner_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    room_code       VARCHAR(8) UNIQUE NOT NULL,
    is_active       BOOLEAN DEFAULT TRUE,
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_collab_rooms_code ON collab_rooms(room_code) WHERE is_active = TRUE;
```

### What Was Removed from the Full Schema

| Removed Table/Column | Reason |
|---|---|
| `oauth_accounts`, `sessions` | Auth.js Drizzle adapter auto-manages these |
| `categories` | Templates are pre-seeded, no browsing/filtering |
| `tier_list_versions` | No version history in this MVP |
| `collab_operations` | No persistent op log — state saved as a blob |
| `challenges`, `challenge_responses` | Feature cut |
| `comments`, `reactions` | Feature cut |
| `community_rankings` | Feature cut |
| `templates.slug`, `tags`, `is_published`, `view_count`, etc. | Unnecessary for read-only seeded data |
| `tier_lists.slug`, `is_published`, `is_private`, `custom_items` | No publishing or sharing flow |

### Seed Data (3 Demo Templates)

```typescript
const seedTemplates = [
  {
    title: "NBA Teams",
    description: "Rank all 30 NBA teams",
    items: [
      { label: "Lakers", imageUrl: "/seed/nba/lakers.png" },
      { label: "Celtics", imageUrl: "/seed/nba/celtics.png" },
      { label: "Warriors", imageUrl: "/seed/nba/warriors.png" },
      // ... ~20 teams total, images stored in /public/seed/
    ]
  },
  {
    title: "Programming Languages",
    description: "Rank popular programming languages",
    items: [
      { label: "TypeScript", imageUrl: "/seed/langs/typescript.png" },
      { label: "Python", imageUrl: "/seed/langs/python.png" },
      { label: "Rust", imageUrl: "/seed/langs/rust.png" },
      // ... ~20 languages
    ]
  },
  {
    title: "Fast Food Chains",
    description: "Rank the biggest fast food chains",
    items: [
      { label: "McDonald's", imageUrl: "/seed/food/mcdonalds.png" },
      { label: "Chick-fil-A", imageUrl: "/seed/food/chickfila.png" },
      { label: "Wendy's", imageUrl: "/seed/food/wendys.png" },
      // ... ~20 chains
    ]
  }
];
```

---

## 6. Real-Time Synchronization

### Protocol (Simplified)

No operation log. No CRDT. No OT. The approach:

1. Each client sends **discrete operations** to the server
2. Server applies an **in-memory item lock** to prevent same-item conflicts
3. Server **broadcasts accepted ops** to all other clients in the room
4. Server **debounce-persists** the full tier list state every 5 seconds

### Operation Types (MVP — only 2)

```typescript
type Operation =
  | { type: 'MOVE_ITEM'; itemId: string; toTierId: string; toIndex: number }
  | { type: 'RENAME_TIER'; tierId: string; newLabel: string }

interface OperationMessage {
  op: Operation;
  userId: string;
  clientSeq: number;  // monotonic per client, for dedup
}
```

Two operation types are sufficient to demonstrate real-time sync and conflict handling.

### Socket.IO Events

```typescript
// CLIENT → SERVER
socket.emit('join-room', { roomCode, userId, displayName });
socket.emit('operation', OperationMessage);
socket.emit('heartbeat', { userId, displayName });

// SERVER → CLIENT
socket.on('room-state', { tierData, participants });   // on join
socket.on('remote-operation', OperationMessage);        // broadcast
socket.on('operation-rejected', { clientSeq, reason }); // conflict
socket.on('presence-update', { participants });          // join/leave
```

### Conflict Handling (In-Memory Lock)

```typescript
// Server-side — single Map, no Redis

const itemLocks = new Map<string, { userId: string; expiresAt: number }>();

function tryLockItem(itemId: string, userId: string): boolean {
  const lock = itemLocks.get(itemId);
  const now = Date.now();

  if (lock && lock.userId !== userId && lock.expiresAt > now) {
    return false;
  }

  itemLocks.set(itemId, { userId, expiresAt: now + 2000 });
  return true;
}

// Cleanup expired locks every 30 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, lock] of itemLocks) {
    if (lock.expiresAt < now) itemLocks.delete(key);
  }
}, 30_000);
```

### How Undo Interacts with Collaboration

- Undo stack is **local only** — each user has their own history
- Remote operations are applied to state but **not** pushed onto the local undo stack
- If User A moves item X, then User B moves item X, then User A presses undo:
  undo is **skipped** because the item's position was changed by a remote op
- Implementation: undo attempts to apply the previous snapshot. If the item has
  moved since (state divergence detected), undo is a no-op with a toast:
  "Can't undo — item was modified by another user"

---

## 7. Project Structure

```
tierforge/
├── src/
│   ├── app/                          # Next.js App Router
│   │   ├── page.tsx                  # Homepage: list of demo templates
│   │   ├── edit/
│   │   │   └── [id]/
│   │   │       └── page.tsx          # Tier list editor page
│   │   ├── room/
│   │   │   └── [code]/
│   │   │       └── page.tsx          # Collab entry → redirects to editor
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/
│   │   │   │   └── route.ts          # Auth.js handler
│   │   │   ├── lists/
│   │   │   │   ├── route.ts          # POST: create tier list
│   │   │   │   └── [id]/
│   │   │   │       └── route.ts      # GET + PUT: fetch and save
│   │   │   ├── templates/
│   │   │   │   └── route.ts          # GET: list all templates
│   │   │   └── rooms/
│   │   │       └── route.ts          # POST: create room
│   │   ├── layout.tsx                # Root layout (auth provider)
│   │   └── globals.css               # Tailwind base
│   │
│   ├── components/
│   │   ├── editor/
│   │   │   ├── TierListEditor.tsx    # dnd-kit context wrapper
│   │   │   ├── TierRow.tsx           # Droppable tier row
│   │   │   ├── DraggableItem.tsx     # Draggable item + keyboard
│   │   │   ├── ItemPool.tsx          # Unranked items pool
│   │   │   ├── EditorToolbar.tsx     # Undo, redo, save status, collab
│   │   │   └── LiveAnnouncer.tsx     # ARIA live region
│   │   ├── collab/
│   │   │   ├── CollabProvider.tsx     # Socket.IO context
│   │   │   ├── PresenceAvatars.tsx   # User circles in toolbar
│   │   │   └── RoomShareDialog.tsx   # Copy-link dialog
│   │   └── ui/                       # shadcn/ui: Button, Dialog, Toast
│   │
│   ├── stores/
│   │   └── tierListStore.ts          # Zustand + zundo
│   │
│   ├── server/
│   │   ├── db/
│   │   │   ├── schema.ts            # Drizzle tables
│   │   │   ├── seed.ts              # Insert demo templates
│   │   │   └── index.ts             # Neon connection
│   │   └── auth.ts                   # Auth.js config
│   │
│   ├── lib/
│   │   ├── socket.ts                 # Socket.IO client singleton
│   │   └── utils.ts                  # cn(), nanoid()
│   │
│   └── types/
│       └── index.ts                  # TierListState, Operation, Item
│
├── socket-server/                    # Standalone, deployed to Railway
│   ├── index.ts                      # Socket.IO server entry
│   ├── roomManager.ts                # Join/leave/broadcast
│   └── conflictResolver.ts           # Item lock logic
│
├── public/
│   └── seed/                         # Pre-seeded images (~60 files)
│       ├── nba/
│       ├── langs/
│       └── food/
│
├── drizzle.config.ts
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
├── package.json
└── README.md
```

**~30 source files total.**

---

## 8. Development Roadmap

### 3 Weeks (down from 10)

**Week 1: Editor + State Management**
```
Day 1-2:  Next.js scaffold, Tailwind + shadcn/ui, Drizzle schema,
          Neon DB provision, Auth.js Google OAuth, seed script
Day 3-4:  Zustand store with zundo, TierListEditor component,
          dnd-kit drag-and-drop between tiers, drop indicators
Day 5:    Keyboard navigation (Space pick up, Arrows move, Enter drop),
          ARIA live announcements, focus rings
```
**Deliverable:** Accessible tier list editor with undo/redo. No persistence yet.

**Week 2: Persistence + Real-Time**
```
Day 1:    API routes (GET/PUT /api/lists/[id], POST /api/lists,
          GET /api/templates, POST /api/rooms)
Day 2:    Autosave middleware (localStorage + debounced PUT),
          save status indicator, crash recovery banner
Day 3-4:  Socket.IO server on Railway, room creation, join flow,
          operation broadcast, in-memory presence
Day 5:    Conflict resolution (item locks), rejection UI (snap back + toast)
```
**Deliverable:** Working real-time collaboration with autosave.

**Week 3: Integration + Deploy**
```
Day 1:    Undo + collab interaction (skip undo on remote-modified items),
          room share dialog with copy-link button
Day 2:    Responsive basics (desktop-first, reasonable tablet),
          loading skeletons, error boundaries
Day 3:    Unit tests — store logic, conflict resolver, operation application
Day 4:    Accessibility audit (axe-core, keyboard walkthrough, screen reader)
Day 5:    Deploy Vercel + Railway, seed production DB, write README
```
**Deliverable:** Deployed MVP demonstrating all 4 core capabilities.

---

## Appendix: Phase 2 Additions (Post-Demo)

Once the 4 core capabilities are proven, add in priority order:

1. In-editor search/filter for item pool
2. Template creation + image upload (add R2 + Sharp)
3. Challenge mode + interactive share links
4. Export (PNG via html-to-image, JSON download)
5. Comments and reactions on published lists
6. User profiles with list history
7. Mobile tap-to-assign interaction
8. Dark/light theme toggle
