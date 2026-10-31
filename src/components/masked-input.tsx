"use client";

import { useState } from "react";
import { maskCep, maskCpf, maskCpfCnpj, maskPhone } from "@/lib/format";

export const MASKS = {
  cpf: { fn: maskCpf, maxLength: 14, placeholder: "000.000.000-00", inputMode: "numeric" as const },
  cpfCnpj: { fn: maskCpfCnpj, maxLength: 18, placeholder: "CPF ou CNPJ", inputMode: "numeric" as const },
  phone: { fn: maskPhone, maxLength: 15, placeholder: "(88) 99999-9999", inputMode: "tel" as const },
  cep: { fn: maskCep, maxLength: 9, placeholder: "00000-000", inputMode: "numeric" as const },
};

export type MaskName = keyof typeof MASKS;

/**
 * Campo de texto com máscara (CPF, CPF/CNPJ, telefone, CEP).
 * Sem `value`, guarda o próprio estado (para formulários comuns); com `value` + `onValueChange`, é controlado.
 */
export function MaskedInput({
  mask,
  defaultValue,
  value: controlled,
  onValueChange,
  ...props
}: {
  mask: MaskName;
  defaultValue?: string | null;
  value?: string;
  onValueChange?: (masked: string) => void;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "defaultValue" | "value" | "onChange">) {
  const m = MASKS[mask];
  const [own, setOwn] = useState(() => m.fn(defaultValue ?? ""));
  const value = controlled !== undefined ? m.fn(controlled) : own;
  return (
    <input
      className="input"
      inputMode={m.inputMode}
      maxLength={m.maxLength}
      placeholder={m.placeholder}
      {...props}
      value={value}
      onChange={(e) => {
        const v = m.fn(e.target.value);
        setOwn(v);
        onValueChange?.(v);
      }}
    />
  );
}
