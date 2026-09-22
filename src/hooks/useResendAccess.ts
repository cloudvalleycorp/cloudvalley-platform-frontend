import { useState } from "react";
import { toast } from "sonner";
import { handleGatewayError } from "@/lib/adminGateway";
import { RESEND_USER_ACCESS_URL } from "@/lib/membership";

export type ResendAccessTarget = { user_id: string } | { company_id: string } | { fund_id: string };

// Admin-only (Fase 6 del plan de Admin, backend confirmado 2026-09-21):
// dispara un magic link real por email a cada destinatario — sin URL para
// copiar, sin pantalla de confirmación intermedia del lado backend. Un solo
// mecanismo para los 3 casos (usuario puntual, todos los miembros activos
// de una startup, o de un fondo) y también para loguearse a las 2 cuentas
// demo (Fase 10) — nunca un "ver como" que impersone una cuenta real.
export function useResendAccess() {
  const [sending, setSending] = useState(false);

  const resendAccess = async (target: ResendAccessTarget): Promise<boolean> => {
    setSending(true);
    try {
      const res = await fetch(RESEND_USER_ACCESS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(target),
      });
      if (await handleGatewayError(res)) return false;
      const data = (await res.json()) as { sent: string[]; failed: { user_id: string; error: string }[] };
      if (data.sent.length > 0) {
        toast.success(`Acceso reenviado a ${data.sent.length} usuario${data.sent.length === 1 ? "" : "s"}`);
      }
      if (data.failed.length > 0) {
        toast.error(`No se pudo reenviar a ${data.failed.length} usuario${data.failed.length === 1 ? "" : "s"}`);
      }
      return data.sent.length > 0;
    } catch {
      toast.error("No se pudo reenviar el acceso");
      return false;
    } finally {
      setSending(false);
    }
  };

  return { resendAccess, sending };
}
