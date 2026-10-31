-- Máximo por pessoa vazio = sem limite.
-- (Já incluído no 0001 para instalações novas; execute só se o 0001 foi aplicado antes desta mudança.)

alter table public.items alter column max_per_person drop not null;
alter table public.items drop constraint if exists items_max_per_person_check;
alter table public.items add constraint items_max_per_person_check check (max_per_person >= 1);

-- create_order: aceita quantidade sem limite quando max_per_person é nulo.
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
