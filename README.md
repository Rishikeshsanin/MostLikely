# WHO WOULD? — MostLikely

A production-ready, mobile-first realtime party game for 3–10 friends sitting together.

**Your friends vote. The room decides.**

## The game

1. One person creates a room and becomes Host.
2. Friends join in seconds using a 4-digit code or QR link — no accounts.
3. Every phone receives the same “Who would…?” question.
4. Everyone secretly locks one vote for another player.
5. The Host reveals after voting is complete, or explicitly reveals early.
6. Every device enters the synchronized reveal and then sees the vote distribution.
7. When the group ends the game, category awards, session awards and data-backed receipts are generated from the real session.

V1 includes **255 hand-curated questions** across Chill, Chaos, Savage, Wholesome and ambition/trust/social categories, plus optional custom questions.

## Architecture

- **Next.js 16 + React 19 + TypeScript** — responsive PWA frontend
- **Supabase Project Hub / Postgres** — App #10, isolated schema `most_likely`
- **Supabase Edge Function `most_likely-game-api`** — authoritative game state and opaque player-session validation
- **Supabase Realtime Broadcast** — app-prefixed `most_likely:room:<code>` state-change signals only
- **Vercel** — dedicated MostLikely web deployment

## Project Hub isolation

MostLikely intentionally shares the existing Supabase **Project Hub** rather than creating another Supabase project.

Its registered boundary is:

```text
most_likely.*
```

The repository includes the mandatory Hub safety files:

```text
AGENTS.md
SUPABASE_HUB_RULES.md
```

Before any gameplay database operation the backend executes:

```sql
select hub.assert_app_scope('most_likely', 'most_likely');
```

All gameplay SQL is then fully qualified to `most_likely.*`. The app does not create ordinary tables in `public`, does not create cross-app foreign keys, and does not modify another application's schema, Auth configuration, Storage, project keys, extensions or project-wide settings.

## Why votes stay secret

The browser has **no direct table access**. RLS is enabled on every MostLikely table, and `anon` / `authenticated` receive no table privileges in the app schema.

Players receive opaque room-session tokens. Only SHA-256 hashes of those tokens are stored in `most_likely.players`. Host authority is validated by the backend for every Host-only action.

Raw `most_likely.votes` rows are never returned to browsers. Before reveal, clients receive only the vote count and whether their own vote is locked. After reveal, clients receive the authoritative aggregate result rather than individual voter→target records.

Realtime messages contain only a `state_changed` notification. Phones then refetch sanitized authoritative state using their room token.

## Local setup

```bash
npm install
cp .env.example .env.local
npm run dev
```

Public web variables:

```env
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

No secret/service-role/database credential is shipped to the browser.

## Supabase deployment

Database migration:

```text
supabase/migrations/20260912_initial.sql
```

The migration asserts the registered Hub boundary and creates only:

```text
most_likely.rooms
most_likely.players
most_likely.rounds
most_likely.votes
most_likely.expire_rooms()
```

Edge Function source:

```text
supabase/functions/game-api/
```

Production function name:

```text
most_likely-game-api
```

The Edge Function uses the platform-provided server-side Postgres connection and hard-coded, fully-qualified `most_likely.*` queries. It does **not** use a Supabase service-role/secret API key. Gateway JWT verification is disabled intentionally because create/join are public and gameplay uses the app's own opaque per-player room-session authentication.

## Important behavior

- 3–10 players
- no accounts or passwords
- no self-votes by default
- one vote per player per round, database-enforced
- no joining after a game starts
- Host cannot inspect vote targets before reveal
- reconnect/refresh restores the same local player session
- 6-hour rolling room expiry
- realtime signal + polling fallback
- ties, unanimous results, landslides and no-consensus rounds
- final category awards only when supported by actual session data
- reduced-motion support, large tap targets, optional sound/haptics
- installable PWA shell

## Production checklist

- [x] Create/join flow
- [x] QR deep link
- [x] Live lobby
- [x] Pack selection + custom questions
- [x] Authoritative state machine
- [x] Secret vote locking
- [x] Synchronized reveal using server timestamps
- [x] Results + special outcomes
- [x] Skip / next / early reveal / end controls
- [x] Category and session awards
- [x] Data-backed receipts
- [x] Refresh/reconnect
- [x] Responsive mobile-first UI
- [x] PWA manifest/service worker
- [x] Project Hub isolation contract
- [ ] CI green on tests, strict TypeScript and production build
- [ ] Project Hub migration applied
- [ ] `most_likely-game-api` deployed and multiplayer smoke-tested
- [ ] Vercel production deployment verified

## Safety rule

Never repoint this application at another app's schema or reuse another app's database objects. Any operation outside `most_likely.*` or the explicitly registered app-prefixed resources requires a separate safety review and explicit user approval.
