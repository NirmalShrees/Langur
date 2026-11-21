-- ==============================================================================
-- GAME_TABLES_DATA MIGRATION (NAME AS DEDICATED COLUMN)
-- Run this in your Supabase SQL Editor:
-- Dashboard -> SQL Editor -> New Query -> Paste -> Click "RUN"
-- ==============================================================================

-- 1. Create public.game_tables_data if it does not exist yet (with dedicated name column)
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

-- 2. If table already existed without the name column, add it and backfill from config->>'name'
do $$
begin
  if not exists (
    select 1 from information_schema.columns 
    where table_schema = 'public' and table_name = 'game_tables_data' and column_name = 'name'
  ) then
    alter table public.game_tables_data add column name text not null default 'Game Table';
  end if;
end $$;

-- 3. Backfill name column from config->>'name' if present
update public.game_tables_data
set name = coalesce(nullif(config->>'name', ''), name)
where config ? 'name';

-- 4. Strip 'name' key from config JSONB column
update public.game_tables_data
set config = config - 'name'
where config ? 'name';

-- 5. Update default for config column (without name)
alter table public.game_tables_data
  alter column config set default '{"host": {"id": "", "name": "Host"}, "approval": {"admin_id": null, "admin_name": null, "approved_at": null}, "is_private": false, "betting_duration": 18}'::jsonb;

-- 6. Indexes for fast performance
create index if not exists game_tables_beta_status_idx on public.game_tables_data using btree (status) TABLESPACE pg_default;
create index if not exists game_tables_beta_player_count_idx on public.game_tables_data using btree (player_count) TABLESPACE pg_default;
create index if not exists game_tables_beta_updated_at_idx on public.game_tables_data using btree (updated_at desc) TABLESPACE pg_default;
create index if not exists game_tables_beta_host_id_idx on public.game_tables_data using btree ((((config -> 'host'::text) ->> 'id'::text))) TABLESPACE pg_default;
create index if not exists game_tables_beta_name_idx on public.game_tables_data using btree (name) TABLESPACE pg_default;

-- 7. Enable Row Level Security (RLS) & Permissive Policies
alter table public.game_tables_data enable row level security;

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

-- 8. Enable Supabase Realtime for game_tables_data
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.game_tables_data;
  end if;
exception
  when duplicate_object then null;
end $$;
