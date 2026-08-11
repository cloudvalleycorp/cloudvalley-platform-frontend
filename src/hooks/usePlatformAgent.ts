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
  metricFields?: PlatformAgentMetricFields;
  // Solo para confirmar add-metric-to-report — el reporte YA existente al
  // que se agrega la métrica (uiContext.selectedReportId en report_editor).
  reportId?: string;
  // "Nueva conversación" — backend persiste el historial solo (cambio de
  // contrato 2026-08-10), esto le pide arrancar de cero.
  resetConversation?: boolean;
};

/**
 * CAPA: AI Integration Layer — punto de entrada único al agente operativo
 * (POST /platform-agent). Reemplaza los viejos flujos puntuales
 * (generate-formula/explain-metric/ask-metrics-question/suggest-metrics):
 * el agente no solo propone texto, puede escribir una métrica (con
 * confirm_write explícito del usuario) o crear un reporte directamente
 * cuando el pedido no es ambiguo. Ver PlatformAgentPanel.tsx.
 */
export function usePlatformAgent(companyId: string | null, surface: PlatformAgentSurface) {
  const [asking, setAsking] = useState(false);

  const ask = async (question: string, opts: AskOptions): Promise<PlatformAgentResponse | null> => {
    if (!companyId) return null;
    setAsking(true);
    try {
      const res = await fetch(PLATFORM_AGENT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          surface,
          uiContext: opts.uiContext,
          ...(question.trim() ? { question: question.trim() } : {}),
          ...(opts.resetConversation ? { reset_conversation: true } : {}),
          ...(opts.formulaSyntax ? { formula_syntax: opts.formulaSyntax } : {}),
          ...(opts.confirmWrite ? { confirm_write: true } : {}),
          ...(opts.reportId ? { report_id: opts.reportId } : {}),
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
