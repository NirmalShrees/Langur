-- =========================================================================
-- Langur Burja: Migrate / Create Reduced Supabase 'profiles' Table
-- Run this in your Supabase Project:
-- Dashboard -> SQL Editor -> New Query -> Paste -> Click "RUN"
-- =========================================================================

-- =========================================================================
-- OPTION A: SAFE MIGRATION FOR YOUR EXISTING PROFILES TABLE
-- Keeps all your existing users and coins while reducing columns to:
-- [id, email, username, avatar, coins, stats (jsonb), updated_at]
-- =========================================================================

-- 1. Create table if it does not exist at all yet
create table if not exists public.profiles (
  id text primary key,
  email text,
  username text not null default 'Player',
  avatar text default '🎲',
  coins bigint default 0,
  coin_history jsonb default '[]'::jsonb,
  notifications jsonb default '[]'::jsonb,
  stats jsonb default '{
    "gamesPlayed": 0,
    "gamesWon": 0,
    "totalWinnings": 0,
    "biggestWin": 0,
    "equipped": {
      "diceSkin": "dice_classic",
      "tableMat": "mat_velvet_green",
      "title": "Dice Novice"
    },
    "inventory": ["dice_classic", "mat_velvet_green", "title_novice"]
  }'::jsonb,
  updated_at timestamptz default now()
);

-- 2. Add new columns to your existing table if they don't exist yet
alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists is_admin boolean default false;
alter table public.profiles add column if not exists can_create_table boolean default false;
alter table public.profiles add column if not exists table_permission_expires_at timestamptz;
alter table public.profiles add column if not exists table_validity_days int default 7;
alter table public.profiles add column if not exists avatar text default '🎲';
alter table public.profiles add column if not exists coin_history jsonb default '[]'::jsonb;
alter table public.profiles add column if not exists notifications jsonb default '[]'::jsonb;
alter table public.profiles add column if not exists stats jsonb default '{"gamesPlayed": 0, "gamesWon": 0, "totalWinnings": 0, "biggestWin": 0, "equipped": {"diceSkin": "dice_classic", "tableMat": "mat_velvet_green", "title": "Dice Novice"}, "inventory": ["dice_classic", "mat_velvet_green", "title_novice"]}'::jsonb;
alter table public.profiles add column if not exists updated_at timestamptz default now();

-- Clean up: Remove created_tables column from profiles table (tables are stored exclusively in game_tables)
alter table public.profiles drop column if exists created_tables;
alter table public.profiles alter column username set default 'Player';

-- 3. If id column is uuid, alter it to text so all authentication IDs are supported
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'id' and data_type = 'uuid'
  ) then
    alter table public.profiles alter column id type text;
  end if;
end $$;

-- 4. Copy existing avatar_url values to avatar column if needed
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'avatar_url'
  ) then
    update public.profiles
    set avatar = coalesce(avatar_url, avatar)
    where (avatar is null or avatar = '🎲') and avatar_url is not null;
  end if;
end $$;

-- 5. Merge existing separate stats columns into jsonb 'stats' column
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'games_played'
  ) then
    update public.profiles
    set stats = jsonb_build_object(
      'gamesPlayed', coalesce(games_played, 0),
      'gamesWon', coalesce(games_won, 0),
      'totalWinnings', coalesce(total_winnings, 0),
      'biggestWin', coalesce(biggest_win, 0),
      'equipped', jsonb_build_object(
        'diceSkin', coalesce(equipped_dice_skin, 'dice_classic'),
        'tableMat', coalesce(equipped_table_mat, 'mat_velvet_green'),
        'title', coalesce(equipped_title, 'Dice Novice')
      ),
      'inventory', coalesce(
        case when jsonb_typeof(to_jsonb(inventory)) = 'array' then to_jsonb(inventory) else null end,
        jsonb_build_array('dice_classic', 'mat_velvet_green', 'title_novice')
      )
    )
    where stats is null or stats = '{}'::jsonb;
  end if;
end $$;

-- 6. Drop the redundant old separate columns to complete the reduction
alter table public.profiles drop column if exists avatar_url;
alter table public.profiles drop column if exists games_played;
alter table public.profiles drop column if exists games_won;
alter table public.profiles drop column if exists total_winnings;
alter table public.profiles drop column if exists biggest_win;
alter table public.profiles drop column if exists equipped_dice_skin;
alter table public.profiles drop column if exists equipped_table_mat;
alter table public.profiles drop column if exists equipped_title;
alter table public.profiles drop column if exists inventory;

-- 7. Enable Row Level Security (RLS) & Set Permissive Policies
alter table public.profiles enable row level security;

drop policy if exists "Public profiles read" on public.profiles;
create policy "Public profiles read" on public.profiles for select using (true);

drop policy if exists "Enable insert for all" on public.profiles;
create policy "Enable insert for all" on public.profiles for insert with check (true);

drop policy if exists "Enable update for all" on public.profiles;
create policy "Enable update for all" on public.profiles for update using (true);

-- 8. Automatic Trigger: Whenever a real user signs up/in via Google OAuth or Email in auth.users,
-- automatically sync their account details (name, email, avatar photo) to public.profiles!
-- Strictly skips anonymous sessions, empty-email users, and bot/placeholder accounts.
create or replace function public.handle_new_user()
returns trigger as $$
declare
  raw_name text;
  final_username text;
begin
  if coalesce(new.is_anonymous, false)
     or new.email is null
     or trim(new.email) = ''
     or new.id::text ~* '^(bot_|bot-|patron_|smart_|seed-|seed_|ai_|guest_|user_|system)'
  then
    return new;
  end if;

  raw_name := coalesce(
    nullif(trim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(trim(new.raw_user_meta_data->>'name'), ''),
    nullif(trim(new.raw_user_meta_data->>'username'), '')
  );

  if raw_name is not null and lower(raw_name) in ('festival player', 'festival patron', 'guest', '[purged]') then
    raw_name := null;
  end if;

  final_username := coalesce(
    raw_name,
    nullif(trim(split_part(new.email, '@', 1)), ''),
    'Player'
  );

  insert into public.profiles (id, email, username, avatar, coins, notifications, stats, updated_at)
  values (
    new.id::text,
    new.email,
    final_username,
    coalesce(
      nullif(trim(new.raw_user_meta_data->>'avatar_url'), ''),
      nullif(trim(new.raw_user_meta_data->>'picture'), ''),
      '🎲'
    ),
    0,
    '[]'::jsonb,
    jsonb_build_object(
      'gamesPlayed', 0,
      'gamesWon', 0,
      'totalWinnings', 0,
      'biggestWin', 0,
      'equipped', jsonb_build_object(
        'diceSkin', 'dice_classic',
        'tableMat', 'mat_velvet_green',
        'title', 'Dice Novice'
      ),
      'inventory', jsonb_build_array('dice_classic', 'mat_velvet_green', 'title_novice')
    ),
    now()
  )
  on conflict (id) do update set
    email = excluded.email,
    username = coalesce(excluded.username, public.profiles.username),
    avatar = coalesce(excluded.avatar, public.profiles.avatar),
    updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 9. Backfill only real authenticated accounts (with email, non-anonymous) into public.profiles!
insert into public.profiles (id, email, username, avatar, coins, notifications, stats, updated_at)
select
  u.id::text,
  u.email,
  coalesce(
    case
      when lower(trim(coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.raw_user_meta_data->>'username', '')))
           in ('festival player', 'festival patron', 'guest', '[purged]', '') then null
      else coalesce(
        nullif(trim(u.raw_user_meta_data->>'full_name'), ''),
        nullif(trim(u.raw_user_meta_data->>'name'), ''),
        nullif(trim(u.raw_user_meta_data->>'username'), '')
      )
    end,
    nullif(trim(split_part(u.email, '@', 1)), ''),
    'Player'
  ) as username,
  coalesce(
    nullif(trim(u.raw_user_meta_data->>'avatar_url'), ''),
    nullif(trim(u.raw_user_meta_data->>'picture'), ''),
    '🎲'
  ) as avatar,
  0 as coins,
  '[]'::jsonb as notifications,
  jsonb_build_object(
    'gamesPlayed', 0,
    'gamesWon', 0,
    'totalWinnings', 0,
    'biggestWin', 0,
    'equipped', jsonb_build_object(
      'diceSkin', 'dice_classic',
      'tableMat', 'mat_velvet_green',
      'title', 'Dice Novice'
    ),
    'inventory', jsonb_build_array('dice_classic', 'mat_velvet_green', 'title_novice')
  ) as stats,
  now() as updated_at
from auth.users u
where coalesce(u.is_anonymous, false) = false
  and u.email is not null
  and trim(u.email) <> ''
  and not (u.id::text ~* '^(bot_|bot-|patron_|smart_|seed-|seed_|ai_|guest_|user_|system)')
on conflict (id) do update set
  email = excluded.email,
  username = coalesce(excluded.username, public.profiles.username),
  avatar = coalesce(excluded.avatar, public.profiles.avatar),
  updated_at = now();

-- 9b. Remove any previously created bot, guest, or email-less "Festival Player" rows from public.profiles
delete from public.profiles
where id ~* '^(bot_|bot-|patron_|smart_|seed-|seed_|ai_|guest_|user_|system)'
   or coalesce((stats->>'isBot')::boolean, false) = true
   or coalesce((stats->>'is_dummy')::boolean, false) = true
   or coalesce((stats->>'is_deleted')::boolean, false) = true
   or (
     lower(trim(coalesce(username, ''))) in ('festival player', 'festival patron', 'guest', '[purged]')
     and (email is null or trim(email) = '')
   );

-- ============================================================================
-- 10. MULTIPLAYER GAME TABLES DATA (game_tables_data Schema)
-- ============================================================================
create table if not exists public.game_tables_data (
  id text not null,
  code text not null,
  name text not null default 'Game Table'::text,
  status text not null default 'waiting'::text,
  player_count integer not null default 0,
  expires_at timestamp with time zone null,
  config jsonb not null default '{"host": {"id": "", "name": "Host"}, "approval": {"admin_id": null, "admin_name": null, "approved_at": null}, "is_private": false, "betting_duration": 18}'::jsonb,
  player_stats jsonb not null default '[]'::jsonb,
  history jsonb not null default '[]'::jsonb,
  table_stats jsonb not null default '{"totalBets": 0, "totalRounds": 0, "totalPayouts": 0}'::jsonb,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint game_tables_beta_pkey primary key (id),
  constraint game_tables_beta_code_key unique (code)
) TABLESPACE pg_default;

-- Migration: If table existed without name column, add it and backfill from config->>'name'
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'game_tables_data' and column_name = 'name'
  ) then
    alter table public.game_tables_data add column name text not null default 'Game Table';
  end if;
end $$;

update public.game_tables_data
set name = coalesce(nullif(config->>'name', ''), name)
where config ? 'name';

update public.game_tables_data
set config = config - 'name'
where config ? 'name';

-- Indices for instant query lookup
create index if not exists game_tables_beta_status_idx on public.game_tables_data using btree (status) TABLESPACE pg_default;
create index if not exists game_tables_beta_player_count_idx on public.game_tables_data using btree (player_count) TABLESPACE pg_default;
create index if not exists game_tables_beta_updated_at_idx on public.game_tables_data using btree (updated_at desc) TABLESPACE pg_default;
create index if not exists game_tables_beta_host_id_idx on public.game_tables_data using btree ((((config -> 'host'::text) ->> 'id'::text))) TABLESPACE pg_default;
create index if not exists game_tables_beta_name_idx on public.game_tables_data using btree (name) TABLESPACE pg_default;

-- Auto-migrate existing rows from legacy public.game_tables if it was present
do $$
begin
  if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'game_tables') then
    insert into public.game_tables_data (
      id, code, name, status, player_count, expires_at, config, player_stats, history, table_stats, created_at, updated_at
    )
    select
      g.id,
      g.code,
      coalesce(g.name, 'Game Table'),
      coalesce(g.status, 'waiting'),
      coalesce(g.player_count, 0),
      g.expires_at,
      jsonb_build_object(
        'is_private', coalesce(g.is_private, false),
        'betting_duration', coalesce(g.betting_duration, 18),
        'validity_hours', coalesce(g.validity_hours, 24),
        'host', jsonb_build_object(
          'id', coalesce(g.host_id, g.leader_id, ''),
          'name', coalesce(g.host_name, g.leader_name, 'Host')
        ),
        'approval', jsonb_build_object(
          'admin_id', coalesce(g.approval_meta->>'admin_id', g.approved_by_admin_id, null),
          'admin_name', coalesce(g.approval_meta->>'admin_name', g.approved_by_admin_name, null),
          'approved_at', coalesce(g.approval_meta->>'approved_at', g.approved_at::text, null)
        )
      ),
      coalesce(g.player_stats, '[]'::jsonb),
      coalesce(g.history, '[]'::jsonb),
      coalesce(g.table_stats, '{"totalBets": 0, "totalRounds": 0, "totalPayouts": 0}'::jsonb),
      coalesce(g.created_at, now()),
      coalesce(g.updated_at, now())
    from public.game_tables g
    on conflict (id) do update set
      name = excluded.name,
      status = excluded.status,
      player_count = excluded.player_count,
      expires_at = excluded.expires_at,
      config = excluded.config,
      player_stats = excluded.player_stats,
      history = excluded.history,
      table_stats = excluded.table_stats,
      updated_at = excluded.updated_at;
  end if;
end $$;

-- Enable Row Level Security (RLS)
alter table public.game_tables_data enable row level security;

-- Policies for public reading, inserting, updating, and deleting
drop policy if exists "Public game_tables_data read" on public.game_tables_data;
create policy "Public game_tables_data read" on public.game_tables_data
  for select using (true);

drop policy if exists "Enable game_tables_data insert for all" on public.game_tables_data;
create policy "Enable game_tables_data insert for all" on public.game_tables_data
  for insert with check (true);

drop policy if exists "Enable game_tables_data update for all" on public.game_tables_data;
create policy "Enable game_tables_data update for all" on public.game_tables_data
  for update using (true);

drop policy if exists "Enable game_tables_data delete for all" on public.game_tables_data;
create policy "Enable game_tables_data delete for all" on public.game_tables_data
  for delete using (true);

-- Enable Supabase Realtime for game_tables_data
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.game_tables_data;
  end if;
exception
  when duplicate_object then null;
end $$;
