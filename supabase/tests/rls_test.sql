-- Pruebas de aislamiento entre usuarios y de privilegios. Falla con excepción ante el primer incumplimiento.
\set ON_ERROR_STOP on
insert into auth.users values ('00000000-0000-0000-0000-00000000000a', 'a@test'), ('00000000-0000-0000-0000-00000000000b', 'b@test'), ('00000000-0000-0000-0000-00000000000c', 'admin@test');
update public.profiles set role = 'admin' where id = '00000000-0000-0000-0000-00000000000c';

-- Usuario A crea un lugar.
set role authenticated;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', false);
insert into public.places (kind, label, lat, lon) values ('casa', 'Casa A', -31.41234, -64.18321);
do $$ begin
  if (select lat from public.places where label = 'Casa A') <> -31.412 then raise exception 'La ubicación no se redondeó a 3 decimales'; end if;
end $$;

-- A no puede crear un lugar a nombre de B.
do $$ begin
  begin
    insert into public.places (user_id, kind, label, lat, lon) values ('00000000-0000-0000-0000-00000000000b', 'casa', 'Intruso', -31.4, -64.2);
    raise exception 'FALLO: A pudo insertar un lugar de B';
  exception when insufficient_privilege or check_violation then null;
    when others then if sqlerrm like 'FALLO%' then raise; end if;
  end;
end $$;

-- Un auto sin vigilancia temporal se rechaza.
do $$ begin
  begin
    insert into public.places (kind, label, lat, lon) values ('auto', 'Auto', -31.4, -64.2);
    raise exception 'FALLO: auto sin watch_until';
  exception when check_violation then null; end;
end $$;

-- B no ve ni modifica los lugares de A.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000b","aal":"aal1"}', false);
do $$ begin
  if (select count(*) from public.places) <> 0 then raise exception 'FALLO: B ve lugares de A'; end if;
end $$;
update public.places set label = 'hackeado';
delete from public.places;

-- B no puede escribir avisos ni leer el panel operativo.
do $$ begin
  begin
    insert into public.notices (user_id, key, phenomenon, kind, level, state, title, body, source, first_seen, last_changed)
    values ('00000000-0000-0000-0000-00000000000b', 'k', 'granizo', 'oficial', 'alto', 'activo', 't', 'b', 's', now(), now());
    raise exception 'FALLO: cliente pudo escribir avisos';
  exception when insufficient_privilege then null; end;
end $$;
do $$ begin
  begin
    update public.profiles set role = 'admin';
    raise exception 'FALLO: cliente pudo cambiar su rol';
  exception when insufficient_privilege then null; end;
end $$;

-- Reporte comunitario: queda pendiente aunque el cliente intente aprobarlo, y no es apto para entrenar.
insert into public.community_reports (phenomenon, lat, lon, observed_at, status, usable_for_training) values ('granizo', -31.41, -64.18, now(), 'aprobado', true);
do $$ begin
  if exists (select 1 from public.community_reports where status <> 'pendiente' or usable_for_training) then raise exception 'FALLO: reporte autoaprobado'; end if;
end $$;
-- B no puede moderar.
update public.community_reports set status = 'aprobado';
do $$ begin
  if exists (select 1 from public.community_reports where status = 'aprobado') then raise exception 'FALLO: B moderó sin rol'; end if;
end $$;

-- A no ve el reporte pendiente de B.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000a","aal":"aal1"}', false);
do $$ begin
  if (select count(*) from public.places) <> 1 or (select label from public.places) <> 'Casa A' then raise exception 'FALLO: B alteró lugares de A'; end if;
  if (select count(*) from public.community_reports) <> 0 then raise exception 'FALLO: A ve reporte pendiente de B'; end if;
end $$;

-- Admin sin MFA (aal1) no accede al panel; con aal2 sí.
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal1"}', false);
do $$ begin
  if public.has_role('admin') then raise exception 'FALLO: admin sin MFA tiene permisos'; end if;
  if (select count(*) from public.community_reports) <> 0 then raise exception 'FALLO: admin sin MFA ve pendientes'; end if;
end $$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-0000-0000-00000000000c","aal":"aal2"}', false);
do $$ begin
  if not public.has_role('admin') then raise exception 'FALLO: admin con MFA sin permisos'; end if;
end $$;
update public.community_reports set status = 'aprobado', moderated_by = auth.uid(), moderated_at = now();
reset role;
do $$ begin
  if not exists (select 1 from public.audit_log where entity = 'community_reports') then raise exception 'FALLO: moderación sin auditoría'; end if;
end $$;

-- Anónimo: lee alertas oficiales, no lugares.
set role anon;
select set_config('request.jwt.claims', '', false);
do $$ begin
  if (select count(*) from public.places) <> 0 then raise exception 'FALLO: anónimo ve lugares'; end if;
end $$;
reset role;

-- Retención: el auto vencido se borra.
insert into public.places (user_id, kind, label, lat, lon, watch_until) values ('00000000-0000-0000-0000-00000000000a', 'auto', 'Auto', -31.4, -64.2, now() - interval '1 minute');
select public.apply_retention();
do $$ begin
  if exists (select 1 from public.places where kind = 'auto') then raise exception 'FALLO: retención no borró el auto vencido'; end if;
end $$;
select 'RLS OK' as resultado;
