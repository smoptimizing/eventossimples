"use client";

import { useState, useTransition } from "react";
import { FormMessage } from "@/components/ui";
import type { ActionState } from "@/lib/types";
import { checkPayment, retryCheckout } from "./actions";

export function PaymentBox({
  code,
  accessKey,
  checkoutUrl,
  pixCode,
  pixQr,
}: {
  code: string;
  accessKey: string;
  checkoutUrl: string | null;
  pixCode: string | null;
  pixQr: string | null;
}) {
  const [state, setState] = useState<ActionState>(undefined);
  const [pending, start] = useTransition();
  const [copied, setCopied] = useState(false);
  const run = (fn: typeof checkPayment) => start(async () => setState(await fn(code, accessKey)));

  return (
    <div className="space-y-4 print:hidden">
      {checkoutUrl && (
        <a href={checkoutUrl} className="btn-primary w-full py-3 text-base">Pagar agora (Pix, cartão ou boleto)</a>
      )}
      {pixCode && (
        <div className="space-y-3 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {pixQr && <img src={pixQr} alt="QR Code Pix" className="mx-auto h-56 w-56" />}
          <p className="text-sm text-zinc-600">Escaneie o QR Code ou use o Pix copia e cola:</p>
          <textarea readOnly className="input font-mono text-xs" rows={3} value={pixCode} />
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => navigator.clipboard.writeText(pixCode).then(() => setCopied(true))}
          >
            {copied ? "Copiado!" : "Copiar código Pix"}
          </button>
        </div>
      )}
      {!checkoutUrl && !pixCode && (
        <button type="button" className="btn-primary w-full" disabled={pending} onClick={() => run(retryCheckout)}>
          Gerar pagamento
        </button>
      )}
      {(checkoutUrl || pixCode) && (
        <button type="button" className="btn-secondary w-full" disabled={pending} onClick={() => run(checkPayment)}>
          {pending ? "Verificando..." : "Já paguei — verificar"}
        </button>
      )}
      <FormMessage state={state} />
    </div>
  );
}
