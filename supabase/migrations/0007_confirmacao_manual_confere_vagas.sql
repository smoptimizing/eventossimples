-- Confirmação manual de inscrição expirada/cancelada só se ainda houver vaga e estoque.

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
