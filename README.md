# WHO WOULD? — MostLikely

A production-ready, mobile-first realtime party game for 3–10 friends sitting together.

**Your friends vote. The room decides.**

## The game

1. One person creates a room and becomes Host.
2. Friends join in seconds using a 4-digit code or QR link — no accounts.
3. Every phone receives the same “Who would…?” question.
4. Everyone secretly locks one vote for another player.
5. The Host reveals only after voting is complete (or explicitly reveals early).
6. Every device enters the synchronized reveal, then shows the vote distribution.
7. After as many rounds as the group wants, the app generates category awards, session awards and data-backed receipts.

The V1 ships with **255 hand-curated questions** across Chill, Chaos, Savage, Wholesome and ambition/trust/social categories, plus optional custom questions.

## Architecture

- **Next.js 16 + React 19 + TypeScript** — responsive PWA frontend
- **Supabase Postgres** — isolated temporary room/session data
- **Supabase Edge Function (`game-api`)** — authoritative game state, token validation and all privileged writes
- **Supabase Realtime Broadcast** — low-latency `state_changed` signals; clients then refetch sanitized authoritative state
- **Vercel** — production web deployment

### Why votes stay secret

The browser has **no direct table access**. RLS is enabled and `anon`/`authenticated` table privileges are revoked. Every gameplay mutation goes through `game-api`, which validates the opaque per-player session token. Raw `votes` rows are never returned to clients; only aggregate results are returned after a reveal.

Host authority is also checked server-side on every Host-only operation. Being able to alter browser JavaScript does not grant Host access.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Required public environment variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

The Supabase Edge Function receives privileged Supabase credentials from its own runtime environment; they are never shipped to the browser or stored as `NEXT_PUBLIC_*` values.

## Supabase

Apply:

```text
supabase/migrations/20260912_initial.sql
```

Deploy:

```text
supabase/functions/game-api/
```

The function intentionally uses custom opaque player-session authentication and is deployed with gateway JWT verification disabled. It authenticates every room action itself. Public create/join operations still validate room lifecycle, player count and duplicate names.

## Important behavior

- 3–10 players
- no self-votes by default
- one vote per player per round (database-enforced)
- no joining after a game starts
- Host cannot inspect vote targets before reveal
- reconnect/refresh restores the same local player session
- 6-hour rolling room expiry, plus opportunistic expired-room cleanup
- realtime polling fallback if a WebSocket notification is missed
- ties, unanimous results, landslides and no-consensus rounds
- final awards only when enough category data exists
- reduced-motion support, large tap targets, sound/haptics toggles
- installable PWA shell

## Production checklist

- [x] Create/join flow
- [x] QR deep link
- [x] Live lobby
- [x] Pack selection + custom questions
- [x] Authoritative state machine
- [x] Secret vote locking
- [x] Synchronized reveal using server `revealed_at`
- [x] Results + special outcomes
- [x] Skip / next / early reveal / end controls
- [x] Category and session awards
- [x] Data-backed receipts
- [x] Refresh/reconnect
- [x] Responsive mobile-first UI
- [x] PWA manifest/service worker
- [x] No cross-project database dependency

## Repository safety

This app is intentionally self-contained. It must use its own Supabase project and its own Vercel project. Do **not** point its environment variables at another application's Supabase instance.
