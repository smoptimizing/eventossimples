import "server-only";
import { SITE_NAME, siteUrl } from "@/lib/site";
import { money } from "@/lib/format";

/** Envia e-mail pelo Resend. Sem RESEND_API_KEY, não envia (tudo continua acessível pelo site). */
async function sendEmail(to: string, subject: string, body: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;
  const html = `${body}<p style="color:#777;font-size:12px">${escapeHtml(SITE_NAME)}</p>`;
  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.EMAIL_FROM || `${SITE_NAME} <onboarding@resend.dev>`, to: [to], subject, html }),
    });
  } catch (e) {
    console.error("E-mail", subject, e);
  }
}

/** Link do comprovante para o responsável (ao se inscrever e quando o pagamento é confirmado). */
export async function sendReceiptEmail(o: { code: string; access_key: string; buyer_name: string; buyer_email: string; total: number; status: string }, eventTitle: string) {
  const link = siteUrl(`/inscricao/${o.code}?k=${o.access_key}`);
  const paid = o.status === "paid";
  await sendEmail(
    o.buyer_email,
    paid ? `Inscrição confirmada — ${eventTitle}` : `Inscrição recebida — ${eventTitle}`,
    `<p>Olá, ${escapeHtml(o.buyer_name)}!</p>
    <p>${paid ? "Sua inscrição está <b>confirmada</b>." : "Recebemos sua inscrição. Ela será confirmada assim que o pagamento for aprovado."}</p>
    <p><b>${escapeHtml(eventTitle)}</b><br>Código: <b>${o.code}</b><br>Total: ${money(o.total)}</p>
    <p><a href="${link}">Ver comprovante${paid ? "" : " e pagar"}</a></p>`,
  );
}

/** Avisa o administrador da plataforma (ADMIN_EMAIL) que há evento aguardando aprovação. */
export async function notifyAdminReview(eventTitle: string, organizerName: string) {
  await sendEmail(
    process.env.ADMIN_EMAIL ?? "",
    `Evento para aprovar — ${eventTitle}`,
    `<p><b>${escapeHtml(organizerName)}</b> enviou o evento <b>${escapeHtml(eventTitle)}</b> para aprovação.</p>
    <p><a href="${siteUrl("/admin")}">Abrir a administração</a></p>`,
  );
}

/** Avisa o Cliente da decisão sobre o evento. */
export async function notifyOrganizerReview(to: string | null, eventTitle: string, approved: boolean, note: string | null, eventId: string) {
  await sendEmail(
    to ?? "",
    approved ? `Evento aprovado — ${eventTitle}` : `Evento não aprovado — ${eventTitle}`,
    `<p>O evento <b>${escapeHtml(eventTitle)}</b> ${approved ? "foi <b>aprovado</b>. Você já pode publicá-lo." : "não foi aprovado."}</p>
    ${note ? `<p>Observação: ${escapeHtml(note)}</p>` : ""}
    <p><a href="${siteUrl(`/painel/eventos/${eventId}`)}">Abrir o evento</a></p>`,
  );
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
