-- Perguntas do formulário com máscara: Telefone, CPF e CEP.
-- (Já incluído no 0001 para instalações novas; execute só se o 0001 foi aplicado antes desta mudança.)
alter table public.questions drop constraint if exists questions_type_check;
alter table public.questions add constraint questions_type_check
  check (type in ('text', 'textarea', 'number', 'date', 'select', 'yesno', 'phone', 'cpf', 'cep'));
