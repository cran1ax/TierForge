# TierForge

A modern, collaborative tier list editor built with **Next.js 16**, **React 19**, and **TypeScript**. Drag-and-drop items across tiers, collaborate in real time, and never lose progress with autosave and crash recovery.

![Next.js](https://img.shields.io/badge/Next.js-16.1.6-black?logo=next.js)
![React](https://img.shields.io/badge/React-19.2.3-61DAFB?logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript)
![Socket.IO](https://img.shields.io/badge/Socket.IO-4.8-010101?logo=socket.io)
![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4-06B6D4?logo=tailwindcss)

---

## Features

### 🎯 Tier List Editor
- Drag-and-drop items between tiers (S / A / B / C / D) and an unranked pool
- Smooth cross-container moves with live reordering
- Custom collision detection for precise drop targeting
- Drop indicators and drag overlays
- Auto-scroll when dragging near edges
- Inline tier label renaming (double-click)

### ↩️ Undo / Redo
- **Inverse-operation based** — not snapshot-based; each action records its exact reverse
- Supports `Ctrl+Z` (undo) and `Ctrl+Shift+Z` (redo) keyboard shortcuts
- 50-operation deep undo stack
- Remote operations (from collaborators) do not pollute the local undo history

### 💾 Autosave & Crash Recovery
- Every change is **immediately** persisted to `localStorage` (crash-safe)
- A **debounced PUT request** (2 seconds) syncs to the database
- Save status indicator in the toolbar: ✓ Saved / ↻ Saving… / ✗ Error
- On reload, if a `localStorage` draft is newer than the database, a **recovery banner** lets you restore or discard

### 🔄 Real-Time Collaboration
- Standalone **Socket.IO server** (`socket-server/`) for operation relay
- Room-based collaboration — multiple users can edit the same tier list
- **Item-level locking** — 2-second lock prevents conflicting moves on the same item
- Operations rejected by the server are automatically **reverted** with a toast notification
- Live presence indicator showing online participants
- Heartbeat-based connection monitoring

### 🗄️ Database
- **Drizzle ORM** with **Neon Postgres** (serverless HTTP driver)
- Four tables: `users`, `templates`, `template_items`, `tier_lists`
- Tier ranking data stored as JSONB for fast save/restore
- REST API: `GET /api/lists/[id]` and `PUT /api/lists/[id]`

### ♿ Accessibility
- ARIA live announcements for drag events
- Keyboard sensor support (`Tab` to focus, `Space` to pick up, arrow keys to move)
- Semantic HTML and screen reader friendly

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS 4 |
| Language | TypeScript (strict mode) |
| State | Zustand 5 |
| Drag & Drop | @dnd-kit/core + @dnd-kit/sortable |
| Database | Drizzle ORM + Neon Postgres |
| Real-Time | Socket.IO (client + standalone server) |
| Animation | Framer Motion (available, non-DnD usage) |

---

## Project Structure

```
TierForge/
├── src/
│   ├── app/                        # Next.js App Router
│   │   ├── api/lists/[id]/route.ts # REST API (GET + PUT)
│   │   ├── page.tsx                # Home page
│   │   ├── layout.tsx              # Root layout
│   │   └── globals.css             # Tailwind + dark theme
│   ├── components/
│   │   ├── editor/                 # Core editor UI
│   │   │   ├── TierListEditor.tsx  # Main orchestrator (DnD + collab + autosave)
│   │   │   ├── TierRow.tsx         # Single tier row with droppable zone
│   │   │   ├── ItemPool.tsx        # Unranked items pool
│   │   │   ├── DraggableItem.tsx   # Draggable item card
│   │   │   ├── EditorToolbar.tsx   # Undo/Redo/Reset + status indicators
│   │   │   ├── RecoveryBanner.tsx  # Crash recovery prompt
│   │   │   └── LiveAnnouncer.tsx   # ARIA live region
│   │   └── collab/
│   │       └── CollabProvider.tsx  # Socket.IO context provider
│   ├── hooks/
│   │   ├── useAutosave.ts          # localStorage + debounced PUT
│   │   └── useUndoRedoKeyboard.ts  # Ctrl+Z / Ctrl+Shift+Z listener
│   ├── lib/
│   │   ├── demo-data.ts            # 15 programming languages demo
│   │   └── socket.ts               # Socket.IO client singleton
│   ├── server/
│   │   └── db/
│   │       ├── schema.ts           # Drizzle schema (4 tables)
│   │       └── index.ts            # Neon connection (lazy init)
│   ├── stores/
│   │   └── tierListStore.ts        # Zustand store + inverse-op undo
│   └── types/
│       └── index.ts                # All TypeScript type definitions
├── socket-server/                  # Standalone collab server
│   ├── src/index.ts                # Express + Socket.IO server
│   ├── package.json
│   └── tsconfig.json
├── drizzle.config.ts               # Drizzle Kit configuration
├── .env.example                    # Required environment variables
└── package.json
```

---

## Getting Started

### Prerequisites

- **Node.js** 18+ 
- **npm** (comes with Node)
- A **Neon** database (free tier works: [console.neon.tech](https://console.neon.tech))

### 1. Clone the repository

```bash
git clone https://github.com/cran1ax/TierForge.git
cd TierForge
```

### 2. Install dependencies

```bash
# Next.js frontend
npm install

# Socket.IO server (separate project)
cd socket-server
npm install
cd ..
```

### 3. Set up environment variables

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Neon connection string:

```env
DATABASE_URL="postgresql://user:password@ep-XXXX.us-east-2.aws.neon.tech/tierforge?sslmode=require"
```

### 4. Push database schema

```bash
npm run db:push
```

This creates the `users`, `templates`, `template_items`, and `tier_lists` tables in your Neon database.

### 5. Run the development servers

**Terminal 1 — Next.js frontend:**

```bash
npm run dev
```

**Terminal 2 — Socket.IO server (for real-time collab):**

```bash
cd socket-server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to use the editor.

The Socket.IO server runs on [http://localhost:3001](http://localhost:3001) (health check at `/health`).

---

## Available Scripts

### Next.js App

| Command | Description |
|---|---|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run db:generate` | Generate Drizzle migration SQL |
| `npm run db:migrate` | Apply migrations to database |
| `npm run db:push` | Push schema directly (dev) |
| `npm run db:studio` | Open Drizzle Studio (visual DB browser) |

### Socket Server

| Command | Description |
|---|---|
| `npm run dev` | Start with auto-reload (tsx watch) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run start` | Run compiled JS |
| `npm run typecheck` | Type-check without emitting |

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | Yes | — | Neon Postgres connection string |
| `NEXT_PUBLIC_SOCKET_URL` | No | `http://localhost:3001` | Socket.IO server URL |
| `PORT` (socket-server) | No | `3001` | Socket server port |
| `CORS_ORIGIN` (socket-server) | No | `http://localhost:3000` | Allowed CORS origin |

---

## License

This project is for educational and portfolio purposes. 
