-- AMS2 Race Randomizer schema for Supabase
-- Run in Supabase Dashboard -> SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Следующая гонка',
  is_current boolean not null default true,
  voting_open boolean not null default true,
  result jsonb,
  created_at timestamptz not null default now()
);
create unique index if not exists one_current_event on public.events (is_current) where is_current = true;

create table if not exists public.options (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('track','car_class','weather')),
  label text not null,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.votes (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  nickname text not null,
  selections jsonb not null,
  created_at timestamptz not null default now(),
  unique(event_id, nickname)
);

alter table public.admin_users enable row level security;
alter table public.events enable row level security;
alter table public.options enable row level security;
alter table public.votes enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public
as $$ select exists(select 1 from public.admin_users where user_id = auth.uid()); $$;

-- Public can read current event, active choices, and aggregate vote records for this small private group.
create policy "read events" on public.events for select using (true);
create policy "read active options" on public.options for select using (active = true or public.is_admin());
create policy "read votes" on public.votes for select using (true);
create policy "admin manage events" on public.events for all using (public.is_admin()) with check (public.is_admin());
create policy "admin manage options" on public.options for all using (public.is_admin()) with check (public.is_admin());

-- For a small private group, nickname is the participant identifier. Anyone can upsert a vote
-- while voting is open; app-level validation requires one selection per category.
create policy "vote while open" on public.votes for insert with check (
  exists(select 1 from public.events e where e.id = event_id and e.voting_open = true and e.is_current = true)
);
create policy "update vote while open" on public.votes for update using (
  exists(select 1 from public.events e where e.id = event_id and e.voting_open = true and e.is_current = true)
) with check (
  exists(select 1 from public.events e where e.id = event_id and e.voting_open = true and e.is_current = true)
);
create policy "admin delete votes" on public.votes for delete using (public.is_admin());
create policy "read admin list" on public.admin_users for select using (auth.uid() = user_id);

-- Weighted draw runs on the database, only for authenticated admins.
create or replace function public.draw_weighted(p_event_id uuid)
returns jsonb language plpgsql security definer
set search_path = public
as $$
declare
  ev public.events%rowtype;
  chosen_track text;
  chosen_class text;
  chosen_weather text;
  result_json jsonb;
begin
  if not public.is_admin() then raise exception 'admin only'; end if;
  select * into ev from public.events where id = p_event_id and is_current = true for update;
  if not found then raise exception 'current event not found'; end if;

  -- Each vote contributes one ticket to its selected option. Zero-vote options are excluded.
  with tally as (
    select v.selections->>'track' as label, count(*)::int as weight
    from public.votes v where v.event_id=p_event_id group by 1
  )
  select label into chosen_track from tally where weight>0 order by -ln(greatest(random(),0.0000001))/weight limit 1;

  with tally as (
    select v.selections->>'car_class' as label, count(*)::int as weight
    from public.votes v where v.event_id=p_event_id group by 1
  )
  select label into chosen_class from tally where weight>0 order by -ln(greatest(random(),0.0000001))/weight limit 1;

  with tally as (
    select v.selections->>'weather' as label, count(*)::int as weight
    from public.votes v where v.event_id=p_event_id group by 1
  )
  select label into chosen_weather from tally where weight>0 order by -ln(greatest(random(),0.0000001))/weight limit 1;

  -- Fallback to random active option if nobody voted in a category.
  if chosen_track is null then select label into chosen_track from public.options where active and category='track' order by random() limit 1; end if;
  if chosen_class is null then select label into chosen_class from public.options where active and category='car_class' order by random() limit 1; end if;
  if chosen_weather is null then select label into chosen_weather from public.options where active and category='weather' order by random() limit 1; end if;

  result_json=jsonb_build_object('track',chosen_track,'car_class',chosen_class,'weather',chosen_weather,'drawn_at',now());
  update public.events set voting_open=false,result=result_json where id=p_event_id;
  return result_json;
end $$;

-- Bootstrap an initial event and example options.
insert into public.events(title,is_current,voting_open)
select 'AMS2 Race Night #1',true,true
where not exists(select 1 from public.events where is_current=true);

insert into public.options(category,label,sort_order) values
('track','Spa-Francorchamps',1),('track','Interlagos',2),('track','Bathurst',3),('track','Nürburgring GP',4),
('car_class','GT3',1),('car_class','GT4',2),('car_class','GTE',3),('car_class','Group C',4),
('weather','Ясно',1),('weather','Облачно',2),('weather','Дождь',3),('weather','Переменная погода',4)
on conflict do nothing;

-- После создания пользователя через Authentication -> Users, выдай ему права администратора:
-- insert into public.admin_users(user_id) values ('UUID_ПОЛЬЗОВАТЕЛЯ');
