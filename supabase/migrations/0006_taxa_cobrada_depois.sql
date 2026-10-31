-- Primeira versão sem split: a taxa da plataforma vira débito do Cliente, pago depois.
-- Taxa padrão: 1%.
-- (Já incluído no 0001 para instalações novas; execute só se o 0001 foi aplicado antes desta mudança.)

alter table public.platform_settings alter column default_fee_percent set default 1;
update public.platform_settings set default_fee_percent = 1 where id = 1;
alter table public.organizers alter column fee_percent set default 1;
-- Clientes que estavam com a taxa padrão antiga (5%) passam para 1%. Inscrições já feitas mantêm a taxa da época.
update public.organizers set fee_percent = 1 where fee_percent = 5;

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
