-- Avisos de los agentes (campana de Webby y notificaciones al móvil)
create table if not exists webby.avisos (
  id uuid primary key default gen_random_uuid(),
  agent_id text references webby.agents (id),
  site_id text references webby.sites (id),
  titulo text not null,
  texto text not null,
  enlace text,
  leido boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists avisos_created on webby.avisos (created_at desc);
alter table webby.avisos enable row level security;
grant all on webby.avisos to service_role;
grant select, update, delete on webby.avisos to authenticated;
create policy owner_all on webby.avisos for all to authenticated using ((select webby.is_owner())) with check ((select webby.is_owner()));

alter table webby.push_tokens add column if not exists ultimo_error text;

-- Claves VAPID: se generan en el servidor y viven cifradas en Vault
create or replace function webby.get_vapid()
returns text language sql stable security definer set search_path = ''
as $$ select decrypted_secret from vault.decrypted_secrets where name = 'webby_vapid' limit 1; $$;

create or replace function webby.set_vapid(p text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if exists (select 1 from vault.secrets where name = 'webby_vapid') then return; end if;
  perform vault.create_secret(p, 'webby_vapid', 'Claves VAPID de las notificaciones de Webby');
end $$;

revoke all on function webby.get_vapid() from public, anon, authenticated;
revoke all on function webby.set_vapid(text) from public, anon, authenticated;
grant execute on function webby.get_vapid() to service_role;
grant execute on function webby.set_vapid(text) to service_role;
