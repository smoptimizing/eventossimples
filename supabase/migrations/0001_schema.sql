-- Eventos Simples — esquema completo.
-- Cliente (organizador) tem login; o acampante NÃO tem login: as inscrições são criadas
-- pelo servidor (chave secreta) através de create_order(), que valida tudo com o evento travado.

create extension if not exists pgcrypto;

-- ============================================================ Plataforma
create table public.platform_admins (
  user_id uuid primary key references auth.users on delete cascade
);

create table public.platform_settings (
  id int primary key default 1 check (id = 1),
  default_fee_percent numeric(5,2) not null default 1 check (default_fee_percent between 0 and 50)
);
insert into public.platform_settings default values;

create or replace function public.is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from platform_admins where user_id = auth.uid())
$$;

-- ============================================================ Clientes (organizadores)
create table public.organizers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null unique references auth.users on delete cascade,
  name text not null check (length(trim(name)) > 1),
  document text,
  phone text,
  email text,
  fee_percent numeric(5,2) not null default 1 check (fee_percent between 0 and 50),
  active boolean not null default true,
  -- Gateway escolhido. Gravado só pelo servidor depois de testar a credencial.
  provider text check (provider in ('asaas', 'mercadopago', 'pagbank')),
  provider_sandbox boolean not null default false,
  provider_account text,           -- PagBank: ACCO_... / Mercado Pago: user_id / Asaas: walletId (só exibição)
  provider_connected_at timestamptz,
  created_at timestamptz not null default now()
);

-- Credenciais criptografadas (AES-256-GCM). Sem políticas: só a chave secreta lê.
create table public.organizer_secrets (
  organizer_id uuid primary key references public.organizers on delete cascade,
  token_encrypted text not null,
  refresh_encrypted text,
  expires_at timestamptz
);

create or replace function public.my_organizer_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from organizers where owner_id = auth.uid()
$$;

-- Taxa, situação e gateway só mudam pelo administrador da plataforma ou pelo servidor.
create or replace function public.guard_organizer() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user in ('service_role', 'postgres', 'supabase_admin') or public.is_platform_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.fee_percent := (select default_fee_percent from platform_settings where id = 1);
    new.active := true;
    new.provider := null; new.provider_account := null; new.provider_connected_at := null; new.provider_sandbox := false;
  elsif new.fee_percent is distinct from old.fee_percent or new.active is distinct from old.active
     or new.provider is distinct from old.provider or new.provider_account is distinct from old.provider_account
     or new.provider_sandbox is distinct from old.provider_sandbox or new.provider_connected_at is distinct from old.provider_connected_at
     or new.owner_id is distinct from old.owner_id then
    raise exception 'Somente o administrador da plataforma altera taxa, situação e gateway.';
  end if;
  return new;
end $$;
create trigger organizers_guard before insert or update on public.organizers
  for each row execute function public.guard_organizer();

-- ============================================================ Eventos
-- Nome comparável: sem acentos, maiúsculas e pontuação ("Acampa  2027!" = "acampa 2027").
create or replace function public.normalize_title(t text) returns text
language sql immutable as $$
  select trim(regexp_replace(
    translate(lower(t), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
    '[^a-z0-9]+', ' ', 'g'))
$$;

create table public.events (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  title text not null check (length(trim(title)) > 1),
  theme text,
  speaker text,
  description text,
  location text,
  art_url text,
  starts_at timestamptz,                         -- pode ficar vazio no rascunho
  ends_at timestamptz,
  reg_opens_at timestamptz,
  reg_closes_at timestamptz,
  min_age int check (min_age between 0 and 120),
  max_age int check (max_age between 0 and 120),
  capacity int check (capacity > 0),
  order_expiry_hours int not null default 48 check (order_expiry_hours between 1 and 720),
  status text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  -- Aprovação do administrador da plataforma para ir ao ar (o Cliente preenche tudo antes).
  review_status text not null default 'none' check (review_status in ('none', 'pending', 'approved', 'rejected')),
  review_note text,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (max_age is null or min_age is null or max_age >= min_age),
  check (ends_at is null or ends_at >= starts_at),
  constraint events_published_has_date check (status = 'draft' or starts_at is not null),
  constraint events_published_needs_approval check (status = 'draft' or review_status = 'approved')
);
create index on public.events (organizer_id);
-- Nome único em toda a plataforma.
create unique index events_title_unique on public.events (public.normalize_title(title));

-- O Cliente só envia para aprovação; aprovar, recusar ou suspender é do administrador.
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
create trigger events_review_guard before insert or update on public.events
  for each row execute function public.guard_event_review();

create or replace function public.owns_event(p_event uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from events e join organizers o on o.id = e.organizer_id
                 where e.id = p_event and o.owner_id = auth.uid())
$$;

-- Itens: inscrição (obrigatório, criado com o evento), ônibus, camisa, crédito na cantina...
create table public.items (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  is_registration boolean not null default false,
  price numeric(10,2) not null default 0 check (price >= 0),
  options text[] not null default '{}',             -- ex.: tamanhos da camisa
  max_per_person int default 1 check (max_per_person >= 1),  -- null = sem limite
  stock int check (stock >= 0),
  requires_item_id uuid references public.items on delete set null,  -- só compra se tiver o outro
  active boolean not null default true,
  position int not null default 0,
  check (requires_item_id is null or requires_item_id <> id)
);
create unique index items_one_registration on public.items (event_id) where is_registration;

create or replace function public.event_defaults() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into items (event_id, name, is_registration, position) values (new.id, 'Inscrição', true, 0);
  return new;
end $$;
create trigger events_defaults after insert on public.events
  for each row execute function public.event_defaults();

create or replace function public.guard_item() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.is_registration and exists (select 1 from events where id = old.event_id) then
      raise exception 'A inscrição é obrigatória e não pode ser excluída.';
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.is_registration <> new.is_registration then
    raise exception 'Não é possível mudar o tipo do item.';
  end if;
  if new.is_registration then
    new.active := true; new.max_per_person := 1; new.requires_item_id := null; new.options := '{}';
  end if;
  if new.requires_item_id is not null and not exists (
    select 1 from items where id = new.requires_item_id and event_id = new.event_id) then
    raise exception 'O item exigido deve ser do mesmo evento.';
  end if;
  return new;
end $$;
create trigger items_guard before insert or update or delete on public.items
  for each row execute function public.guard_item();

-- Lotes: valem na ordem (position); o lote vigente é o primeiro dentro do período e com vagas.
create table public.lots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  name text not null check (length(trim(name)) > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  quantity int check (quantity > 0),               -- máximo de pessoas inscritas neste lote
  position int not null default 0,
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

-- Preço do item no lote (sem linha = preço padrão do item).
create table public.lot_prices (
  lot_id uuid not null references public.lots on delete cascade,
  item_id uuid not null references public.items on delete cascade,
  price numeric(10,2) not null check (price >= 0),
  primary key (lot_id, item_id)
);

-- Formulário do acampante (respondido por pessoa).
create table public.questions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  label text not null check (length(trim(label)) > 0),
  help text,
  type text not null default 'text' check (type in ('text', 'textarea', 'number', 'date', 'select', 'yesno', 'phone', 'cpf', 'cep')),
  options text[] not null default '{}',
  required boolean not null default false,
  position int not null default 0
);

-- ============================================================ Inscrições
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events on delete cascade,
  code text not null unique,
  access_key text not null default encode(gen_random_bytes(12), 'hex'),
  buyer_name text not null,
  buyer_email text not null,
  buyer_phone text,
  buyer_cpf text,
  lot_id uuid references public.lots on delete set null,
  lot_name text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'cancelled', 'expired')),
  total numeric(10,2) not null default 0,
  fee_percent numeric(5,2) not null default 0,
  fee_amount numeric(10,2) not null default 0,
  provider text,
  provider_payment_id text,
  checkout_url text,
  pix_code text,
  expires_at timestamptz not null,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index on public.orders (event_id, status);

create table public.attendees (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  event_id uuid not null references public.events on delete cascade,
  name text not null,
  birth_date date,
  answers jsonb not null default '{}',
  position int not null default 0
);
create index on public.attendees (order_id);
create index on public.attendees (event_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders on delete cascade,
  attendee_id uuid not null references public.attendees on delete cascade,
  item_id uuid references public.items on delete set null,
  item_name text not null,
  option text,
  quantity int not null check (quantity > 0),
  unit_price numeric(10,2) not null
);
create index on public.order_items (order_id);
create index on public.order_items (item_id);

/*
  paid_at automático. Confirmação manual (feita por um usuário logado, não pelo webhook) de um pedido que já
  não segurava vaga — expirado, cancelado ou pendente vencido — só passa se ainda houver vaga e estoque.
  Pagamentos confirmados pelo gateway sempre passam: o dinheiro já foi recebido.
*/
create or replace function public.guard_order() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  ev events;
  n int;
  held int;
  it record;
begin
  if new.status = 'paid' and old.status <> 'paid' and auth.uid() is not null
     and not (old.status = 'pending' and old.expires_at > now()) then
    select * into ev from events where id = old.event_id for update;
    if ev.capacity is not null then
      select count(*) into n from attendees where order_id = old.id;
      select count(*) into held from attendees a join orders o on o.id = a.order_id
        where a.event_id = ev.id and o.id <> old.id
          and (o.status = 'paid' or (o.status = 'pending' and o.expires_at > now()));
      if held + n > ev.capacity then
        raise exception 'Sem vagas para confirmar: restam % vaga(s) e esta inscrição tem % pessoa(s).', greatest(ev.capacity - held, 0), n;
      end if;
    end if;
    for it in
      select i.id, i.name, i.stock, sum(oi.quantity)::int as qty
      from order_items oi join items i on i.id = oi.item_id
      where oi.order_id = old.id and i.stock is not null
      group by i.id
    loop
      select coalesce(sum(oi.quantity), 0) into held from order_items oi join orders o on o.id = oi.order_id
        where oi.item_id = it.id and o.id <> old.id
          and (o.status = 'paid' or (o.status = 'pending' and o.expires_at > now()));
      if held + it.qty > it.stock then
        raise exception 'Sem estoque de % para confirmar: restam % unidade(s) e esta inscrição tem %.', it.name, greatest(it.stock - held, 0), it.qty;
      end if;
    end loop;
  end if;
  if new.status = 'paid' and old.status <> 'paid' then new.paid_at := coalesce(new.paid_at, now()); end if;
  if new.status <> 'paid' then new.paid_at := null; end if;
  return new;
end $$;
create trigger orders_guard before update on public.orders
  for each row execute function public.guard_order();

-- Lote vigente (null = evento sem lotes). Usar com o evento travado.
create or replace function public.current_lot(p_event uuid) returns public.lots
language sql stable security definer set search_path = public as $$
  select l.* from lots l
  where l.event_id = p_event
    and (l.starts_at is null or l.starts_at <= now())
    and (l.ends_at is null or l.ends_at > now())
    and (l.quantity is null or l.quantity > (
      select count(*) from attendees a join orders o on o.id = a.order_id
      where o.lot_id = l.id and (o.status = 'paid' or (o.status = 'pending' and o.expires_at > now()))))
  order by l.position, l.starts_at nulls first
  limit 1
$$;

/*
  Cria a inscrição. Payload:
  { "buyer": {"name","email","phone","cpf"},
    "attendees": [ {"name","birth_date","answers": {"<question_id>": "..."},
                    "items": [ {"item_id","option","quantity"} ] } ] }
  A inscrição de cada pessoa é incluída automaticamente.
*/
create or replace function public.create_order(p_event uuid, p_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  ev events;
  org organizers;
  lot lots;
  has_lots boolean;
  reg items;
  att jsonb;
  sel jsonb;
  it items;
  q questions;
  n int;
  held int;
  age int;
  qty int;
  opt text;
  ans text;
  v_price numeric(10,2);
  v_total numeric(10,2) := 0;
  v_order orders;
  v_att uuid;
  v_code text;
  pos int := 0;
  chosen uuid[];
  wanted jsonb := '{}';   -- item_id -> quantidade pedida neste pedido
  k text;
begin
  select * into ev from events where id = p_event for update;
  if not found then raise exception 'Evento não encontrado.'; end if;
  select * into org from organizers where id = ev.organizer_id;
  if ev.status <> 'published' or not org.active then raise exception 'As inscrições deste evento não estão abertas.'; end if;
  if ev.reg_opens_at is not null and now() < ev.reg_opens_at then raise exception 'As inscrições ainda não começaram.'; end if;
  if ev.reg_closes_at is not null and now() > ev.reg_closes_at then raise exception 'As inscrições estão encerradas.'; end if;

  n := jsonb_array_length(coalesce(p_payload->'attendees', '[]'));
  if n = 0 then raise exception 'Informe pelo menos uma pessoa.'; end if;
  if n > 30 then raise exception 'Máximo de 30 pessoas por inscrição.'; end if;
  if length(trim(coalesce(p_payload#>>'{buyer,name}', ''))) < 3 then raise exception 'Informe o nome do responsável.'; end if;
  if coalesce(p_payload#>>'{buyer,email}', '') !~ '^\S+@\S+\.\S+$' then raise exception 'Informe um e-mail válido.'; end if;

  -- Vagas do evento
  select count(*) into held from attendees a join orders o on o.id = a.order_id
    where a.event_id = ev.id and (o.status = 'paid' or (o.status = 'pending' and o.expires_at > now()));
  if ev.capacity is not null and held + n > ev.capacity then
    if ev.capacity - held <= 0 then raise exception 'Vagas esgotadas.'; end if;
    raise exception 'Restam apenas % vaga(s).', ev.capacity - held;
  end if;

  -- Lote
  has_lots := exists (select 1 from lots where event_id = ev.id);
  if has_lots then
    lot := current_lot(ev.id);
    if lot.id is null then raise exception 'Não há lote disponível no momento.'; end if;
    if lot.quantity is not null then
      select count(*) into held from attendees a join orders o on o.id = a.order_id
        where o.lot_id = lot.id and (o.status = 'paid' or (o.status = 'pending' and o.expires_at > now()));
      if held + n > lot.quantity then raise exception 'Restam apenas % vaga(s) no lote %.', lot.quantity - held, lot.name; end if;
    end if;
  end if;

  select * into reg from items where event_id = ev.id and is_registration;

  loop
    v_code := substr(translate(upper(encode(gen_random_bytes(6), 'base64')), '+/=0O1IL', ''), 1, 6);
    exit when length(v_code) = 6 and not exists (select 1 from orders where code = v_code);
  end loop;

  insert into orders (event_id, code, buyer_name, buyer_email, buyer_phone, buyer_cpf, lot_id, lot_name,
                      fee_percent, expires_at)
  values (ev.id, v_code, trim(p_payload#>>'{buyer,name}'), lower(trim(p_payload#>>'{buyer,email}')),
          nullif(trim(p_payload#>>'{buyer,phone}'), ''), nullif(regexp_replace(coalesce(p_payload#>>'{buyer,cpf}', ''), '\D', '', 'g'), ''),
          lot.id, lot.name, org.fee_percent, now() + make_interval(hours => ev.order_expiry_hours))
  returning * into v_order;

  for att in select * from jsonb_array_elements(p_payload->'attendees') loop
    pos := pos + 1;
    if length(trim(coalesce(att->>'name', ''))) < 3 then raise exception 'Pessoa %: informe o nome completo.', pos; end if;
    if (ev.min_age is not null or ev.max_age is not null) then
      if coalesce(att->>'birth_date', '') = '' then raise exception '%: informe a data de nascimento.', att->>'name'; end if;
      age := extract(year from age(ev.starts_at::date, (att->>'birth_date')::date));
      if ev.min_age is not null and age < ev.min_age then
        raise exception '% terá % anos no evento; idade mínima: %.', att->>'name', age, ev.min_age; end if;
      if ev.max_age is not null and age > ev.max_age then
        raise exception '% terá % anos no evento; idade máxima: %.', att->>'name', age, ev.max_age; end if;
    end if;

    -- Formulário
    for q in select * from questions where event_id = ev.id loop
      ans := trim(coalesce(att#>>array['answers', q.id::text], ''));
      if q.required and ans = '' then raise exception '%: responda "%".', att->>'name', q.label; end if;
      if ans <> '' and q.type = 'select' and not (ans = any(q.options)) then
        raise exception '%: opção inválida em "%".', att->>'name', q.label; end if;
    end loop;

    insert into attendees (order_id, event_id, name, birth_date, answers, position)
    values (v_order.id, ev.id, trim(att->>'name'), nullif(att->>'birth_date', '')::date,
            coalesce((select jsonb_object_agg(key, value) from jsonb_each(att->'answers')
                      where key in (select id::text from questions where event_id = ev.id) and coalesce(value #>> '{}', '') <> ''), '{}'),
            pos)
    returning id into v_att;

    -- Inscrição (obrigatória)
    v_price := coalesce((select price from lot_prices where lot_id = lot.id and item_id = reg.id), reg.price);
    insert into order_items (order_id, attendee_id, item_id, item_name, quantity, unit_price)
      values (v_order.id, v_att, reg.id, reg.name, 1, v_price);
    v_total := v_total + v_price;
    wanted := jsonb_set(wanted, array[reg.id::text], to_jsonb(coalesce((wanted->>reg.id::text)::int, 0) + 1));
    chosen := array[reg.id];

    for sel in select * from jsonb_array_elements(coalesce(att->'items', '[]')) loop
      select * into it from items where id = (sel->>'item_id')::uuid and event_id = ev.id;
      if not found or it.is_registration then continue; end if;
      if not it.active then raise exception 'O item % não está disponível.', it.name; end if;
      if it.id = any(chosen) then raise exception '%: item % repetido.', att->>'name', it.name; end if;
      qty := coalesce((sel->>'quantity')::int, 1);
      if qty < 1 then raise exception '%: quantidade de % inválida.', att->>'name', it.name; end if;
      if qty > it.max_per_person then
        raise exception '%: quantidade de % deve ser de 1 a %.', att->>'name', it.name, it.max_per_person; end if;
      opt := nullif(trim(coalesce(sel->>'option', '')), '');
      if cardinality(it.options) > 0 and (opt is null or not (opt = any(it.options))) then
        raise exception '%: escolha a opção de %.', att->>'name', it.name; end if;
      if cardinality(it.options) = 0 then opt := null; end if;
      chosen := chosen || it.id;
      v_price := coalesce((select price from lot_prices where lot_id = lot.id and item_id = it.id), it.price);
      insert into order_items (order_id, attendee_id, item_id, item_name, option, quantity, unit_price)
        values (v_order.id, v_att, it.id, it.name, opt, qty, v_price);
      v_total := v_total + v_price * qty;
      wanted := jsonb_set(wanted, array[it.id::text], to_jsonb(coalesce((wanted->>it.id::text)::int, 0) + qty));
    end loop;

    -- Dependências: cada item exigido precisa estar na mesma pessoa.
    for it in select * from items where id = any(chosen) and requires_item_id is not null loop
      if not (it.requires_item_id = any(chosen)) then
        raise exception '%: % exige %.', att->>'name', it.name, (select name from items where id = it.requires_item_id);
      end if;
    end loop;
  end loop;

  -- Estoque dos itens
  for k in select jsonb_object_keys(wanted) loop
    select * into it from items where id = k::uuid;
    if it.stock is not null then
      select coalesce(sum(oi.quantity), 0) into held from order_items oi join orders o on o.id = oi.order_id
        where oi.item_id = it.id and o.id <> v_order.id
          and (o.status = 'paid' or (o.status = 'pending' and o.expires_at > now()));
      if held + (wanted->>k)::int > it.stock then
        if it.stock - held <= 0 then raise exception '% esgotado.', it.name; end if;
        raise exception 'Restam apenas % unidade(s) de %.', it.stock - held, it.name;
      end if;
    end if;
  end loop;

  update orders set total = v_total,
    fee_amount = round(v_total * fee_percent / 100, 2),
    status = case when v_total = 0 then 'paid' else 'pending' end
  where id = v_order.id
  returning * into v_order;

  return jsonb_build_object('id', v_order.id, 'code', v_order.code, 'access_key', v_order.access_key,
                            'total', v_order.total, 'status', v_order.status);
end $$;

revoke all on function public.create_order(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_order(uuid, jsonb) to service_role;

-- Disponibilidade pública (vagas restantes, lote vigente e estoque) para a página do evento.
create or replace function public.event_availability(p_event uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  with ev as (select * from events where id = p_event and status in ('published', 'closed')),
  held as (
    select count(*) as n from attendees a join orders o on o.id = a.order_id
    where a.event_id = p_event and (o.status = 'paid' or (o.status = 'pending' and o.expires_at > now()))
  ),
  lot as (select * from current_lot(p_event) where id is not null)
  select jsonb_build_object(
    'remaining', (select case when ev.capacity is null then null else greatest(ev.capacity - held.n, 0) end from ev, held),
    'has_lots', exists (select 1 from lots where event_id = p_event),
    'lot', (select jsonb_build_object('id', lot.id, 'name', lot.name, 'ends_at', lot.ends_at) from lot),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', i.id,
        'price', coalesce((select lp.price from lot_prices lp join lot on lot.id = lp.lot_id where lp.item_id = i.id), i.price),
        'remaining', case when i.stock is null then null else greatest(i.stock - coalesce((
          select sum(oi.quantity) from order_items oi join orders o on o.id = oi.order_id
          where oi.item_id = i.id and (o.status = 'paid' or (o.status = 'pending' and o.expires_at > now()))), 0), 0) end))
      from items i where i.event_id = p_event and i.active), '[]'))
  from ev
$$;

-- ============================================================ Segurança (RLS)
alter table public.platform_admins enable row level security;
alter table public.platform_settings enable row level security;
alter table public.organizers enable row level security;
alter table public.organizer_secrets enable row level security;
alter table public.events enable row level security;
alter table public.items enable row level security;
alter table public.lots enable row level security;
alter table public.lot_prices enable row level security;
alter table public.questions enable row level security;
alter table public.orders enable row level security;
alter table public.attendees enable row level security;
alter table public.order_items enable row level security;

create policy "admin vê a si mesmo" on public.platform_admins for select using (user_id = auth.uid());
create policy "configuração legível" on public.platform_settings for select using (true);
create policy "admin altera configuração" on public.platform_settings for update using (public.is_platform_admin());

create policy "dono ou admin vê cliente" on public.organizers for select using (owner_id = auth.uid() or public.is_platform_admin());
create policy "usuário cria seu cliente" on public.organizers for insert to authenticated with check (owner_id = auth.uid());
create policy "dono ou admin edita cliente" on public.organizers for update using (owner_id = auth.uid() or public.is_platform_admin());

create policy "eventos públicos ou do dono" on public.events for select
  using (status in ('published', 'closed') or organizer_id = public.my_organizer_id() or public.is_platform_admin());
create policy "dono cria evento" on public.events for insert with check (organizer_id = public.my_organizer_id());
create policy "dono edita evento" on public.events for update using (organizer_id = public.my_organizer_id())
  with check (organizer_id = public.my_organizer_id());
create policy "admin aprova evento" on public.events for update using (public.is_platform_admin());
create policy "dono exclui evento sem inscrições" on public.events for delete
  using (organizer_id = public.my_organizer_id() and not exists (select 1 from orders where event_id = events.id));

-- Configuração do evento: pública quando o evento é público; o dono gerencia.
create policy "itens visíveis" on public.items for select using (exists (select 1 from events e where e.id = event_id));
create policy "dono gerencia itens" on public.items for all using (public.owns_event(event_id)) with check (public.owns_event(event_id));
create policy "lotes visíveis" on public.lots for select using (exists (select 1 from events e where e.id = event_id));
create policy "dono gerencia lotes" on public.lots for all using (public.owns_event(event_id)) with check (public.owns_event(event_id));
create policy "preços visíveis" on public.lot_prices for select using (exists (select 1 from lots l where l.id = lot_id));
create policy "dono gerencia preços" on public.lot_prices for all
  using (public.owns_event((select event_id from public.lots where id = lot_id)))
  with check (public.owns_event((select event_id from public.lots where id = lot_id)));
create policy "perguntas visíveis" on public.questions for select using (exists (select 1 from events e where e.id = event_id));
create policy "dono gerencia perguntas" on public.questions for all using (public.owns_event(event_id)) with check (public.owns_event(event_id));

-- Inscrições: só o dono do evento (e o admin da plataforma) leem; criação apenas pelo servidor.
create policy "dono vê inscrições" on public.orders for select using (public.owns_event(event_id) or public.is_platform_admin());
create policy "dono atualiza situação" on public.orders for update using (public.owns_event(event_id));
create policy "dono vê pessoas" on public.attendees for select using (public.owns_event(event_id) or public.is_platform_admin());
create policy "dono vê itens do pedido" on public.order_items for select
  using (exists (select 1 from orders o where o.id = order_id and (public.owns_event(o.event_id) or public.is_platform_admin())));

-- O dono só muda a situação do pedido (confirmar pagamento recebido por fora, cancelar).
revoke update on public.orders from anon, authenticated;
grant update (status) on public.orders to authenticated;

-- ============================================================ Taxa da plataforma (cobrança posterior)
-- Sem split: a taxa de cada inscrição paga (orders.fee_amount) vira um débito do Cliente,
-- quitado depois; o administrador registra aqui os pagamentos recebidos.
create table public.fee_payments (
  id uuid primary key default gen_random_uuid(),
  organizer_id uuid not null references public.organizers on delete cascade,
  amount numeric(10,2) not null check (amount > 0),
  paid_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
create index on public.fee_payments (organizer_id);
alter table public.fee_payments enable row level security;
create policy "cliente vê seus pagamentos" on public.fee_payments for select
  using (organizer_id = public.my_organizer_id() or public.is_platform_admin());
create policy "admin registra pagamentos" on public.fee_payments for insert with check (public.is_platform_admin());
create policy "admin exclui pagamentos" on public.fee_payments for delete using (public.is_platform_admin());

-- ============================================================ Arte dos eventos
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-art', 'event-art', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy "arte pública" on storage.objects for select using (bucket_id = 'event-art');
create policy "cliente envia arte" on storage.objects for insert to authenticated
  with check (bucket_id = 'event-art' and (storage.foldername(name))[1] = public.my_organizer_id()::text);
create policy "cliente troca arte" on storage.objects for update to authenticated
  using (bucket_id = 'event-art' and (storage.foldername(name))[1] = public.my_organizer_id()::text);
create policy "cliente apaga arte" on storage.objects for delete to authenticated
  using (bucket_id = 'event-art' and (storage.foldername(name))[1] = public.my_organizer_id()::text);
