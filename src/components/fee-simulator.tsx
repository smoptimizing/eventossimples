"use client";

import { useState } from "react";
import { money } from "@/lib/format";

const num = (v: string) => {
  const n = Number(v.replace(/[R$\s.]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Simula quanto o Cliente recebe por inscrição, separando a taxa do gateway e a da plataforma. */
export function FeeSimulator({ feePercent, split }: { feePercent: number; split: boolean }) {
  const [price, setPrice] = useState("200,00");
  const [gwPercent, setGwPercent] = useState("");
  const [gwFixed, setGwFixed] = useState("");
  const value = num(price);
  const gateway = round2((value * num(gwPercent)) / 100 + num(gwFixed));
  const platform = round2((value * feePercent) / 100);
  const net = round2(value - gateway - platform);

  return (
    <div className="grid gap-6 md:grid-cols-2">
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="sim-price">Valor total pago pelo participante (R$)</label>
          <input className="input" id="sim-price" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} />
          <p className="hint">Inscrição + itens escolhidos (ônibus, camisa...).</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="sim-gwp">Taxa do gateway (%)</label>
            <input className="input" id="sim-gwp" inputMode="decimal" placeholder="ex.: 0,99" value={gwPercent} onChange={(e) => setGwPercent(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="sim-gwf">+ valor fixo (R$)</label>
            <input className="input" id="sim-gwf" inputMode="decimal" placeholder="ex.: 1,99" value={gwFixed} onChange={(e) => setGwFixed(e.target.value)} />
          </div>
        </div>
        <p className="hint">
          Preencha com as taxas do seu contrato com o gateway. Elas variam conforme a forma de pagamento (Pix, cartão, boleto, parcelamento) e o
          seu plano; consulte no painel do gateway.
        </p>
      </div>

      <table className="data-table self-start">
        <tbody>
          <tr>
            <td>Participante paga</td>
            <td className="text-right font-medium tabular-nums">{money(value)}</td>
          </tr>
          <tr>
            <td>(−) Taxa do gateway <span className="text-xs text-zinc-500">(cobrada pelo gateway)</span></td>
            <td className="text-right tabular-nums">{money(gateway)}</td>
          </tr>
          <tr>
            <td>= Entra na sua conta do gateway</td>
            <td className="text-right font-medium tabular-nums">{money(round2(value - gateway - (split ? platform : 0)))}</td>
          </tr>
          <tr>
            <td>
              (−) Taxa da plataforma ({feePercent.toLocaleString("pt-BR")}% de {money(value)})
              <span className="block text-xs text-zinc-500">{split ? "separada automaticamente no pagamento" : "cobrada depois, pelo extrato"}</span>
            </td>
            <td className="text-right tabular-nums">{money(platform)}</td>
          </tr>
          <tr className="bg-emerald-50">
            <td className="font-semibold">= Você fica com</td>
            <td className="text-right text-lg font-bold tabular-nums">{money(net)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
