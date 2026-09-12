create extension if not exists pgcrypto;

create table if not exists public.rooms (
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

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
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

alter table public.rooms
  add constraint rooms_host_player_fk foreign key (host_player_id) references public.players(id) on delete set null;

create table if not exists public.rounds (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
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

alter table public.rooms
  add constraint rooms_current_round_fk foreign key (current_round_id) references public.rounds(id) on delete set null;

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.rounds(id) on delete cascade,
  voter_id uuid not null references public.players(id) on delete cascade,
  target_player_id uuid not null references public.players(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (round_id, voter_id)
);

create index if not exists idx_players_room on public.players(room_id);
create unique index if not exists idx_players_active_name_unique on public.players(room_id, name_key) where kicked = false;
create unique index if not exists idx_players_active_slot_unique on public.players(room_id, join_order) where kicked = false;
create index if not exists idx_players_room_seen on public.players(room_id, last_seen_at desc);
create index if not exists idx_rounds_room on public.rounds(room_id, round_number desc);
create index if not exists idx_votes_round on public.votes(round_id);
create index if not exists idx_rooms_expiry on public.rooms(expires_at);

alter table public.rooms enable row level security;
alter table public.players enable row level security;
alter table public.rounds enable row level security;
alter table public.votes enable row level security;

-- Deliberately no anon/authenticated table policies: browsers never query game tables directly.
-- All database access goes through the isolated game-api Edge Function using privileged server credentials.
revoke all on table public.rooms, public.players, public.rounds, public.votes from anon, authenticated;
grant all on table public.rooms, public.players, public.rounds, public.votes to service_role;

create or replace function public.expire_mostlikely_rooms()
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare deleted_count integer;
begin
  delete from public.rooms where expires_at < now();
  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;
revoke all on function public.expire_mostlikely_rooms() from public, anon, authenticated;
grant execute on function public.expire_mostlikely_rooms() to service_role;

comment on table public.votes is 'Secret votes. Never expose this table to browser roles or Realtime subscriptions.';
comment on table public.rooms is 'Temporary MostLikely party rooms. Edge Function extends expires_at on activity.';
