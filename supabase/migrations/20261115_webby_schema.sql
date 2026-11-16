-- =====================================================================
-- Webby · esquema propio dentro del proyecto "tramo".
-- No toca nada de public. Solo el dueño (admin de tramo) puede leer/escribir.
-- =====================================================================

create schema if not exists webby;

-- ---------- Dueño ----------
create table webby.owners (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function webby.is_owner()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from webby.owners o where o.user_id = (select auth.uid()));
$$;

-- ---------- Webs ----------
create table webby.sites (
  id text primary key,
  nombre text not null,
  dominio text not null unique,
  color text not null,
  repo_github text,
  gsc_property text,
  ga4_property_id text,
  gbp_location_id text
);

-- ---------- Métricas diarias (GSC + GA4) ----------
create table webby.metrics_daily (
  site_id text not null references webby.sites (id) on delete cascade,
  fecha date not null,
  impresiones integer,
  clics integer,
  posicion_media numeric(6,2),
  usuarios integer,
  sesiones integer,
  conversiones integer,
  updated_at timestamptz not null default now(),
  primary key (site_id, fecha)
);

create table webby.search_queries (
  site_id text not null references webby.sites (id) on delete cascade,
  fecha date not null,
  consulta text not null,
  impresiones integer not null default 0,
  clics integer not null default 0,
  posicion numeric(6,2),
  conversiones integer,
  primary key (site_id, fecha, consulta)
);
create index search_queries_site_fecha on webby.search_queries (site_id, fecha);

-- ---------- Objetivos ----------
create table webby.goals (
  site_id text not null references webby.sites (id) on delete cascade,
  mes date not null,
  solicitudes_objetivo integer not null check (solicitudes_objetivo > 0),
  primary key (site_id, mes)
);

-- ---------- Historial de cambios y acciones ----------
create table webby.actions (
  id uuid primary key default gen_random_uuid(),
  fecha timestamptz not null default now(),
  site_id text not null references webby.sites (id) on delete cascade,
  tipo text not null check (tipo in ('cambio_web','cambio_manual','aprobada','rechazada','objetivo','resena','ficha')),
  titulo text not null,
  detalle text,
  efecto text,
  efecto_dir text check (efecto_dir in ('up','down')),
  enlace text,
  origen_ref text unique
);
create index actions_fecha on webby.actions (fecha desc);

-- ---------- Agentes, chat, propuestas, informes (fases 4-7) ----------
create table webby.agents (
  id text primary key,
  nombre text not null,
  especialidad text not null,
  icono text not null,
  color text not null,
  prompt_sistema text
);

create table webby.conversations (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references webby.agents (id),
  site_id text references webby.sites (id),
  created_at timestamptz not null default now()
);

create table webby.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references webby.conversations (id) on delete cascade,
  rol text not null check (rol in ('yo','agente')),
  contenido text not null,
  adjuntos_json jsonb,
  created_at timestamptz not null default now()
);

create table webby.proposals (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null references webby.agents (id),
  idea_de text references webby.agents (id),
  site_id text not null references webby.sites (id),
  titulo text not null,
  que text not null,
  porque text not null,
  archivos_json jsonb not null default '[]',
  rama text,
  estado text not null default 'pendiente'
    check (estado in ('pendiente','aprobada','rechazada','en_progreso','pr_abierto','fusionada')),
  pr_url text,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);

create table webby.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  semana_inicio date not null unique,
  resumen text not null,
  contenido_json jsonb not null,
  created_at timestamptz not null default now()
);

create table webby.competitors (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references webby.sites (id),
  nombre text not null,
  url text,
  notas text,
  ultima_revision timestamptz
);

create table webby.push_tokens (
  token text primary key,
  plataforma text not null check (plataforma in ('android','ios','web')),
  created_at timestamptz not null default now()
);

-- ---------- Integraciones (solo Edge Functions) ----------
-- El refresh token de Google se guarda en Supabase Vault (cifrado); aquí solo su id.
create table webby.integrations (
  proveedor text primary key,
  vault_secret_id uuid,
  scopes text[],
  connected_at timestamptz,
  last_sync_at timestamptz,
  last_error text
);

create table webby.oauth_states (
  state text primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  return_to text not null,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- Seguridad
-- =====================================================================
revoke all on schema webby from anon, public;
grant usage on schema webby to authenticated, service_role;

do $$
declare t text;
begin
  foreach t in array array['owners','sites','metrics_daily','search_queries','goals','actions','agents',
                           'conversations','messages','proposals','weekly_reports','competitors','push_tokens',
                           'integrations','oauth_states']
  loop
    execute format('alter table webby.%I enable row level security', t);
    execute format('grant all on webby.%I to service_role', t);
  end loop;

  -- Tablas que ve y usa el dueño desde la app
  foreach t in array array['sites','metrics_daily','search_queries','goals','actions','agents',
                           'conversations','messages','proposals','weekly_reports','competitors','push_tokens']
  loop
    execute format('grant select, insert, update, delete on webby.%I to authenticated', t);
    execute format(
      'create policy owner_all on webby.%I for all to authenticated using ((select webby.is_owner())) with check ((select webby.is_owner()))', t);
  end loop;
end $$;

-- owners: el dueño solo puede verse a sí mismo
grant select on webby.owners to authenticated;
create policy owner_self on webby.owners for select to authenticated using (user_id = (select auth.uid()));
-- integrations y oauth_states: sin políticas => solo service_role (Edge Functions).

grant execute on function webby.is_owner() to authenticated, service_role;

-- Estado de la conexión con Google, sin exponer el token
create or replace function webby.integration_status()
returns table (proveedor text, connected_at timestamptz, last_sync_at timestamptz, last_error text)
language sql stable security definer set search_path = ''
as $$
  select i.proveedor, i.connected_at, i.last_sync_at, i.last_error
  from webby.integrations i
  where webby.is_owner();
$$;
revoke all on function webby.integration_status() from public, anon;
grant execute on function webby.integration_status() to authenticated;

-- Guardar / leer el refresh token en Vault (solo service_role)
create or replace function webby.set_google_token(p_token text, p_scopes text[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare v_id uuid;
begin
  select vault_secret_id into v_id from webby.integrations where proveedor = 'google';
  if v_id is null then
    v_id := vault.create_secret(p_token, 'webby_google_refresh_token', 'Refresh token de Google para Webby');
  else
    perform vault.update_secret(v_id, p_token);
  end if;
  insert into webby.integrations (proveedor, vault_secret_id, scopes, connected_at, last_error)
  values ('google', v_id, p_scopes, now(), null)
  on conflict (proveedor) do update
    set vault_secret_id = excluded.vault_secret_id, scopes = excluded.scopes,
        connected_at = now(), last_error = null;
end $$;

create or replace function webby.get_google_token()
returns text
language sql stable security definer set search_path = ''
as $$
  select s.decrypted_secret
  from webby.integrations i
  join vault.decrypted_secrets s on s.id = i.vault_secret_id
  where i.proveedor = 'google';
$$;

-- Secreto para que pg_cron pueda llamar a la sincronización
create or replace function webby.check_cron_secret(p text)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from vault.decrypted_secrets where name = 'webby_cron_secret' and decrypted_secret = p);
$$;

revoke all on function webby.set_google_token(text, text[]) from public, anon, authenticated;
revoke all on function webby.get_google_token() from public, anon, authenticated;
revoke all on function webby.check_cron_secret(text) from public, anon, authenticated;
grant execute on function webby.set_google_token(text, text[]) to service_role;
grant execute on function webby.get_google_token() to service_role;
grant execute on function webby.check_cron_secret(text) to service_role;

-- =====================================================================
-- Cálculos para la app
-- =====================================================================

-- Embudo por web: últimos p_days días con datos vs. los p_days anteriores.
-- Google (impresiones/clics) llega con ~2 días de retraso; GA4 (conversiones) con ~1.
create or replace function webby.funnel_summary(p_days integer default 7)
returns table (
  site_id text, datos_hasta date,
  vieron bigint, vieron_prev bigint,
  entraron bigint, entraron_prev bigint,
  contactaron bigint, contactaron_prev bigint
)
language sql stable security invoker set search_path = ''
as $$
  with fin as (
    select s.id as site_id,
           coalesce((select max(m.fecha) from webby.metrics_daily m where m.site_id = s.id and m.impresiones is not null),
                    current_date - 2) as gsc_fin,
           current_date - 1 as ga_fin
    from webby.sites s
  )
  select f.site_id, f.gsc_fin,
    coalesce(sum(m.impresiones) filter (where m.fecha >  f.gsc_fin - p_days and m.fecha <= f.gsc_fin), 0),
    coalesce(sum(m.impresiones) filter (where m.fecha >  f.gsc_fin - 2*p_days and m.fecha <= f.gsc_fin - p_days), 0),
    coalesce(sum(m.clics)       filter (where m.fecha >  f.gsc_fin - p_days and m.fecha <= f.gsc_fin), 0),
    coalesce(sum(m.clics)       filter (where m.fecha >  f.gsc_fin - 2*p_days and m.fecha <= f.gsc_fin - p_days), 0),
    coalesce(sum(m.conversiones) filter (where m.fecha > f.ga_fin - p_days and m.fecha <= f.ga_fin), 0),
    coalesce(sum(m.conversiones) filter (where m.fecha > f.ga_fin - 2*p_days and m.fecha <= f.ga_fin - p_days), 0)
  from fin f
  left join webby.metrics_daily m on m.site_id = f.site_id and m.fecha > least(f.gsc_fin, f.ga_fin) - 2*p_days
  group by f.site_id, f.gsc_fin;
$$;

-- Búsquedas principales de una web en los últimos p_days días con datos.
create or replace function webby.top_queries(p_site text, p_days integer default 7, p_limit integer default 10)
returns table (consulta text, vieron bigint, entraron bigint, puesto numeric, solicitudes bigint)
language sql stable security invoker set search_path = ''
as $$
  with fin as (
    select coalesce(max(fecha), current_date - 2) as d from webby.search_queries where site_id = p_site
  )
  select q.consulta,
         sum(q.impresiones)::bigint,
         sum(q.clics)::bigint,
         round(sum(q.posicion * q.impresiones) / nullif(sum(q.impresiones), 0), 1),
         coalesce(sum(q.conversiones), 0)::bigint
  from webby.search_queries q, fin
  where q.site_id = p_site and q.fecha > fin.d - p_days and q.fecha <= fin.d
  group by q.consulta
  order by sum(q.impresiones) desc
  limit p_limit;
$$;

grant execute on function webby.funnel_summary(integer) to authenticated;
grant execute on function webby.top_queries(text, integer, integer) to authenticated;

-- =====================================================================
-- Datos iniciales
-- =====================================================================
insert into webby.sites (id, nombre, dominio, color, gsc_property) values
  ('obralocal',   'ObraLocal',   'obralocalmadrid.es', '#C2410C', 'sc-domain:obralocalmadrid.es'),
  ('mudanzas',    'Mudanzas360', 'mudanzas360.es',     '#1C4ED8', 'sc-domain:mudanzas360.es'),
  ('armamuebles', 'ArmaMuebles', 'armamuebles.es',     '#047857', 'sc-domain:armamuebles.es');

insert into webby.agents (id, nombre, especialidad, icono, color) values
  ('seo',         'SEO',         'Google y Maps',          'search-outline',     '#047857'),
  ('marketing',   'Marketing',   'Contenido y confianza',  'brush-outline',      '#C2410C'),
  ('anuncios',    'Anuncios',    'Google Ads',             'megaphone-outline',  '#1C4ED8'),
  ('competencia', 'Competencia', 'Quién te supera',        'podium-outline',     '#B42318'),
  ('desarrollo',  'Desarrollo',  'Código y diseño',        'code-slash-outline', '#6D28D9');

insert into webby.goals (site_id, mes, solicitudes_objetivo)
select id, date_trunc('month', current_date)::date, v
from (values ('obralocal', 30), ('mudanzas', 25), ('armamuebles', 20)) as g(id, v);

-- Dueño: el administrador activo de tramo
insert into webby.owners (user_id)
select p.id from public.profiles p
where p.role = 'admin' and p.is_active and p.deleted_at is null;
