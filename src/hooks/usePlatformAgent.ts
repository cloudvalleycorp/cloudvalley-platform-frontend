import { useState } from "react";
import { toast } from "sonner";
import {
  PLATFORM_AGENT_URL,
  handleAiError,
  type PlatformAgentSurface,
  type PlatformAgentUiContext,
  type PlatformAgentMetricFields,
  type FormulaSyntaxEntry,
  type PlatformAgentResponse,
} from "@/lib/aiInsights";

export type AskOptions = {
  uiContext: PlatformAgentUiContext;
  formulaSyntax?: FormulaSyntaxEntry[];
  confirmWrite?: boolean;
  // Reintenta el mismo pedido forzando la creación aunque exista una
  // métrica equivalente — ver "duplicado detectado" en PlatformAgentPanel.tsx.
  confirmDuplicate?: boolean;
  metricFields?: PlatformAgentMetricFields;
  // Solo para confirmar add-metric-to-report — el reporte YA existente al
  // que se agrega la métrica (uiContext.selectedReportId en report_editor).
  reportId?: string;
  // "Nueva conversación" — backend persiste el historial solo (cambio de
  // contrato 2026-08-10), esto le pide arrancar de cero.
  resetConversation?: boolean;
  // Solo surface "investor_portfolio" (cambio de contrato 2026-08-15):
  // acota la pregunta a estas companies del portfolio. Ausente/vacío = todo
  // el portfolio conectado del fondo.
  companyIds?: string[];
};

/**
 * CAPA: AI Integration Layer — punto de entrada único al agente operativo
 * (POST /platform-agent). Reemplaza los viejos flujos puntuales
 * (generate-formula/explain-metric/ask-metrics-question/suggest-metrics):
 * el agente no solo puede responder, puede escribir una métrica (con
 * confirm_write explícito del usuario) o crear un reporte directamente
 * cuando el pedido no es ambiguo. Ver PlatformAgentPanel.tsx.
 */
export function usePlatformAgent(companyId: string | null, surface: PlatformAgentSurface) {
  const [asking, setAsking] = useState(false);

  const ask = async (question: string, opts: AskOptions): Promise<PlatformAgentResponse | null> => {
    // investor_portfolio es cross-company — no tiene un companyId singular,
    // así que no bloquea acá (company_ids es opcional, ver abajo). El resto
    // de surfaces sí necesita un companyId real.
    if (!companyId && surface !== "investor_portfolio") return null;
    setAsking(true);
    try {
      const res = await fetch(PLATFORM_AGENT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(companyId ? { company_id: companyId } : {}),
          surface,
          uiContext: opts.uiContext,
          ...(question.trim() ? { question: question.trim() } : {}),
          ...(opts.resetConversation ? { reset_conversation: true } : {}),
          ...(opts.formulaSyntax ? { formula_syntax: opts.formulaSyntax } : {}),
          ...(opts.confirmWrite ? { confirm_write: true } : {}),
          ...(opts.confirmDuplicate ? { confirm_duplicate: true } : {}),
          ...(opts.reportId ? { report_id: opts.reportId } : {}),
          ...(opts.companyIds && opts.companyIds.length > 0 ? { company_ids: opts.companyIds } : {}),
          ...(opts.metricFields ?? {}),
        }),
      });
      if (!res.ok) {
        await handleAiError(res, "No se pudo consultar al asistente");
        return null;
      }
      return (await res.json()) as PlatformAgentResponse;
    } catch {
      toast.error("No se pudo consultar al asistente");
      return null;
    } finally {
      setAsking(false);
    }
  };

  return { ask, asking };
}
