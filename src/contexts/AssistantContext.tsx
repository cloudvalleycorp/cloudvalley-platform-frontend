import { createContext, useContext } from "react";
import type { PlatformAgentMetricFields } from "@/lib/aiInsights";

// El Asistente vive solo en el header (AppLayout.tsx) desde 2026-09-06 — ya
// no cada página arma el suyo con su propio botón y su propio
// PlatformAgentPanel (eso dejaba dos entradas "Asistente" distintas en la
// misma pantalla, algunas con superficie/copy genérica en vez de la propia).
// Este contexto es cómo un componente anidado abre el panel del header sin
// mantener su propio estado/panel — ver MetricInfoSheet.tsx (vía
// MetricsExplorerTab.tsx) y MetricPropertyPanel.tsx.
//
// metricFields (opcional): el draft de una métrica en edición todavía sin
// guardar (nombre/categoría/query/etc.) — MetricPropertyPanel.tsx lo manda
// para que el agente pueda ayudar con ESE draft puntual, no solo con la
// métrica ya guardada. Se limpia solo al cerrar el panel (ver AppLayout.tsx),
// nunca queda pegado a la próxima vez que se abre desde otro lado.
type OpenAssistantOptions = { metricFields?: PlatformAgentMetricFields };

const AssistantContext = createContext<{ openAssistant: (opts?: OpenAssistantOptions) => void } | null>(null);

export const AssistantContextProvider = AssistantContext.Provider;

export function useOpenAssistant(): (opts?: OpenAssistantOptions) => void {
  const ctx = useContext(AssistantContext);
  return ctx?.openAssistant ?? (() => {});
}
