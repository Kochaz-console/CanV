create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text not null check (char_length(display_name) between 1 and 40),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  created_at timestamptz not null default now()
);

create table if not exists public.daily_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  progress_date date not null,
  physics integer not null default 0 check (physics >= 0),
  chemistry integer not null default 0 check (chemistry >= 0),
  maths integer not null default 0 check (maths >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, progress_date)
);

create index if not exists daily_progress_date_idx on public.daily_progress (progress_date);
create index if not exists daily_progress_user_date_idx on public.daily_progress (user_id, progress_date desc);

create or replace function public.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_username text;
  new_display_name text;
begin
  new_username := lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(new.email, '@', 1)));
  new_display_name := coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), new_username);

  insert into public.profiles (id, username, display_name)
  values (new.id, new_username, new_display_name);
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute procedure public.create_profile_for_new_user();

create or replace function public.set_daily_progress_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists daily_progress_updated_at on public.daily_progress;
create trigger daily_progress_updated_at
  before update on public.daily_progress
  for each row execute procedure public.set_daily_progress_updated_at();

alter table public.profiles enable row level security;
alter table public.daily_progress enable row level security;

drop policy if exists "Signed-in users can view profiles" on public.profiles;
create policy "Signed-in users can view profiles"
  on public.profiles for select to authenticated using (true);

drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile"
  on public.profiles for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "Users can view their own progress" on public.daily_progress;
create policy "Users can view their own progress"
  on public.daily_progress for select to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can add their own progress" on public.daily_progress;
create policy "Users can add their own progress"
  on public.daily_progress for insert to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own progress" on public.daily_progress;
create policy "Users can update their own progress"
  on public.daily_progress for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own progress" on public.daily_progress;
create policy "Users can delete their own progress"
  on public.daily_progress for delete to authenticated
  using ((select auth.uid()) = user_id);

create or replace function public.daily_leaderboard(p_date date)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  physics integer,
  chemistry integer,
  maths integer,
  total bigint,
  rank bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(d.physics, 0),
    coalesce(d.chemistry, 0),
    coalesce(d.maths, 0),
    (coalesce(d.physics, 0)::bigint + coalesce(d.chemistry, 0) + coalesce(d.maths, 0)) as total,
    dense_rank() over (
      order by (coalesce(d.physics, 0)::bigint + coalesce(d.chemistry, 0) + coalesce(d.maths, 0)) desc
    ) as rank
  from public.profiles p
  left join public.daily_progress d on d.user_id = p.id and d.progress_date = p_date
  where auth.uid() is not null
  order by total desc, p.username asc;
$$;

create or replace function public.weekly_leaderboard(p_week_start date)
returns table (
  user_id uuid,
  username text,
  display_name text,
  avatar_url text,
  physics integer,
  chemistry integer,
  maths integer,
  total bigint,
  rank bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    p.id,
    p.username,
    p.display_name,
    p.avatar_url,
    coalesce(sum(d.physics), 0)::integer,
    coalesce(sum(d.chemistry), 0)::integer,
    coalesce(sum(d.maths), 0)::integer,
    (coalesce(sum(d.physics), 0) + coalesce(sum(d.chemistry), 0) + coalesce(sum(d.maths), 0))::bigint as total,
    dense_rank() over (
      order by (coalesce(sum(d.physics), 0) + coalesce(sum(d.chemistry), 0) + coalesce(sum(d.maths), 0)) desc
    ) as rank
  from public.profiles p
  left join public.daily_progress d
    on d.user_id = p.id and d.progress_date >= p_week_start and d.progress_date < p_week_start + 7
  where auth.uid() is not null
  group by p.id, p.username, p.display_name, p.avatar_url
  order by total desc, p.username asc;
$$;

create or replace function public.profile_stats(p_user_id uuid, p_today date)
returns table (
  total_questions bigint,
  current_streak integer,
  active_days bigint,
  physics_total bigint,
  chemistry_total bigint,
  maths_total bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive streak_days(day) as (
    select case
      when exists (select 1 from public.daily_progress where user_id = p_user_id and progress_date = p_today and physics + chemistry + maths > 0) then p_today
      when exists (select 1 from public.daily_progress where user_id = p_user_id and progress_date = p_today - 1 and physics + chemistry + maths > 0) then p_today - 1
      else null
    end
    union all
    select s.day - 1
    from streak_days s
    where s.day is not null
      and exists (select 1 from public.daily_progress where user_id = p_user_id and progress_date = s.day - 1 and physics + chemistry + maths > 0)
  )
  select
    coalesce(sum(d.physics::bigint + d.chemistry::bigint + d.maths::bigint), 0)::bigint,
    (select count(*)::integer from streak_days where day is not null),
    count(*) filter (where d.physics + d.chemistry + d.maths > 0)::bigint,
    coalesce(sum(d.physics), 0)::bigint,
    coalesce(sum(d.chemistry), 0)::bigint,
    coalesce(sum(d.maths), 0)::bigint
  from public.daily_progress d
  where d.user_id = p_user_id
    and d.progress_date <= p_today
    and auth.uid() is not null
    and exists (select 1 from public.profiles where id = p_user_id);
$$;

create or replace function public.profile_history(p_user_id uuid, p_to_date date)
returns table (
  progress_date date,
  physics integer,
  chemistry integer,
  maths integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.progress_date, d.physics, d.chemistry, d.maths
  from public.daily_progress d
  where d.user_id = p_user_id
    and d.progress_date > p_to_date - 14
    and d.progress_date <= p_to_date
    and auth.uid() is not null
  order by d.progress_date asc;
$$;

revoke all on function public.daily_leaderboard(date) from public;
revoke all on function public.weekly_leaderboard(date) from public;
revoke all on function public.profile_stats(uuid, date) from public;
revoke all on function public.profile_history(uuid, date) from public;
grant execute on function public.daily_leaderboard(date) to authenticated;
grant execute on function public.weekly_leaderboard(date) to authenticated;
grant execute on function public.profile_stats(uuid, date) to authenticated;
grant execute on function public.profile_history(uuid, date) to authenticated;

grant select on public.profiles to authenticated;
grant update (username, display_name, avatar_url) on public.profiles to authenticated;
grant select, insert, update, delete on public.daily_progress to authenticated;
