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
  username text not null default 'Festival Player',
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

-- 8. Automatic Trigger: Whenever a user signs up/in via Google OAuth or Email in auth.users,
-- automatically sync their account details (name, email, avatar photo) to public.profiles!
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, username, avatar, coins, notifications, stats, updated_at)
  values (
    new.id::text,
    new.email,
    coalesce(
      new.raw_user_meta_data->>'full_name',
      new.raw_user_meta_data->>'name',
      new.raw_user_meta_data->>'username',
      split_part(new.email, '@', 1),
      'Festival Player'
    ),
    coalesce(
      new.raw_user_meta_data->>'avatar_url',
      new.raw_user_meta_data->>'picture',
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

-- 9. Backfill all existing Google accounts currently in auth.users into public.profiles!
insert into public.profiles (id, email, username, avatar, coins, notifications, stats, updated_at)
select
  u.id::text,
  u.email,
  coalesce(
    u.raw_user_meta_data->>'full_name',
    u.raw_user_meta_data->>'name',
    u.raw_user_meta_data->>'username',
    split_part(u.email, '@', 1),
    'Festival Player'
  ) as username,
  coalesce(
    u.raw_user_meta_data->>'avatar_url',
    u.raw_user_meta_data->>'picture',
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
on conflict (id) do update set
  email = excluded.email,
  username = coalesce(excluded.username, public.profiles.username),
  avatar = coalesce(excluded.avatar, public.profiles.avatar),
  updated_at = now();

-- ============================================================================
-- 10. MULTIPLAYER GAME TABLES (Compact & Optimized Schema)
-- ============================================================================
-- Clean, minimal 9-column schema in logical order:
--  1. id               -> Primary table UUID/key
--  2. code             -> 6-character room code (indexed for instant joins)
--  3. name             -> Table display title
--  4. host_id          -> User ID of table host
--  5. host_name        -> Display name of host
--  6. is_private       -> Privacy flag (public vs private)
--  7. betting_duration -> Timer in seconds
--  8. player_count     -> Active player count
--  9. status           -> Table state ('waiting', 'active', 'closed')
-- 10. player_stats     -> Compact player session stats (winRate, coins, profit, bets)
-- 11. history          -> Compact 15-round dice roll history
-- 12. table_stats      -> Aggregate table pool & round counters
-- 13. created_at       -> Creation timestamp
-- 14. updated_at       -> Last active timestamp (indexed for active table sorting)
-- ============================================================================
create table if not exists public.game_tables (
  id text primary key,
  code text not null unique,
  name text not null,
  leader_id text,
  leader_name text,
  host_id text not null,
  host_name text not null,
  approved boolean default false,
  approval_status text default 'pending',
  approved_by_admin_id text,
  approved_by_admin_name text,
  admin_approval_message text,
  approved_at timestamptz,
  is_private boolean default false,
  betting_duration int default 20,
  player_count int default 0,
  status text default 'waiting',
  player_stats jsonb default '[]'::jsonb,
  history jsonb default '[]'::jsonb,
  table_stats jsonb default '{"totalRounds": 0, "totalBets": 0, "totalPayouts": 0}'::jsonb,
  expires_at timestamptz,
  validity_hours int default 24,
  validity_days numeric default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Ensure all columns exist for existing databases
alter table public.game_tables add column if not exists approved boolean default false;
alter table public.game_tables add column if not exists approval_status text default 'pending';
alter table public.game_tables add column if not exists leader_id text;
alter table public.game_tables add column if not exists leader_name text;
alter table public.game_tables add column if not exists approved_by_admin_id text;
alter table public.game_tables add column if not exists approved_by_admin_name text;
alter table public.game_tables add column if not exists admin_approval_message text;
alter table public.game_tables add column if not exists approved_at timestamptz;
alter table public.game_tables add column if not exists player_stats jsonb default '[]'::jsonb;
alter table public.game_tables add column if not exists history jsonb default '[]'::jsonb;
alter table public.game_tables add column if not exists table_stats jsonb default '{"totalRounds": 0, "totalBets": 0, "totalPayouts": 0}'::jsonb;
alter table public.game_tables add column if not exists expires_at timestamptz;
alter table public.game_tables add column if not exists validity_hours int default 24;
alter table public.game_tables add column if not exists validity_days numeric default 1;

-- Backfill leader fields from host fields if empty
update public.game_tables
set leader_id = coalesce(leader_id, host_id),
    leader_name = coalesce(leader_name, host_name)
where leader_id is null;

-- Cleanup legacy standalone table_requests table (all requests are natively stored in public.game_tables)
drop table if exists public.table_requests cascade;

-- Migration: if old bloated 'players' column exists, consolidate into compact 'player_stats'
do $$
begin
  if exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'game_tables' and column_name = 'players'
  ) then
    execute $backfill$
      update public.game_tables
      set player_stats = coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', coalesce(p->>'id', ''),
              'username', coalesce(p->>'username', 'Player'),
              'avatar', coalesce(p->>'avatar', '🎲'),
              'coins', coalesce((p->>'coins')::numeric, 0),
              'isHost', coalesce((p->>'isHost')::boolean, false),
              'roundsPlayed', coalesce((p->'sessionStats'->>'roundsPlayed')::int, (p->>'roundsPlayed')::int, 0),
              'roundsWon', coalesce((p->'sessionStats'->>'roundsWon')::int, (p->>'roundsWon')::int, 0),
              'winRate', coalesce((p->'sessionStats'->>'winRate')::int, (p->>'winRate')::int, 0),
              'totalBet', coalesce((p->'sessionStats'->>'totalBet')::numeric, (p->>'totalBet')::numeric, 0),
              'totalWon', coalesce((p->'sessionStats'->>'totalWon')::numeric, (p->>'totalWon')::numeric, 0),
              'netProfit', coalesce((p->'sessionStats'->>'netProfit')::numeric, (p->>'netProfit')::numeric, 0),
              'biggestWin', coalesce((p->'sessionStats'->>'biggestWin')::numeric, (p->>'biggestWin')::numeric, 0),
              'lastActive', coalesce((p->>'lastActive')::bigint, extract(epoch from now())::bigint * 1000)
            )
          )
          from jsonb_array_elements(players) as p
        ),
        '[]'::jsonb
      )
      where (player_stats is null or player_stats = '[]'::jsonb)
        and players is not null 
        and jsonb_typeof(players) = 'array'
        and jsonb_array_length(players) > 0;
    $backfill$;
  end if;
end $$;

-- Fast lookup indexes
create index if not exists idx_game_tables_code on public.game_tables (code);
create index if not exists idx_game_tables_status on public.game_tables (status);
create index if not exists idx_game_tables_updated_at on public.game_tables (updated_at desc);

-- Enable Row Level Security
alter table public.game_tables enable row level security;

-- Policies for public reading, table creation and updates
drop policy if exists "Public game_tables read" on public.game_tables;
create policy "Public game_tables read" on public.game_tables
  for select using (true);

drop policy if exists "Enable game_tables insert for all" on public.game_tables;
create policy "Enable game_tables insert for all" on public.game_tables
  for insert with check (true);

drop policy if exists "Enable game_tables update for all" on public.game_tables;
create policy "Enable game_tables update for all" on public.game_tables
  for update using (true);

-- Only admins and only admins can delete rows from game_tables
drop policy if exists "Enable game_tables delete for all" on public.game_tables;
drop policy if exists "Admins only can delete game_tables" on public.game_tables;
drop policy if exists "Admins can delete game_tables" on public.game_tables;
create policy "Admins only can delete game_tables" on public.game_tables
  for delete using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()::text
      and profiles.is_admin = true
    )
    or
    -- Allow service_role key or superuser bypass
    current_setting('request.jwt.claims', true)::jsonb->>'role' = 'service_role'
  );

-- Enable Supabase Realtime for game_tables if publication exists
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.game_tables;
  end if;
exception
  when duplicate_object then null;
end $$;
