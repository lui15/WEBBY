-- Resúmenes de datos que no son diarios por web (fichas de Google, canales de GA4...), para los agentes.
create table if not exists webby.snapshots (
  clave text primary key,
  descripcion text not null,
  datos jsonb not null,
  actualizado timestamptz not null default now()
);
alter table webby.snapshots enable row level security;
grant all on webby.snapshots to service_role;
grant select on webby.snapshots to authenticated;
create policy owner_read on webby.snapshots for select to authenticated using ((select webby.is_owner()));
