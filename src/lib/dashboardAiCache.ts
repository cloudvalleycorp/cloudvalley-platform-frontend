import type { MetricHighlight } from "@/lib/metricIntelligence";
import type { ListMetricSourceCoverageResponse } from "@/lib/metricSourceCoverage";

// Cache en memoria (módulo, nunca sessionStorage/localStorage) de los 3
// resultados de IA del Dashboard — pedido explícito del usuario 2026-09-29:
// "no debería darse click para que dé el reporte, sino que aparezca el
// resumen insight", confirmado como "auto-generar una vez, cacheado durante
// la sesión, a no ser que se regenere". Vive fuera de React a propósito: si
// viviera en el estado de Dashboard.tsx/ExecutiveSummaryCard, navegar a otra
// pantalla y volver desmontaría el componente y perdería el cache, volviendo
// a disparar la llamada de IA — exactamente lo que se pidió evitar. Se
// resetea solo con un refresh de página completo (nunca persiste entre
// sesiones), que es la lectura razonable de "durante la sesión".
type DashboardAiCache = {
  executiveSummary?: { answer: string; actionRequests: string[] };
  highlights?: MetricHighlight[];
  coverage?: ListMetricSourceCoverageResponse;
};

const cacheByCompany = new Map<string, DashboardAiCache>();

export function getDashboardAiCache(companyId: string): DashboardAiCache {
  return cacheByCompany.get(companyId) ?? {};
}

export function setDashboardAiCache(companyId: string, patch: Partial<DashboardAiCache>): void {
  cacheByCompany.set(companyId, { ...getDashboardAiCache(companyId), ...patch });
}
