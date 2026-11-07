-- ============================================================
-- ШАХМАТНЫЕ АРЕНЫ — схема и функции
-- Выполнить один раз в Supabase → SQL Editor
-- ============================================================

-- ---------------- ТАБЛИЦЫ ----------------

create table if not exists public.arena_players (
  player_key   text primary key,
  display_name text not null default 'Игрок',
  cups         int  not null default 0 check (cups >= 0),
  wins         int  not null default 0,
  losses       int  not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.arena_matches (
  id            uuid primary key,
  arena         int  not null,
  a_key         text not null,
  b_key         text not null,
  a_cups_before int  not null,
  b_cups_before int  not null,
  a_cups_after  int  not null,
  b_cups_after  int  not null,
  winner_key    text,
  created_at    timestamptz not null default now()
);

create index if not exists arena_matches_a on public.arena_matches(a_key);
create index if not exists arena_matches_b on public.arena_matches(b_key);
create index if not exists arena_players_cups on public.arena_players(cups desc);

-- ---------------- ФУНКЦИИ РАСЧЁТА ----------------

-- арена по кубкам: 0-999 → 1, 1000-1999 → 2, ... 9000+ → 10
create or replace function public.arena_of(c int) returns int
language sql immutable as $$
  select least(10, greatest(1, floor(greatest(coalesce(c, 0), 0) / 1000)::int + 1))
$$;

-- пол арены: ниже этого значения кубки не падают
create or replace function public.arena_floor(c int) returns int
language sql immutable as $$
  select (public.arena_of(c) - 1) * 1000
$$;

-- победитель получает 31 если был слабее по кубкам, 29 если сильнее, 30 если равны
create or replace function public.arena_delta(winner_cups int, loser_cups int) returns int
language sql immutable as $$
  select case
    when winner_cups = loser_cups then 30
    when winner_cups <  loser_cups then 31
    else 29
  end
$$;

-- ---------------- РЕГИСТРАЦИЯ ИГРОКА ----------------

create or replace function public.arena_ensure_player(
  p_key  text,
  p_name text default 'Игрок',
  p_seed int  default 0
) returns public.arena_players
language plpgsql security definer set search_path = public as $$
declare r public.arena_players;
begin
  if p_key is null or length(p_key) < 3 then
    raise exception 'bad player key';
  end if;

  insert into arena_players(player_key, display_name, cups)
  values (p_key, coalesce(nullif(trim(p_name), ''), 'Игрок'), greatest(coalesce(p_seed, 0), 0))
  on conflict (player_key) do update
    set display_name = case
          when arena_players.display_name = 'Игрок'
            then coalesce(nullif(trim(excluded.display_name), ''), 'Игрок')
          else arena_players.display_name
        end,
        -- стартовые кубки из localStorage подставляем только новому, чистому аккаунту
        cups = case
          when arena_players.cups = 0
           and arena_players.wins = 0
           and arena_players.losses = 0
          then greatest(excluded.cups, arena_players.cups)
          else arena_players.cups
        end,
        updated_at = now()
  returning * into r;

  return r;
end $$;

-- ---------------- ЗАПИСЬ РЕЗУЛЬТАТА БОЯ ----------------

create or replace function public.arena_report_match(
  p_match  uuid,
  p_a      text,
  p_b      text,
  p_winner text,
  p_arena  int
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_exist   public.arena_matches;
  v_a_cups  int;
  v_b_cups  int;
  v_a_after int;
  v_b_after int;
  v_w_cups  int;
  v_l_cups  int;
  v_delta   int;
  v_loss    int;
  v_floor   int;
begin
  -- повторный вызов с тем же id возвращает уже записанный результат
  select * into v_exist from arena_matches where id = p_match;
  if found then
    return jsonb_build_object(
      'a_before', v_exist.a_cups_before,
      'a_after',  v_exist.a_cups_after,
      'b_before', v_exist.b_cups_before,
      'b_after',  v_exist.b_cups_after,
      'winner',   v_exist.winner_key,
      'replayed', true
    );
  end if;

  if p_a is null or p_b is null or p_a = p_b then
    raise exception 'bad players';
  end if;
  if p_winner is null or p_winner not in (p_a, p_b) then
    raise exception 'bad winner';
  end if;

  insert into arena_players(player_key) values (p_a) on conflict do nothing;
  insert into arena_players(player_key) values (p_b) on conflict do nothing;

  -- блокируем обе строки в детерминированном порядке: иначе возможен дедлок
  perform 1 from arena_players
   where player_key in (p_a, p_b)
   order by player_key
   for update;

  select cups into v_a_cups from arena_players where player_key = p_a;
  select cups into v_b_cups from arena_players where player_key = p_b;

  v_a_cups := coalesce(v_a_cups, 0);
  v_b_cups := coalesce(v_b_cups, 0);

  if p_winner = p_a then
    v_w_cups := v_a_cups;
    v_l_cups := v_b_cups;
  else
    v_w_cups := v_b_cups;
    v_l_cups := v_a_cups;
  end if;

  v_delta := arena_delta(v_w_cups, v_l_cups);

  -- ГЛАВНОЕ ПРАВИЛО: проигравший не падает ниже пола своей арены
  v_floor := arena_floor(v_l_cups);
  v_loss  := least(v_delta, greatest(0, v_l_cups - v_floor));

  if p_winner = p_a then
    v_a_after := v_a_cups + v_delta;
    v_b_after := v_b_cups - v_loss;
  else
    v_a_after := v_a_cups - v_loss;
    v_b_after := v_b_cups + v_delta;
  end if;

  update arena_players
     set cups   = v_a_after,
         wins   = wins   + case when p_winner = p_a then 1 else 0 end,
         losses = losses + case when p_winner = p_a then 0 else 1 end,
         updated_at = now()
   where player_key = p_a;

  update arena_players
     set cups   = v_b_after,
         wins   = wins   + case when p_winner = p_b then 1 else 0 end,
         losses = losses + case when p_winner = p_b then 0 else 1 end,
         updated_at = now()
   where player_key = p_b;

  insert into arena_matches
    (id, arena, a_key, b_key, a_cups_before, b_cups_before,
     a_cups_after, b_cups_after, winner_key)
  values
    (p_match, coalesce(p_arena, 1), p_a, p_b, v_a_cups, v_b_cups,
     v_a_after, v_b_after, p_winner);

  return jsonb_build_object(
    'a_before', v_a_cups,
    'a_after',  v_a_after,
    'b_before', v_b_cups,
    'b_after',  v_b_after,
    'winner',   p_winner,
    'a_delta',  v_a_after - v_a_cups,
    'b_delta',  v_b_after - v_b_cups
  );
end $$;

-- ---------------- ТАБЛИЦА ЛИДЕРОВ ----------------

create or replace function public.arena_top(p_limit int default 20)
returns table(
  player_key text, display_name text, cups int,
  wins int, losses int, arena int
)
language sql stable security definer set search_path = public as $$
  select player_key, display_name, cups, wins, losses, arena_of(cups)
  from arena_players
  order by cups desc, wins desc
  limit greatest(1, least(coalesce(p_limit, 20), 100))
$$;

-- ---------------- ДОСТУП ----------------

alter table public.arena_players enable row level security;
alter table public.arena_matches enable row level security;

drop policy if exists arena_players_read on public.arena_players;
create policy arena_players_read on public.arena_players
  for select using (true);

drop policy if exists arena_matches_read on public.arena_matches;
create policy arena_matches_read on public.arena_matches
  for select using (true);

-- напрямую из браузера писать нельзя — только через функции выше
revoke insert, update, delete on public.arena_players from anon, authenticated;
revoke insert, update, delete on public.arena_matches from anon, authenticated;

grant execute on function public.arena_ensure_player(text, text, int)                 to anon, authenticated;
grant execute on function public.arena_report_match(uuid, text, text, text, int)     to anon, authenticated;
grant execute on function public.arena_top(int)                                      to anon, authenticated;
grant execute on function public.arena_of(int)                                       to anon, authenticated;
grant execute on function public.arena_floor(int)                                    to anon, authenticated;
grant execute on function public.arena_delta(int, int)                               to anon, authenticated;
