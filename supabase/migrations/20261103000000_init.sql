-- Meteo-LAB · esquema inicial
-- Principios: RLS en todas las tablas, mínimos privilegios, ubicaciones redondeadas (~110 m),
-- datos crudos conservados con hash, trazabilidad de cada predicción y auditoría de cambios en modelos y reglas.

create extension if not exists postgis with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- ───────────────────────── Perfiles y roles ─────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'moderator', 'admin')),
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict do nothing;
  insert into public.notification_prefs (user_id) values (new.id) on conflict do nothing;
  return new;
end $$;

-- Rol con MFA: las funciones administrativas exigen sesión con segundo factor (aal2).
create or replace function public.has_role(wanted text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = wanted or p.role = 'admin')
  ) and coalesce(auth.jwt() ->> 'aal', 'aal1') = 'aal2';
$$;

-- ───────────────────────── Lugares guardados ─────────────────────────
create table public.places (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('casa', 'trabajo', 'auto', 'otro')),
  label text not null check (char_length(label) between 1 and 60),
  -- Minimización: 3 decimales (~110 m). La resolución de los datos es de km.
  lat numeric(7, 3) not null check (lat between -56 and -21),
  lon numeric(7, 3) not null check (lon between -74 and -53),
  geom extensions.geography(point, 4326) generated always as (extensions.st_setsrid(extensions.st_makepoint(lon::float8, lat::float8), 4326)::extensions.geography) stored,
  -- "Dejé el auto acá": vigilancia temporal. Vencida, la tarea de retención borra el lugar.
  watch_until timestamptz,
  created_at timestamptz not null default now(),
  constraint auto_watch check (kind <> 'auto' or watch_until is not null)
);
create index places_user_idx on public.places (user_id);
create index places_geom_idx on public.places using gist (geom);

-- Límite de lugares por persona (cuota).
create or replace function public.places_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.places where user_id = new.user_id) >= 10 then
    raise exception 'Llegaste al máximo de 10 lugares guardados';
  end if;
  return new;
end $$;
create trigger places_quota before insert on public.places for each row execute function public.places_quota();

-- ───────────────────────── Preferencias y suscripciones ─────────────────────────
create table public.notification_prefs (
  user_id uuid primary key references auth.users (id) on delete cascade,
  push_enabled boolean not null default false,
  min_level text not null default 'atento' check (min_level in ('atento', 'alto', 'muy_alto')),
  phenomena text[] not null default array['granizo', 'lluvia_intensa', 'anegamiento', 'tormenta'],
  quiet_start smallint check (quiet_start between 0 and 23),
  quiet_end smallint check (quiet_end between 0 and 23),
  official_always boolean not null default true,
  updated_at timestamptz not null default now()
);

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint like 'https://%' and char_length(endpoint) < 1000),
  p256dh text not null check (char_length(p256dh) < 200),
  auth text not null check (char_length(auth) < 100),
  created_at timestamptz not null default now(),
  last_ok_at timestamptz,
  failures smallint not null default 0
);
create index push_user_idx on public.push_subscriptions (user_id);

-- ───────────────────────── Ingesta: crudo, normalizado y estado ─────────────────────────
create table public.raw_payloads (
  id bigint generated always as identity primary key,
  source_id text not null,
  url text not null,
  fetched_at timestamptz not null,
  http_status smallint not null,
  content_type text,
  bytes integer not null,
  sha256 text not null,
  body text,
  unique (source_id, sha256)
);
create index raw_source_time_idx on public.raw_payloads (source_id, fetched_at desc);

create table public.source_runs (
  id bigint generated always as identity primary key,
  source_id text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  ok boolean not null,
  items integer not null default 0,
  latency_ms integer,
  data_time timestamptz,
  error text
);
create index source_runs_idx on public.source_runs (source_id, started_at desc);

create table public.official_alerts (
  id text primary key,
  source text not null default 'SMN',
  product text not null,
  msg_type text not null,
  refs text[] not null default '{}',
  event text not null,
  headline text,
  description text,
  instruction text,
  color text check (color in ('amarilla', 'naranja', 'roja')),
  color_from text,
  severity text, certainty text, urgency text,
  sent timestamptz not null,
  onset timestamptz,
  expires timestamptz,
  area_desc text,
  phenomena text[] not null default '{}',
  web text,
  polygons jsonb not null,
  raw_sha256 text,
  ingested_at timestamptz not null default now()
);
create index official_alerts_expires_idx on public.official_alerts (expires);

create table public.observations (
  source_id text not null,
  station_id text not null,
  variable text not null,
  value double precision,
  unit text not null,
  observed_at timestamptz not null,
  period_start timestamptz,
  ingested_at timestamptz not null default now(),
  quality_flags text[] not null default '{}',
  raw_sha256 text,
  primary key (source_id, station_id, variable, observed_at)
);

-- ───────────────────────── Predicciones y trazabilidad ─────────────────────────
create table public.predictions (
  id bigint generated always as identity primary key,
  cell text not null,                     -- celda de 0.05° "lat,lon"
  phenomenon text not null,
  level text not null,
  probability double precision,
  metric text not null,
  window_start timestamptz,
  window_end timestamptz,
  model_version text not null,
  -- Hashes de los datos crudos usados: permiten reconstruir cada predicción.
  inputs jsonb not null,
  shadow boolean not null default true,
  created_at timestamptz not null default now()
);
create index predictions_cell_idx on public.predictions (cell, created_at desc);

-- ───────────────────────── Avisos por persona y entregas ─────────────────────────
create table public.notices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  place_id uuid references public.places (id) on delete cascade,
  key text not null,
  phenomenon text not null,
  kind text not null check (kind in ('oficial', 'estimacion', 'observacion', 'reporte_comunitario')),
  level text not null,
  state text not null check (state in ('activo', 'resuelto', 'vencido', 'degradado')),
  title text not null,
  body text not null,
  source text not null,
  valid_to timestamptz,
  first_seen timestamptz not null,
  last_changed timestamptz not null,
  last_notified timestamptz,
  last_notified_level text,
  lower_since timestamptz,
  lower_level text,
  shadow boolean not null default false,
  unique (user_id, key)
);
create index notices_user_idx on public.notices (user_id, last_changed desc);

create table public.notice_events (
  id bigint generated always as identity primary key,
  notice_id uuid not null references public.notices (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  change text not null,
  level text not null,
  reason text not null,
  at timestamptz not null default now()
);

create table public.deliveries (
  id bigint generated always as identity primary key,
  notice_id uuid references public.notices (id) on delete set null,
  user_id uuid not null references auth.users (id) on delete cascade,
  channel text not null default 'webpush',
  status text not null check (status in ('enviado', 'fallido', 'omitido')),
  error text,
  -- Latencia desde la hora del dato de origen hasta el envío.
  latency_ms integer,
  created_at timestamptz not null default now()
);

-- ───────────────────────── Reportes comunitarios ─────────────────────────
create table public.community_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  phenomenon text not null check (phenomenon in ('granizo', 'lluvia_intensa', 'anegamiento', 'otro')),
  hail_size text check (hail_size in ('menor_1cm', '1_2cm', '2_4cm', 'mayor_4cm')),
  -- Se almacena redondeado a ~1 km: no se publica un domicilio.
  lat numeric(6, 2) not null check (lat between -56 and -21),
  lon numeric(6, 2) not null check (lon between -74 and -53),
  observed_at timestamptz not null check (observed_at <= now() + interval '5 minutes' and observed_at > now() - interval '48 hours'),
  description text check (char_length(description) <= 500),
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobado', 'rechazado')),
  moderated_by uuid references auth.users (id),
  moderated_at timestamptz,
  -- Nunca se usa como verdad de entrenamiento sin verificación cruzada.
  usable_for_training boolean not null default false,
  created_at timestamptz not null default now()
);
create index reports_status_idx on public.community_reports (status, created_at desc);

create or replace function public.reports_quota() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select count(*) from public.community_reports where user_id = new.user_id and created_at > now() - interval '1 hour') >= 5 then
    raise exception 'Demasiados reportes en la última hora';
  end if;
  new.status := 'pendiente';
  new.usable_for_training := false;
  new.moderated_by := null;
  new.moderated_at := null;
  return new;
end $$;
create trigger reports_quota before insert on public.community_reports for each row execute function public.reports_quota();

-- ───────────────────────── Modelos, reglas y auditoría ─────────────────────────
create table public.model_registry (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  version text not null,
  phenomenon text not null,
  status text not null check (status in ('shadow', 'candidate', 'promoted', 'retired')),
  metrics jsonb not null default '{}',
  card_path text,
  artifact_sha256 text,
  approved_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (name, version)
);

create table public.alert_rules (
  id uuid primary key default gen_random_uuid(),
  phenomenon text not null,
  params jsonb not null,
  version integer not null,
  active boolean not null default false,
  changed_by uuid references auth.users (id),
  changed_at timestamptz not null default now()
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid,
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  at timestamptz not null default now()
);

create or replace function public.audit_changes() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.audit_log (actor, action, entity, entity_id, before, after)
  values (auth.uid(), tg_op, tg_table_name,
          coalesce((case when tg_op = 'DELETE' then old.id else new.id end)::text, null),
          case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
          case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end);
  return coalesce(new, old);
end $$;
create trigger audit_models after insert or update or delete on public.model_registry for each row execute function public.audit_changes();
create trigger audit_rules after insert or update or delete on public.alert_rules for each row execute function public.audit_changes();
create trigger audit_reports after update on public.community_reports for each row execute function public.audit_changes();
create trigger audit_profiles after update on public.profiles for each row execute function public.audit_changes();

create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ───────────────────────── RLS ─────────────────────────
alter table public.profiles enable row level security;
alter table public.places enable row level security;
alter table public.notification_prefs enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.raw_payloads enable row level security;
alter table public.source_runs enable row level security;
alter table public.official_alerts enable row level security;
alter table public.observations enable row level security;
alter table public.predictions enable row level security;
alter table public.notices enable row level security;
alter table public.notice_events enable row level security;
alter table public.deliveries enable row level security;
alter table public.community_reports enable row level security;
alter table public.model_registry enable row level security;
alter table public.alert_rules enable row level security;
alter table public.audit_log enable row level security;

-- Cada persona ve solo lo suyo. El rol se cambia únicamente con service_role (sin política de update).
create policy profiles_self on public.profiles for select to authenticated using (id = (select auth.uid()));

create policy places_own on public.places for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy prefs_own on public.notification_prefs for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy push_own on public.push_subscriptions for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

create policy notices_own on public.notices for select to authenticated using (user_id = (select auth.uid()));
create policy notice_events_own on public.notice_events for select to authenticated using (user_id = (select auth.uid()));
create policy deliveries_own on public.deliveries for select to authenticated using (user_id = (select auth.uid()));

-- Datos públicos de fuentes oficiales: lectura para cualquiera; escritura solo service_role.
create policy official_read on public.official_alerts for select to anon, authenticated using (true);
create policy observations_read on public.observations for select to anon, authenticated using (true);

-- Reportes: crear propios; ver propios y aprobados; moderar con rol + MFA.
create policy reports_insert on public.community_reports for insert to authenticated with check (user_id = (select auth.uid()));
create policy reports_read on public.community_reports for select to authenticated
  using (user_id = (select auth.uid()) or status = 'aprobado' or public.has_role('moderator'));
create policy reports_moderate on public.community_reports for update to authenticated
  using (public.has_role('moderator')) with check (public.has_role('moderator'));
create policy reports_delete_own on public.community_reports for delete to authenticated using (user_id = (select auth.uid()));

-- Panel operativo: solo administración con MFA.
create policy ops_runs on public.source_runs for select to authenticated using (public.has_role('admin'));
create policy ops_raw on public.raw_payloads for select to authenticated using (public.has_role('admin'));
create policy ops_predictions on public.predictions for select to authenticated using (public.has_role('admin'));
create policy ops_models_read on public.model_registry for select to authenticated using (public.has_role('admin'));
create policy ops_models_write on public.model_registry for update to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy ops_rules_read on public.alert_rules for select to authenticated using (public.has_role('admin'));
create policy ops_rules_write on public.alert_rules for all to authenticated using (public.has_role('admin')) with check (public.has_role('admin'));
create policy ops_audit on public.audit_log for select to authenticated using (public.has_role('admin'));
create policy ops_deliveries on public.deliveries for select to authenticated using (public.has_role('admin'));

-- Sin permisos de escritura directa del cliente en tablas del sistema.
revoke insert, update, delete on public.official_alerts, public.observations, public.raw_payloads, public.source_runs,
  public.predictions, public.notices, public.notice_events, public.deliveries, public.audit_log from anon, authenticated;
revoke all on public.profiles from anon;
-- El perfil (y su rol) solo lo modifica service_role: el cliente no tiene permisos de escritura.
revoke insert, update, delete on public.profiles from authenticated;

-- ───────────────────────── Retención ─────────────────────────
-- La ejecuta /api/cron/retention (service_role). Plazos en docs/seguridad/privacidad.md.
create or replace function public.apply_retention() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare r jsonb := '{}';
  n integer;
begin
  delete from public.places where kind = 'auto' and watch_until < now(); get diagnostics n = row_count; r := r || jsonb_build_object('autos', n);
  delete from public.raw_payloads where fetched_at < now() - interval '30 days'; get diagnostics n = row_count; r := r || jsonb_build_object('crudos', n);
  delete from public.notices where state <> 'activo' and last_changed < now() - interval '90 days'; get diagnostics n = row_count; r := r || jsonb_build_object('avisos', n);
  delete from public.deliveries where created_at < now() - interval '90 days'; get diagnostics n = row_count; r := r || jsonb_build_object('entregas', n);
  delete from public.community_reports where status = 'rechazado' and created_at < now() - interval '30 days'; get diagnostics n = row_count; r := r || jsonb_build_object('reportes', n);
  delete from public.push_subscriptions where failures >= 5; get diagnostics n = row_count; r := r || jsonb_build_object('suscripciones', n);
  return r;
end $$;
revoke execute on function public.apply_retention() from public, anon, authenticated;
