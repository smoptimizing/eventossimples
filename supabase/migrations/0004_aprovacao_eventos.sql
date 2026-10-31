-- Todo evento precisa ser aprovado pelo administrador da plataforma para ir ao ar.
-- O Cliente preenche tudo no rascunho e envia para aprovação.
-- (Já incluído no 0001 para instalações novas; execute só se o 0001 foi aplicado antes desta mudança.)

alter table public.events
  add column review_status text not null default 'none' check (review_status in ('none', 'pending', 'approved', 'rejected')),
  add column review_note text,
  add column submitted_at timestamptz,
  add column reviewed_at timestamptz;

-- Eventos que já estavam no ar continuam aprovados.
update public.events set review_status = 'approved', reviewed_at = now() where status <> 'draft';

alter table public.events add constraint events_published_needs_approval check (status = 'draft' or review_status = 'approved');

create or replace function public.guard_event_review() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    if new.review_status is distinct from old.review_status and new.review_status in ('approved', 'rejected') then
      new.reviewed_at := now();
    end if;
    -- Recusar/suspender tira o evento do ar.
    if new.review_status = 'rejected' then new.status := 'draft'; end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.review_status := 'none'; new.review_note := null; new.submitted_at := null; new.reviewed_at := null;
    return new;
  end if;
  if new.review_status is distinct from old.review_status then
    if not (new.review_status = 'pending' and old.review_status in ('none', 'rejected')) then
      raise exception 'Somente o administrador da plataforma aprova eventos.';
    end if;
    new.submitted_at := now();
  end if;
  if new.review_note is distinct from old.review_note or new.reviewed_at is distinct from old.reviewed_at then
    raise exception 'Somente o administrador da plataforma aprova eventos.';
  end if;
  return new;
end $$;
create policy "admin aprova evento" on public.events for update using (public.is_platform_admin());

create trigger events_review_guard before insert or update on public.events
  for each row execute function public.guard_event_review();
