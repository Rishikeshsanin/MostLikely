# Supabase Project Hub Rules — MostLikely

App slug/schema: `most_likely`

This application shares a Supabase project with independent applications.

## Core boundary

This app may normally modify only:

```text
most_likely.*
```

It must not modify another application's objects.

## Mandatory first checks

```sql
select * from hub.read_me_first;

select
  app_number,
  slug,
  display_name,
  schema_name,
  status,
  safety_contract_version,
  safety_contract_acknowledged_at
from hub.apps
where slug = 'most_likely';

select hub.assert_app_scope('most_likely', 'most_likely');
```

If any check fails: STOP.

## Database rules

- use fully-qualified names
- one app = one schema
- never create MostLikely app tables in `public`
- enable RLS on every user-facing table
- do not create cross-app foreign keys
- keep migrations app-prefixed
- keep raw votes private and inaccessible to browser roles

## Authentication

MostLikely intentionally has no account/signup system. Room players use opaque per-session tokens managed by the app backend.

Do not modify `auth.users` or Project Hub Auth configuration for this app.

## Storage

MostLikely V1 does not require Supabase Storage. If storage is added later, use only `most_likely-` prefixed buckets after explicit registration.

## Functions

Use app-prefixed Edge Function names such as:

```text
most_likely-game-api
```

Database functions must live inside `most_likely`.

## Secrets

Never expose or commit:
- service-role key
- secret key
- database password
- project-level privileged credentials

The frontend may use only the Project Hub Supabase URL plus a publishable/anon key.

The Edge Function may use the platform-provided database connection internally, but all SQL must be fully-qualified to `most_likely.*` (plus the read-only Hub scope assertion) and must call `hub.assert_app_scope('most_likely','most_likely')` before gameplay operations.

## High-risk operations

Ask the user before:
- project-wide Auth changes
- key rotation
- extensions
- billing/compute/region changes
- project pause/delete
- any cross-app operation

## Destructive operations

Before DROP/DELETE/TRUNCATE:
- verify exact schema/object
- verify it belongs to `most_likely`
- verify data-loss impact
- verify no cross-app dependency

If uncertain: STOP.
