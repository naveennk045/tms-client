# KTR Token Board (tms-client)

The customer-facing token board for KTR outlets: a dark TV display showing every order's progress,
ready tokens, dish stories, milestones and voice announcements, live from the kitchen.

React 19 + Vite + TypeScript. Talks to `ktr-kiosk-backend` (`/tms/*` over HTTP and Server-Sent Events).

## Run

```bash
cp .env.example .env          # VITE_API_BASE_URL=http://localhost:8000
npm install
npm run dev                   # http://localhost:5173
npm run build                 # production build in dist/
```

On the TV: open `/setup` once and pick the outlet, then `/tms`. Tap **Announcements** to enable the
chime and voice (browsers need one tap after every restart).

## What's on the board

- **Order status cards**: received → being made → partly ready → ready → completed, with per-item
  kitchen stage, timers, progress, and tags like *50th order of the day* or *Karnataka classic*
- **Spotlight**: "Just ordered" dish story for new tokens, otherwise a rotating house favourite
- **Live moments**: toasts, ready flip with confetti, 2-minute pickup reminder, "100th filter coffee
  served" celebration, story reel when no tokens are on the board, fact ticker
- **Interactive**: All / Being made / Ready filters, Find my token, tap a card for its timeline
- **Busy hours**: auto-pages every 8 s with ready tokens first
- **Voice**: chime, Indian English voice, English / Hindi / both

## Code map

| Path | What |
|------|------|
| `src/routes/TmsBoard.tsx` | Board container: data loading, SSE, snapshot diffing, timers, overlays |
| `src/routes/Setup.tsx` | Outlet picker |
| `src/components/board/` | `TokenCard`, `Spotlight`, `Overlays` (toasts, ticker, milestone, reel, details), icons |
| `src/lib/board.ts` | Card state, progress, item stages, tags, timers, menu lookup |
| `src/lib/speech.ts` | Chime, voice selection, English/Hindi announcements |
| `src/lib/api.ts`, `types.ts` | API client and payload types |
| `public/img/` | KTR photos and logo (keys referenced by `/tms/menu-meta`) |

## Docs

In `ktr-kiosk-backend/docs/`:

- `KDS-TMS-client-guide.md`: API reference, events and full feature guide
- `TMS-architecture.md`: architecture, data model, Redis design, timings and rollout
