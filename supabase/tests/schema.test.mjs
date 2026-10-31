import { PGlite } from '@electric-sql/pglite';
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto';
import fs from 'node:fs';

// Testa o esquema num Postgres embarcado (PGlite), simulando auth/storage do Supabase.
// Uso: npm run test:db

const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
create role anon; create role authenticated; create role service_role;
create schema auth;
create table auth.users(id uuid primary key, email text);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true),'')::uuid $$;
create schema storage;
create table storage.buckets(id text primary key, name text, public bool, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
create function storage.foldername(name text) returns text[] language sql as $$ select (string_to_array(name,'/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
alter table storage.objects enable row level security;
grant usage on schema auth, storage to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
grant usage on schema public to authenticated, anon, service_role;
alter default privileges in schema public grant all on tables to authenticated, anon, service_role;
alter default privileges in schema public grant execute on functions to authenticated, anon, service_role;
`);
await db.exec(fs.readFileSync(new URL('../migrations/0001_schema.sql', import.meta.url), 'utf8'));
await db.exec(`alter role service_role bypassrls; grant all on all tables in schema public to service_role;`);

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
const ADM = '44444444-4444-4444-4444-444444444444';
await db.exec(`insert into auth.users values ('${A}','a@x.com'),('${B}','b@x.com'),('${ADM}','adm@x.com'); insert into platform_admins values ('${ADM}')`);

let failures = 0;
async function as(uid, sql, params = [], role) {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false);`);
  await db.exec(`set role ${role ?? (uid ? 'authenticated' : 'anon')}`);
  try { return (await db.query(sql, params)).rows; } finally { await db.exec('reset role'); }
}
const server = (sql, params) => as(null, sql, params, 'service_role');
async function ok(label, fn) {
  try { const r = await fn(); console.log('OK  ', label, r !== undefined ? JSON.stringify(r).slice(0, 160) : ''); return r; }
  catch (e) { failures++; console.log('FAIL', label, e.message); }
}
async function err(label, fn, match) {
  try { await fn(); failures++; console.log('FAIL (no error)', label); }
  catch (e) {
    if (match && !e.message.includes(match)) { failures++; console.log('FAIL (wrong error)', label, e.message); }
    else console.log('OK  ', label, '->', e.message);
  }
}
const order = (payload) => server(`select create_order($1, $2) as r`, [ev.id, JSON.stringify(payload)]).then((r) => r[0].r);
const buyer = { name: 'Maria Souza', email: 'maria@x.com', cpf: '123.456.789-09' };

await db.exec(`update platform_settings set default_fee_percent = 7`);
const [org] = await ok('A cria cliente (taxa padrão forçada)', () => as(A, `insert into organizers(owner_id, name, fee_percent) values($1,'Igreja A', 0) returning id, fee_percent`, [A]));
if (Number(org.fee_percent) !== 7) { failures++; console.log('FAIL taxa padrão não aplicada'); }
await err('A não muda a própria taxa', () => as(A, `update organizers set fee_percent = 1 where id=$1`, [org.id]), 'administrador');
await ok('A muda o nome', () => as(A, `update organizers set name='Igreja A2' where id=$1 returning name`, [org.id]));
await ok('admin muda a taxa', () => as(ADM, `update organizers set fee_percent = 6 where id=$1 returning fee_percent`, [org.id]));
await ok('servidor grava gateway', () => server(`update organizers set provider='asaas' where id=$1 returning provider`, [org.id]));
await ok('B não vê cliente de A', async () => { const r = await as(B, `select * from organizers`); if (r.length) throw new Error('vazou'); return r.length; });

const [ev] = await ok('A cria evento', () => as(A, `insert into events(organizer_id, slug, title, starts_at, capacity, min_age, max_age)
  values($1,'acampa-2027','Acampa 2027', '2027-01-20', 3, 10, 30) returning id`, [org.id]));
const [reg] = await ok('inscrição criada automaticamente', () => as(A, `select id, name from items where event_id=$1 and is_registration`, [ev.id]));
await err('não exclui a inscrição', () => as(A, `delete from items where id=$1`, [reg.id]), 'obrigatória');
await err('B não cria evento para A', () => as(B, `insert into events(organizer_id, slug, title, starts_at) values($1,'x-y','X', now())`, [org.id]), 'row-level security');
await ok('anon não vê rascunho', async () => { const r = await as(null, `select * from items where event_id=$1`, [ev.id]); if (r.length) throw new Error('vazou'); return 0; });

await as(A, `update items set price = 200 where id=$1`, [reg.id]);
const [bus] = await as(A, `insert into items(event_id, name, price) values($1,'Ônibus',80) returning id`, [ev.id]);
const [shirt] = await as(A, `insert into items(event_id, name, price, options, stock) values($1,'Camisa',40,'{P,M,G}',2) returning id`, [ev.id]);
const [snack] = await as(A, `insert into items(event_id, name, price, max_per_person, requires_item_id) values($1,'Lanche na viagem',10,3,$2) returning id`, [ev.id, bus.id]);
const [q1] = await as(A, `insert into questions(event_id, label, type, required) values($1,'Alergias','text',true) returning id`, [ev.id]);
const [q2] = await as(A, `insert into questions(event_id, label, type, options) values($1,'Igreja','select','{Central,Norte}') returning id`, [ev.id]);
const [l1] = await as(A, `insert into lots(event_id, name, quantity, position) values($1,'1º lote',2,1) returning id`, [ev.id]);
const [l2] = await as(A, `insert into lots(event_id, name, position) values($1,'2º lote',2) returning id`, [ev.id]);
await as(A, `insert into lot_prices values($1,$2,150)`, [l1.id, reg.id]);

await err('não inscreve em rascunho', () => order({ buyer, attendees: [{ name: 'João', birth_date: '2010-01-01' }] }), 'não estão abertas');
await err('não publica sem aprovação', () => as(A, `update events set status='published' where id=$1`, [ev.id]), 'needs_approval');
await err('cliente não se aprova', () => as(A, `update events set review_status='approved' where id=$1`, [ev.id]), 'administrador');
await ok('cliente envia para aprovação', () => as(A, `update events set review_status='pending' where id=$1 returning review_status, submitted_at is not null as s`, [ev.id]));
await ok('admin aprova', () => as(ADM, `update events set review_status='approved' where id=$1 returning reviewed_at is not null as r`, [ev.id]));
await ok('cliente publica após aprovação', () => as(A, `update events set status='published' where id=$1 returning status`, [ev.id]));
await ok('anon vê disponibilidade', () => as(null, `select event_availability($1) as a`, [ev.id]));
await err('anon não chama create_order', () => as(null, `select create_order($1,'{}')`, [ev.id]), 'permission denied');

await err('idade mínima', () => order({ buyer, attendees: [{ name: 'Pedro Pequeno', birth_date: '2020-01-01', answers: { [q1.id]: 'nenhuma' } }] }), 'idade mínima');
await err('pergunta obrigatória', () => order({ buyer, attendees: [{ name: 'Pedro Silva', birth_date: '2010-01-01' }] }), 'Alergias');
await err('dependência', () => order({ buyer, attendees: [{ name: 'Pedro Silva', birth_date: '2010-01-01', answers: { [q1.id]: 'não' },
  items: [{ item_id: snack.id, quantity: 2 }] }] }), 'exige');
await err('opção obrigatória', () => order({ buyer, attendees: [{ name: 'Pedro Silva', birth_date: '2010-01-01', answers: { [q1.id]: 'não' },
  items: [{ item_id: shirt.id }] }] }), 'opção');

const o1 = await ok('pedido com 2 pessoas no 1º lote', () => order({ buyer, attendees: [
  { name: 'Pedro Silva', birth_date: '2010-01-01', answers: { [q1.id]: 'não', [q2.id]: 'Central', lixo: 'x' },
    items: [{ item_id: bus.id }, { item_id: snack.id, quantity: 2 }, { item_id: shirt.id, option: 'M' }] },
  { name: 'Ana Silva', birth_date: '2008-05-05', answers: { [q1.id]: 'camarão' }, items: [{ item_id: shirt.id, option: 'G' }] },
] }));
// 150 + 80 + 20 + 40 + 150 + 40 = 480
if (Number(o1?.total) !== 480) { failures++; console.log('FAIL total esperado 480, veio', o1?.total); }
await ok('taxa do cliente no pedido', () => server(`select fee_percent, fee_amount, lot_name from orders where id=$1`, [o1.id]));
await ok('resposta inválida descartada', () => server(`select answers from attendees where order_id=$1 order by position limit 1`, [o1.id]));
await err('camisa esgotada', () => order({ buyer, attendees: [{ name: 'Lucas Lima', birth_date: '2010-01-01', answers: { [q1.id]: 'não' }, items: [{ item_id: shirt.id, option: 'P' }] }] }), 'esgotado');
const o2 = await ok('3ª pessoa vai para o 2º lote (preço padrão)', () => order({ buyer, attendees: [{ name: 'Lucas Lima', birth_date: '2010-01-01', answers: { [q1.id]: 'não' } }] }));
if (Number(o2?.total) !== 200) { failures++; console.log('FAIL total esperado 200, veio', o2?.total); }
await err('vagas esgotadas', () => order({ buyer, attendees: [{ name: 'Carla Dias', birth_date: '2010-01-01', answers: { [q1.id]: 'não' } }] }), 'esgotadas');

await ok('A vê inscrições', () => as(A, `select code, status, total from orders where event_id=$1`, [ev.id]));
await ok('B não vê inscrições', async () => { const r = await as(B, `select * from attendees`); if (r.length) throw new Error('vazou'); return 0; });
await err('A não altera total', () => as(A, `update orders set total = 1 where id=$1`, [o2.id]), 'permission denied');
await ok('A cancela pedido e libera vaga', () => as(A, `update orders set status='cancelled' where id=$1 returning status`, [o2.id]));
const o3 = await ok('nova inscrição após cancelamento', () => order({ buyer, attendees: [{ name: 'Carla Dias', birth_date: '2010-01-01', answers: { [q1.id]: 'não' } }] }));
await ok('servidor confirma pagamento (paid_at)', () => server(`update orders set status='paid' where id=$1 returning paid_at is not null as ok`, [o1.id]));
await ok('pedido expirado libera vaga', async () => {
  await server(`update orders set expires_at = now() - interval '1 minute' where status = 'pending'`);
  return (await as(null, `select event_availability($1)->'remaining' as r`, [ev.id]))[0].r;
});
// Confirmação manual: pedido expirado/cancelado só volta se ainda couber.
await ok('A confirma manualmente pedido cancelado (ainda há vaga)', () => as(A, `update orders set status='paid' where id=$1 returning status`, [o2.id]));
await err('A não confirma expirado sem vaga', () => as(A, `update orders set status='paid' where id=$1`, [o3.id]), 'Sem vagas');
await as(A, `update orders set status='cancelled' where id=$1`, [o2.id]);
await ok('A confirma expirado quando volta a ter vaga', () => as(A, `update orders set status='paid' where id=$1 returning status`, [o3.id]));
await as(A, `update events set capacity = 10 where id=$1`, [ev.id]);
await as(A, `update orders set status='cancelled' where id=$1`, [o1.id]);
await ok('outra pessoa reserva uma camisa', () => order({ buyer, attendees: [{ name: 'Rui Reis', birth_date: '2010-01-01', answers: { [q1.id]: 'não' }, items: [{ item_id: shirt.id, option: 'P' }] }] }));
await err('A não confirma pedido sem estoque', () => as(A, `update orders set status='paid' where id=$1`, [o1.id]), 'Sem estoque de Camisa');
await ok('gateway confirma mesmo sem estoque (dinheiro já recebido)', () => server(`update orders set status='paid' where id=$1 returning status`, [o1.id]));
await err('não exclui evento com inscrições', async () => {
  const r = await as(A, `delete from events where id=$1 returning id`, [ev.id]);
  if (!r.length) throw new Error('bloqueado');
}, 'bloqueado');

const [ev2] = await as(A, `insert into events(organizer_id, slug, title, starts_at) values($1,'gratis','Grátis', now() + interval '10 days') returning id`, [org.id]);
await as(ADM, `update events set review_status='approved' where id=$1`, [ev2.id]);
await as(A, `update events set status='published' where id=$1`, [ev2.id]);
const [orgB] = await as(B, `insert into organizers(owner_id, name) values($1,'Igreja B') returning id`, [B]);
await err('nome repetido em outro cliente (acentos/maiúsculas)', () => as(B, `insert into events(organizer_id, slug, title) values($1,'outro','GRATIS!')`, [orgB.id]), 'events_title_unique');
const [ev4] = await ok('rascunho sem data', () => as(A, `insert into events(organizer_id, slug, title) values($1,'sem-data','Sem data') returning id`, [org.id]));
await as(ADM, `update events set review_status='approved' where id=$1`, [ev4.id]);
await err('não publica sem data', () => as(A, `update events set status='published' where id=$1`, [ev4.id]), 'has_date');
await ok('admin suspende evento no ar (volta a rascunho)', () => as(ADM, `update events set review_status='rejected', review_note='x' where id=$1 returning status`, [ev2.id]));
await ok('cliente reenvia após recusa', () => as(A, `update events set review_status='pending' where id=$1 returning review_status`, [ev2.id]));
await as(ADM, `update events set review_status='approved' where id=$1`, [ev2.id]);
await as(A, `update events set status='published' where id=$1`, [ev2.id]);
const [credit] = await as(A, `insert into items(event_id, name, price, max_per_person) values($1,'Crédito cantina',0,null) returning id`, [ev2.id]);
await ok('sem limite por pessoa (50 unidades)', () => server(`select create_order($1,$2)->>'status' as s`, [ev2.id, JSON.stringify({ buyer, attendees: [{ name: 'Rui Barbosa', items: [{ item_id: credit.id, quantity: 50 }] }] })]));
await ok('evento gratuito já nasce pago', () => server(`select create_order($1,$2)->>'status' as s`, [ev2.id, JSON.stringify({ buyer, attendees: [{ name: 'Zé da Silva' }] })]));
await ok('exclui evento sem inscrições (cascata da inscrição)', async () => {
  const [ev3] = await as(A, `insert into events(organizer_id, slug, title, starts_at) values($1,'apagar','Apagar', now()) returning id`, [org.id]);
  return as(A, `delete from events where id=$1 returning id`, [ev3.id]);
});

await err('cliente não registra pagamento de taxa', () => as(A, `insert into fee_payments(organizer_id, amount) values($1, 10)`, [org.id]), 'row-level security');
await ok('admin registra pagamento de taxa', () => as(ADM, `insert into fee_payments(organizer_id, amount, note) values($1, 10, 'pix') returning amount`, [org.id]));
await ok('cliente vê o pagamento', async () => { const r = await as(A, `select amount from fee_payments`); if (r.length !== 1) throw new Error('esperado 1'); return r; });
await ok('outro cliente não vê', async () => { const r = await as(B, `select * from fee_payments`); if (r.length) throw new Error('vazou'); return 0; });

console.log(failures ? `\n${failures} FALHA(S)` : '\nTudo certo.');
process.exit(failures ? 1 : 0);
