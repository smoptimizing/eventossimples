const TZ = "America/Sao_Paulo";

export function money(value: number | string | null | undefined) {
  return Number(value ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dateTime(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleString("pt-BR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });
}

export function dateLong(value: string | null | undefined) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit", month: "long", year: "numeric" });
}

export function dateShort(value: string | null | undefined) {
  if (!value) return "";
  // Datas puras (AAAA-MM-DD) não devem sofrer conversão de fuso.
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-");
    return `${d}/${m}/${y}`;
  }
  return new Date(value).toLocaleDateString("pt-BR", { timeZone: TZ });
}

export function eventPeriod(start: string | null, end: string | null) {
  if (!start) return "Data a definir";
  const s = dateLong(start);
  if (!end) return s;
  const e = dateLong(end);
  return s === e ? s : `${s} a ${e}`;
}

/** Idade em anos completos na data de referência (padrão: hoje). */
export function ageOn(birth: string | null | undefined, ref?: string | Date) {
  if (!birth) return null;
  const [y, m, d] = birth.split("-").map(Number);
  const r = ref ? new Date(ref) : new Date();
  const ry = Number(r.toLocaleDateString("en-CA", { timeZone: TZ }).slice(0, 4));
  const rm = Number(r.toLocaleDateString("en-CA", { timeZone: TZ }).slice(5, 7));
  const rd = Number(r.toLocaleDateString("en-CA", { timeZone: TZ }).slice(8, 10));
  let age = ry - y;
  if (rm < m || (rm === m && rd < d)) age--;
  return age;
}

/** Converte "2027-01-15T19:00" (horário de Brasília, vindo de <input type=datetime-local>) em ISO UTC. */
export function localInputToIso(value: FormDataEntryValue | null) {
  const v = String(value ?? "").trim();
  if (!v) return null;
  return new Date(`${v}:00-03:00`).toISOString();
}

/** Converte ISO em valor para <input type=datetime-local> no horário de Brasília. */
export function isoToLocalInput(value: string | null | undefined) {
  if (!value) return "";
  const d = new Date(new Date(value).getTime() - 3 * 3600 * 1000);
  return d.toISOString().slice(0, 16);
}

export function slugify(text: string) {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

export function onlyDigits(v: string | null | undefined) {
  return (v ?? "").replace(/\D/g, "");
}

export function ageRangeLabel(min: number | null, max: number | null) {
  if (min != null && max != null) return `${min} a ${max} anos`;
  if (min != null) return `a partir de ${min} anos`;
  if (max != null) return `até ${max} anos`;
  return null;
}

export function maskCpf(v: string | null | undefined) {
  const d = onlyDigits(v).slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

/** (85) 99999-9999 para celular ou (85) 3333-4444 para fixo. */
export function maskPhone(v: string | null | undefined) {
  const d = onlyDigits(v).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

export function maskCep(v: string | null | undefined) {
  const d = onlyDigits(v).slice(0, 8);
  return d.length > 5 ? `${d.slice(0, 5)}-${d.slice(5)}` : d;
}

/** Valida os dígitos verificadores do CPF. */
export function isValidCpf(v: string | null | undefined) {
  const d = onlyDigits(v);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const check = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(d[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return check(9) === Number(d[9]) && check(10) === Number(d[10]);
}

export function maskCnpj(v: string | null | undefined) {
  const d = onlyDigits(v).slice(0, 14);
  return d
    .replace(/^(\d{2})(\d)/, "$1.$2")
    .replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d)/, ".$1/$2")
    .replace(/(\d{4})(\d)/, "$1-$2");
}

/** CPF enquanto tiver até 11 dígitos; CNPJ a partir do 12º. */
export function maskCpfCnpj(v: string | null | undefined) {
  return onlyDigits(v).length > 11 ? maskCnpj(v) : maskCpf(v);
}

/** Valida CPF ou CNPJ pelos dígitos verificadores. */
export function isValidCpfCnpj(v: string | null | undefined) {
  const d = onlyDigits(v);
  if (d.length !== 14) return isValidCpf(d);
  if (/^(\d)\1{13}$/.test(d)) return false;
  const check = (len: number) => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const r = weights.reduce((s, w, i) => s + Number(d[i]) * w, 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return check(12) === Number(d[12]) && check(13) === Number(d[13]);
}

/** Telefone com DDD: 10 (fixo) ou 11 (celular) dígitos. */
export function isValidPhone(v: string | null | undefined) {
  const d = onlyDigits(v);
  return d.length === 10 || d.length === 11;
}

/** Compara nomes ignorando emojis, acentos, pontuação e maiúsculas ("- 🎶 Louvor" = "Louvor"). */
export function normalizeName(v: string | null | undefined) {
  return (v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase();
}
