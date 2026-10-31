/**
 * Cobrança da taxa da plataforma.
 * - Sem split (padrão, PAYMENT_SPLIT vazio): o Cliente recebe o valor integral no gateway dele e a taxa
 *   de cada inscrição paga vira um débito, pago depois à plataforma (ver /painel/taxas).
 * - Com split (PAYMENT_SPLIT=1): o próprio gateway separa a taxa no momento do pagamento.
 */
export function splitEnabled() {
  return process.env.PAYMENT_SPLIT === "1";
}
