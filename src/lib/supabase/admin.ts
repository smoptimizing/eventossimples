import "server-only";
import { createClient } from "@supabase/supabase-js";

/** Cliente com chave secreta (ignora RLS). Usar apenas no servidor, para pagamentos e webhooks. */
export function createAdminClient() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
