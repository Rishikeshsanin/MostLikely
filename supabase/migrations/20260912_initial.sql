-- MostLikely / Project Hub onboarding migration.
-- This migration is intentionally scoped to the registered app schema only.
select hub.assert_app_scope('most_likely', 'most_likely');

create schema if not exists most_likely;
comment on schema most_likely is 'Project Hub App #10: MostLikely realtime party game.';

-- Keep the app schema private from browser/Data API roles. Gameplay is mediated
-- by the app-prefixed Edge Function, which connects to Postgres server-side.
revoke all on schema most_likely from public, anon, authenticated;

create table most_likely.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{4}$'),
  host_player_id uuid,
  status text not null default 'lobby' check (status in ('lobby','active','finished')),
  phase text not null default 'lobby' check (phase in ('lobby','voting','results','final_results')),
  pack text not null default 'mixed' check (pack in ('chill','chaos','savage','wholesome','mixed')),
  round_number integer not null default 0 check (round_number >= 0),
  current_round_id uuid,
  question_history text[] not null default '{}',
  custom_questions jsonb not null default '[]'::jsonb,
  final_results jsonb,
  created_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '6 hours')
);

create table most_likely.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references most_likely.rooms(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 24),
  name_key text not null,
  color text not null,
  initial text not null,
  session_token_hash text not null unique,
  is_host boolean not null default false,
  join_order integer not null check (join_order between 1 and 10),
  kicked boolean not null default false,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table most_likely.rooms
  add constraint rooms_host_player_fk
  foreign key (host_player_id) references most_likely.players(id) on delete set null;

create table most_likely.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references most_likely.rooms(id) on delete cascade,
  question_id text not null,
  question_text text not null,
  question_pack text not null,
  award_category text,
  tone text not null,
  topic text not null,
  allow_self boolean not null default false,
  round_number integer not null check (round_number > 0),
  phase text not null default 'voting' check (phase in ('voting','results','skipped')),
  eligible_player_ids uuid[] not null,
  result jsonb,
  created_at timestamptz not null default now(),
  revealed_at timestamptz,
  unique (room_id, round_number)
);

alter table most_likely.rooms
  add constraint rooms_current_round_fk
  foreign key (current_round_id) references most_likely.rounds(id) on delete set null;

create table most_likely.votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references most_likely.rounds(id) on delete cascade,
  voter_id uuid not null references most_likely.players(id) on delete cascade,
  target_player_id uuid not null references most_likely.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (round_id, voter_id)
);

create index idx_most_likely_players_room on most_likely.players(room_id);
create unique index idx_most_likely_players_active_name_unique
  on most_likely.players(room_id, name_key) where kicked = false;
create unique index idx_most_likely_players_active_slot_unique
  on most_likely.players(room_id, join_order) where kicked = false;
create index idx_most_likely_players_room_seen on most_likely.players(room_id, last_seen_at desc);
create index idx_most_likely_rounds_room on most_likely.rounds(room_id, round_number desc);
create index idx_most_likely_votes_round on most_likely.votes(round_id);
create index idx_most_likely_rooms_expiry on most_likely.rooms(expires_at);

alter table most_likely.rooms enable row level security;
alter table most_likely.players enable row level security;
alter table most_likely.rounds enable row level security;
alter table most_likely.votes enable row level security;

-- No browser policies by design. Raw game rows, especially secret votes, are
-- not directly queryable by anon/authenticated clients.
revoke all on all tables in schema most_likely from public, anon, authenticated;
revoke all on all sequences in schema most_likely from public, anon, authenticated;
alter default privileges in schema most_likely revoke all on tables from public, anon, authenticated;
alter default privileges in schema most_likely revoke all on sequences from public, anon, authenticated;

create or replace function most_likely.expire_rooms()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, most_likely
as $$
declare
  deleted_count integer;
begin
  delete from most_likely.rooms where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function most_likely.expire_rooms() from public, anon, authenticated;

comment on table most_likely.votes is 'Secret MostLikely votes. Never expose raw rows to browser clients or Realtime subscriptions.';
comment on table most_likely.rooms is 'Temporary MostLikely party rooms. Activity extends expires_at; inactive rooms are disposable.';
comment on function most_likely.expire_rooms() is 'Deletes only expired rows from the MostLikely app schema.';
