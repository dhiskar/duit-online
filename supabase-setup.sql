-- Run this once in Supabase Dashboard > SQL Editor.
create table if not exists public.duit_user_data (
  user_id uuid primary key references auth.users (id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.duit_user_data enable row level security;

drop policy if exists "Users can read their own Duit data" on public.duit_user_data;
create policy "Users can read their own Duit data"
  on public.duit_user_data for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own Duit data" on public.duit_user_data;
create policy "Users can create their own Duit data"
  on public.duit_user_data for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own Duit data" on public.duit_user_data;
create policy "Users can update their own Duit data"
  on public.duit_user_data for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

revoke all on public.duit_user_data from anon;
grant select, insert, update on public.duit_user_data to authenticated;
