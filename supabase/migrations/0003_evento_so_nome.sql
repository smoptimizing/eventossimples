-- Evento é criado só com o nome: a data de início passa a ser exigida apenas para publicar.
-- O nome do evento é único na plataforma (ignorando acentos, maiúsculas e pontuação).
-- (Já incluído no 0001 para instalações novas; execute só se o 0001 foi aplicado antes desta mudança.)

create or replace function public.normalize_title(t text) returns text
language sql immutable as $$
  select trim(regexp_replace(
    translate(lower(t), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

alter table public.events alter column starts_at drop not null;
alter table public.events add constraint events_published_has_date check (status = 'draft' or starts_at is not null);
create unique index events_title_unique on public.events (public.normalize_title(title));
