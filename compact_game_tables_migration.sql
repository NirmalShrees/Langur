-- ==============================================================================
-- COMPACT GAME_TABLES MIGRATION FOR SUPABASE
-- Run this in your Supabase SQL Editor to streamline and compact the public.game_tables table.
-- ==============================================================================

-- 1. Add approval_meta jsonb column if it does not already exist
alter table public.game_tables 
  add column if not exists approval_meta jsonb default '{}'::jsonb;

-- 2. Backfill approval_meta from legacy admin approval columns if present
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'game_tables' and column_name = 'approved_by_admin_id') then
    update public.game_tables
    set approval_meta = jsonb_strip_nulls(jsonb_build_object(
      'admin_id', coalesce(approved_by_admin_id, approval_meta->>'admin_id'),
      'admin_name', coalesce(approved_by_admin_name, approval_meta->>'admin_name'),
      'message', coalesce(admin_approval_message, approval_meta->>'message'),
      'approved_at', coalesce(approved_at::text, approval_meta->>'approved_at')
    ))
    where approval_meta is null or approval_meta = '{}'::jsonb;
  end if;
end $$;

-- 3. Backfill approval_status from legacy approved boolean column if present
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'game_tables' and column_name = 'approved') then
    update public.game_tables
    set approval_status = case 
      when approved = true then 'approved'
      when approval_status is not null then approval_status
      else 'pending'
    end
    where approval_status is null;
  end if;
end $$;

-- 4. Backfill host_id and host_name from legacy leader columns if needed
do $$
begin
  if exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'game_tables' and column_name = 'leader_id') then
    update public.game_tables
    set host_id = coalesce(host_id, leader_id),
        host_name = coalesce(host_name, leader_name, 'Host')
    where host_id is null;
  end if;
end $$;

-- 5. Drop redundant and duplicate columns
alter table public.game_tables
  drop column if exists leader_id,
  drop column if exists leader_name,
  drop column if exists players,
  drop column if exists approved,
  drop column if exists approved_by_admin_id,
  drop column if exists approved_by_admin_name,
  drop column if exists admin_approval_message,
  drop column if exists approved_at,
  drop column if exists validity_hours,
  drop column if exists validity_days;

-- 6. Ensure proper column constraints and clean default values
alter table public.game_tables alter column status set default 'waiting';
alter table public.game_tables alter column approval_status set default 'pending';
alter table public.game_tables alter column is_private set default false;
alter table public.game_tables alter column betting_duration set default 18;
alter table public.game_tables alter column player_count set default 0;
alter table public.game_tables alter column player_stats set default '[]'::jsonb;
alter table public.game_tables alter column history set default '[]'::jsonb;
alter table public.game_tables alter column table_stats set default '{"totalBets": 0, "totalRounds": 0, "totalPayouts": 0}'::jsonb;
alter table public.game_tables alter column approval_meta set default '{}'::jsonb;

-- 7. Optimized indices
create index if not exists idx_game_tables_code on public.game_tables using btree (code);
create index if not exists idx_game_tables_status on public.game_tables using btree (status);
create index if not exists idx_game_tables_approval_status on public.game_tables using btree (approval_status);
create index if not exists idx_game_tables_host_id on public.game_tables using btree (host_id);
create index if not exists idx_game_tables_updated_at on public.game_tables using btree (updated_at desc);

-- Notification:
comment on table public.game_tables is 'Streamlined game tables with compact JSONB metadata and unified host & approval tracking.';
