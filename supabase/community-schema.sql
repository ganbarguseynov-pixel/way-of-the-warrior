-- Сообщество тренировок: публикация, поиск, лайки/дизлайки.
-- Выполнить один раз в SQL Editor проекта Supabase.

create table if not exists public.shared_workouts (
  id uuid primary key default gen_random_uuid(),
  author_key text not null,
  author_name text not null default 'Атлет',
  title text not null check (char_length(title) between 1 and 80),
  items jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.workout_votes (
  workout_id uuid not null references public.shared_workouts(id) on delete cascade,
  voter_key text not null,
  value smallint not null check (value in (-1, 1)),
  created_at timestamptz not null default now(),
  primary key (workout_id, voter_key)
);

create or replace view public.shared_workouts_rated with (security_invoker = true) as
select
  w.id, w.author_key, w.author_name, w.title, w.items, w.created_at,
  coalesce(sum(v.value), 0)::int as score,
  count(v.*) filter (where v.value = 1)::int as likes,
  count(v.*) filter (where v.value = -1)::int as dislikes
from public.shared_workouts w
left join public.workout_votes v on v.workout_id = w.id
group by w.id;

alter table public.shared_workouts enable row level security;
alter table public.workout_votes enable row level security;

drop policy if exists "shared_workouts read" on public.shared_workouts;
create policy "shared_workouts read" on public.shared_workouts for select using (true);
drop policy if exists "shared_workouts insert" on public.shared_workouts;
create policy "shared_workouts insert" on public.shared_workouts for insert with check (true);

drop policy if exists "workout_votes read" on public.workout_votes;
create policy "workout_votes read" on public.workout_votes for select using (true);
drop policy if exists "workout_votes insert" on public.workout_votes;
create policy "workout_votes insert" on public.workout_votes for insert with check (true);
drop policy if exists "workout_votes update" on public.workout_votes;
create policy "workout_votes update" on public.workout_votes for update using (true) with check (true);
drop policy if exists "workout_votes delete" on public.workout_votes;
create policy "workout_votes delete" on public.workout_votes for delete using (true);

-- Видео и фото упражнений для публичных тренировок (до 50 МБ на файл).
insert into storage.buckets (id, name, public, file_size_limit)
values ('workout-media', 'workout-media', true, 52428800)
on conflict (id) do update set public = true, file_size_limit = 52428800;

drop policy if exists "workout media read" on storage.objects;
create policy "workout media read" on storage.objects for select using (bucket_id = 'workout-media');
drop policy if exists "workout media upload" on storage.objects;
create policy "workout media upload" on storage.objects for insert with check (bucket_id = 'workout-media');
