import Link from "next/link";
import { requireOrganizer } from "@/lib/auth";
import { feeStatement } from "@/lib/fee-statement";
import { splitEnabled } from "@/lib/fees";
import { FeeSimulator } from "@/components/fee-simulator";
import { FeeStatementView } from "@/components/fee-statement-view";
import { money } from "@/lib/format";

export const metadata = { title: "Taxas" };

export default async function TaxasPage() {
  const { supabase, organizer } = await requireOrganizer();
  const fee = Number(organizer.fee_percent);
  const feeLabel = `${fee.toLocaleString("pt-BR")}%`;
  const split = splitEnabled();
  const statement = await feeStatement(supabase, organizer.id);
  const pixKey = process.env.PLATFORM_PIX_KEY;
  const pixName = process.env.PLATFORM_PIX_NAME;
  const example = 200;

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <Link href="/painel" className="text-sm text-zinc-500 hover:underline">← Painel</Link>
      <h1 className="text-2xl font-bold">Taxas</h1>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Como funciona</h2>
        <p className="text-zinc-700">
          Existem só duas taxas sobre cada inscrição paga: a do <b>gateway de pagamento</b> que você escolheu (Asaas, Mercado Pago ou PagBank) e a da{" "}
          <b>plataforma</b>, de <b>{feeLabel}</b>. Não há mensalidade nem custo para criar eventos.
        </p>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-zinc-200 p-4">
            <p className="font-semibold">Taxa do gateway</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
              <li>Cobrada pelo próprio gateway, descontada do valor que entra na sua conta.</li>
              <li>Depende do seu contrato e da forma de pagamento (Pix, cartão, boleto, parcelamento).</li>
              <li>A plataforma não fica com nenhuma parte dela.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-zinc-200 p-4">
            <p className="font-semibold">Taxa da plataforma: {feeLabel}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-700">
              <li>
                Calculada sobre o <b>valor total pago</b> em cada inscrição confirmada, incluindo os itens (ônibus, camisa, cantina...). Ex.: inscrição de{" "}
                {money(example)} → {money((example * fee) / 100)}.
              </li>
              <li>Inscrições confirmadas manualmente no painel também entram.</li>
              <li>
                <b>Não</b> é cobrada de inscrições gratuitas, aguardando pagamento, expiradas ou canceladas. Se você cancelar uma inscrição já paga (ex.:
                estorno), a taxa dela deixa de ser cobrada.
              </li>
              <li>
                {split
                  ? "É separada automaticamente pelo gateway no momento do pagamento."
                  : "Não é descontada no pagamento: você recebe o valor integral e paga a taxa depois, conforme o extrato abaixo."}
              </li>
              <li>Se a taxa mudar, a nova vale só para inscrições feitas depois da mudança.</li>
            </ul>
          </div>
        </div>
      </section>

      <section className="card space-y-4">
        <h2 className="text-lg font-semibold">Simule quanto você recebe</h2>
        <FeeSimulator feePercent={fee} split={split} />
      </section>

      <section className="card space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Seu extrato</h2>
          {!split && (
            <p className="text-sm text-zinc-600">
              A taxa de cada inscrição paga entra no saldo abaixo. Para pagar,{" "}
              {pixKey ? (
                <>faça um Pix para a chave <b className="font-mono">{pixKey}</b>{pixName && <> ({pixName})</>}</>
              ) : (
                "combine o pagamento com a plataforma"
              )}
              ; o valor é registrado pela plataforma e abatido do saldo.
            </p>
          )}
        </div>
        <FeeStatementView s={statement} />
      </section>
    </div>
  );
}
