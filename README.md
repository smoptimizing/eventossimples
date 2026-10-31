# Inscreva — inscrições online para eventos (versão simples)

Next.js 16 + Supabase. Cada **Cliente** (igreja/organização) cadastra seus eventos e recebe os pagamentos integralmente na própria conta.
A plataforma cobra uma taxa percentual (padrão **1%**) sobre cada inscrição paga, **cobrada depois** pelo extrato do Cliente
(o split automático existe no código e pode ser ligado com `PAYMENT_SPLIT=1`).

## O que faz

**Cliente (organizador, com login)**
- Evento com arte, tema, preletor, local, datas, período de inscrição, faixa etária (idade na data do evento) e número de vagas.
- **Itens**: a *Inscrição* é obrigatória e criada automaticamente; os demais (ônibus, camisa, crédito na cantina...) são opcionais, com
  opções (ex.: tamanhos), quantidade máxima por pessoa, estoque e **dependência** ("só compra quem escolher o Ônibus").
- **Lotes** com preços diferentes por item, por período e/ou quantidade. Vale o primeiro lote (pela ordem) vigente e com vagas.
- **Formulário** com perguntas obrigatórias ou opcionais (texto, número, data, lista, sim/não), respondidas por participante.
- **Dashboard**: ocupação, arrecadado, taxa, líquido, itens (com opções), lotes, faixa etária, confirmados por dia e respostas de listas.
- Lista de inscrições (pedidos e participantes), busca, confirmação manual, cancelamento, verificação no gateway.
- **Exportação** em Excel (resumo, participantes com respostas, pedidos, itens, lista de entrega) e PDF.

**Acampante (sem login)**
- Inscreve uma ou várias pessoas num só pedido, escolhe itens, responde o formulário e paga.
- Recebe o **comprovante** (link + QR Code com o código + PDF). Também pode reabrir em *Meu comprovante* com código + e-mail.
- A vaga fica reservada pelo prazo de pagamento do evento (padrão 48 h); depois é liberada.

**Administração da plataforma** (`/admin`): **aprovação de eventos**, taxa padrão para novos Clientes, taxa por Cliente, suspensão,
saldo de taxas a receber de cada Cliente e registro dos pagamentos recebidos (`/admin/clientes/<id>`).

**Taxas** (`/painel/taxas`): explica ao Cliente as taxas (gateway × plataforma), traz um simulador de quanto ele recebe por inscrição
e o extrato: taxa gerada por evento, pagamentos feitos e saldo. Com `PLATFORM_PIX_KEY`, mostra a chave Pix para pagar.

**Aprovação**: o Cliente cria o evento só com o nome (único na plataforma), preenche tudo no rascunho e clica em *Enviar para aprovação*.
O administrador aprova (o Cliente então publica, encerra e reabre quando quiser) ou recusa com motivo (o Cliente ajusta e reenvia).
Um evento aprovado pode ser suspenso pelo administrador: sai do ar e volta a rascunho. Tudo isso é garantido também no banco.

As regras críticas (vagas, lote, idade, estoque, dependências, perguntas obrigatórias, cálculo do total e da taxa) ficam na função
`create_order` do banco, com o evento travado — duas pessoas não pegam a última vaga ao mesmo tempo. Teste: `npm run test:db`.

## Instalação

1. Crie um projeto no [Supabase](https://supabase.com) e execute [`supabase/migrations/0001_schema.sql`](supabase/migrations/0001_schema.sql) no SQL Editor.
   Instalação nova: só o 0001 (ele já contém tudo). Banco criado com uma versão anterior do 0001: execute, em ordem, os arquivos 0002, 0003, 0004... que ainda não rodou.
2. Copie `.env.example` para `.env.local` e preencha (gere a `PAYMENT_SECRET_KEY` como indicado no arquivo).
3. `npm install` e `npm run dev` → <http://localhost:5001>.
4. Crie sua conta em `/cadastro` e torne-se administrador no SQL Editor:
   ```sql
   insert into platform_admins (user_id) select id from auth.users where email = 'seu-email@exemplo.com';
   ```
5. Em produção (Vercel), cadastre as mesmas variáveis com `NEXT_PUBLIC_SITE_URL` apontando para o domínio final e configure
   *Authentication → URL Configuration* no Supabase (Site URL e Redirect URL `https://SEU-SITE/auth/callback`).

## Publicar (Vercel) e testar o Asaas sandbox

1. **Supabase**: no SQL Editor, rode as migrations que faltam (0007 confere vaga na confirmação manual).
2. **GitHub**: crie um repositório privado e envie o projeto (`git remote add origin ...` e `git push -u origin main`).
   O `.env.local` não vai junto (está no `.gitignore`).
3. **Vercel**: *Add New → Project*, importe o repositório (detecta Next.js; não mude nada) e, em *Environment Variables*, cadastre
   as variáveis do `.env.local` — **a mesma `PAYMENT_SECRET_KEY`** — trocando `NEXT_PUBLIC_SITE_URL` para o endereço da Vercel
   (ex.: `https://eventos-simples.vercel.app`, sem barra no final). Variáveis `NEXT_PUBLIC_*` só valem após um novo deploy.
4. **Supabase → Authentication → URL Configuration**: Site URL = endereço da Vercel; Redirect URLs: `https://SEU-SITE/auth/callback`.
5. **Asaas sandbox** (<https://sandbox.asaas.com>): crie a conta de teste e gere a chave em *Integrações → Chave de API*
   (começa com `$aact_hmlg_`).
6. No site publicado, entre como Cliente → *Conta e recebimento* → Asaas → cole a chave. O sistema valida, marca como sandbox
   e cria o webhook `https://SEU-SITE/api/webhooks/asaas` na conta (confira em *Integrações → Webhooks* no Asaas).
7. Faça uma inscrição paga, abra a fatura e, no painel do sandbox, em *Cobranças*, use **Confirmar pagamento** (ou pague o Pix de teste).
   Em segundos a inscrição deve ficar *Confirmada* sem clicar em nada. Se não ficar, veja *Integrações → Webhooks → Logs* no Asaas
   e *Logs* do projeto na Vercel.

## Gateways de pagamento

Sem split (padrão), o Cliente conecta o gateway dele assim:

| Gateway | Como o Cliente conecta | Formas de pagamento |
|---|---|---|
| **Asaas** | Cola a chave de API; o webhook de cobranças (`/api/webhooks/asaas`) é criado automaticamente na conta dele | Pix, cartão e boleto (fatura do Asaas) |
| **Mercado Pago** | Cola o Access Token | Checkout Pro (Pix, cartão, boleto) |
| **PagBank** | Cola o token | Checkout PagBank (Pix, cartão, boleto) |

### Split (opcional, `PAYMENT_SPLIT=1`)

| Gateway | Como o Cliente conecta | Como a taxa é separada | Sua configuração |
|---|---|---|---|
| **Asaas** | Cola a chave de API e cria o webhook de cobranças para `/api/webhooks/asaas` | `split` com `fixedValue` para a sua carteira | `ASAAS_PLATFORM_WALLET_ID` |
| **Mercado Pago** | Botão *Conectar* (OAuth) | `marketplace_fee` na preferência | Crie uma aplicação no painel de desenvolvedor, cadastre a Redirect URL `https://SEU-SITE/api/mercadopago/callback` e preencha `MP_CLIENT_ID` / `MP_CLIENT_SECRET` |
| **PagBank** | Cola o token e o ID da conta (`ACCO_...`) | Pedido **Pix** com `splits` (valores fixos para o Cliente e para você) | `PAGBANK_PLATFORM_ACCOUNT_ID`; o split precisa estar liberado pelo PagBank nas contas |

O webhook nunca é tomado como verdade: o sistema sempre consulta a API do gateway antes de confirmar.
Se a notificação atrasar, o acampante ou o Cliente podem clicar em **verificar pagamento**.

> **Antes de abrir para clientes reais, teste cada gateway em sandbox com um pedido de valor baixo.** Com split, confira no extrato
> que a taxa caiu na sua conta. O formato do split do PagBank para Pix em especial deve ser validado no sandbox.

## E-mail (opcional)

Com `RESEND_API_KEY`, o responsável recebe o link do comprovante ao se inscrever e quando o pagamento é confirmado.
Sem ela, o comprovante continua disponível pelo link exibido após a inscrição e em *Meu comprovante*.
