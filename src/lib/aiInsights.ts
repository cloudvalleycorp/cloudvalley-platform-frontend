// CAPA: AI Integration Layer del Growth Tracker. Dos superficies distintas:
// - platform-agent: agente operativo único (ver PlatformAgentPanel.tsx),
//   reemplaza los viejos flujos puntuales (generate-formula/explain-metric/
//   ask-metrics-question/suggest-metrics) — puede ACTUAR, no solo proponer
//   texto: escribe una métrica con confirmación explícita del usuario, o
//   crea un reporte directamente cuando el pedido no es ambiguo.
// - analyze-transactional-sheet: sigue siendo un flujo puntual (no pasa por
//   el agente) porque es parte del wizard de conectar una hoja de Sheets,
//   ver GrowthTrackerSheets.tsx — nunca escribe nada solo, el guardado real
//   sigue pasando por save-sheet-mapping/upsert-metric-definition.
import { toast } from "sonner";
import { API_BASE_URL } from "@/lib/apiConfig";
import type { FormulaSyntaxEntry } from "@/lib/formulaEngine";
import type { QuerySpec } from "@/lib/querySpec";

export const PLATFORM_AGENT_URL = `${API_BASE_URL}/platform-agent`;
export const ANALYZE_TRANSACTIONAL_SHEET_URL = `${API_BASE_URL}/analyze-transactional-sheet`;

// Cuerpo de error compartido por ambos endpoints en 400/429/502/503 — el
// mensaje ya viene en español, listo para mostrar directo (ver
// useMetricInsights.ts/usePlatformAgent.ts). 429 = rate limit de IA de la
// company (compartido entre todos los endpoints de IA). 502/503 = la IA no
// está disponible.
export type AiErrorResponse = { error: string };

// No se usa lib/membership.ts's handleMembershipError acá a propósito: esa
// función muestra "Error inesperado" genérico para cualquier status que no
// sea 401/403/400 — se comería el mensaje real de 429 (rate limit) y 502/503
// (IA no disponible), que el backend ya manda listo para mostrar. 401 sigue
// el mismo criterio de sesión vencida que el resto de la app; todo lo demás
// no-ok (400/403/429/502/503) muestra el {error} real del backend. Compartido
// por useMetricInsights.ts y usePlatformAgent.ts.
export async function handleAiError(res: Response, fallback: string): Promise<true> {
  if (res.status === 401) {
    window.location.assign("/login");
    return true;
  }
  try {
    const data = (await res.json()) as AiErrorResponse;
    toast.error(typeof data?.error === "string" ? data.error : fallback);
  } catch {
    toast.error(fallback);
  }
  return true;
}

// analyze-transactional-sheet lo pide siempre (400 si falta) — backend arma
// el prompt y valida la fórmula generada CONTRA esto en cada request, así
// que nunca se manda una copia vieja: se deriva en el momento de
// FUNCTION_SIGNATURES (formulaEngine.ts).
export type { FormulaSyntaxEntry };

// ---- Platform Agent (POST /platform-agent) ----

export type PlatformAgentSurface =
  | "metrics"
  | "metric_property_panel"
  | "report_editor"
  | "investor_company"
  // Pantalla de listado de reportes (Reporting.tsx, "Hacer Reporte" sin un
  // reporte abierto todavía) — agregado por backend a pedido, reemplaza el
  // "metrics" que se mandaba ahí como aproximación.
  | "reporting_list";

export type PlatformAgentUiContext = {
  selectedMetricId: string | null;
  selectedCategoryId: string | null;
  selectedReportId: string | null;
  currentPeriodId: string | null;
};

// Mismo shape que useMetricPropertyForm.Draft/upsert-metric-definition — se
// manda cuando hay un draft de métrica en pantalla (metric_property_panel) o
// como payload del confirm_write (los valores salen de un
// result.proposed anterior, ver PlatformAgentPanel.tsx).
export type PlatformAgentMetricFields = Partial<{
  metric_id: string;
  name: string;
  category: string;
  metric_type: "input" | "calculated";
  input_key: string;
  value_type: string;
  // query reemplaza a formula_expression para métricas calculadas nuevas
  // (cambio de contrato 2026-08-10) — ver src/lib/querySpec.ts.
  // formula_expression queda como legacy: no se manda más desde el
  // frontend, pero se deja el tipo por si el agente todavía lo devuelve en
  // algún trace viejo (no se descarta silenciosamente, ver PlatformAgentPanel.tsx).
  query: QuerySpec;
  formula_expression: string;
  unit: string;
  description: string;
  why_it_matters: string;
  benchmark: string;
}>;

export type PlatformAgentRequest = {
  company_id: string;
  domain?: string; // opcional, default "metrics_reporting" — único valor soportado hoy
  surface: PlatformAgentSurface;
  uiContext: PlatformAgentUiContext;
  question?: string;
  // conversation_history YA NO SE MANDA (cambio de contrato 2026-08-10) —
  // backend persiste el historial solo. reset_conversation:true arranca de
  // cero (botón "Nueva conversación" en PlatformAgentPanel.tsx).
  reset_conversation?: boolean;
  formula_syntax?: FormulaSyntaxEntry[];
  confirm_write?: boolean;
  // Solo para confirmar add-metric-to-report (tool nueva, pedida 2026-08-08,
  // NO deployada todavía al momento de escribir esto — verificar shape real
  // en cuanto backend confirme el deploy). El reporte YA existente al que se
  // agrega la métrica — sale de uiContext.selectedReportId en report_editor.
  report_id?: string;
} & PlatformAgentMetricFields;

// result.status confirmado por backend (2026-08-08) — solo existe en estas
// dos tools, el resto (get-metric, get-benchmark, etc.) no tiene un campo
// status uniforme:
// - upsert-metric-definition: "forbidden" | "invalid" | "pending_confirmation"
//   (trae proposed) | "ok" (trae metric, ya persistido — metric_id anidado
//   adentro de metric, no en el nivel de arriba) | "error"
// - create-report-from-proposal: "error" | "pending_clarification" (trae
//   proposed_structure) | "forbidden" | "created" (trae report_id)
// - add-metric-to-report (tool nueva pedida 2026-08-08 para agregar una
//   métrica a un reporte YA existente, hoy sin cobertura — create-report-
//   from-proposal solo crea reportes nuevos. Descripta por backend pero NO
//   deployada al momento de escribir esto, shape exacto sin verificar en
//   vivo todavía): "pending_confirmation" con proposed_metric (si la
//   métrica no existe — sin metric_id, el frontend genera el slug, ver
//   slugify en useMetricPropertyForm.ts) o directo con report_id+metric_id
//   (si ya existe) | "added" (trae report_id + sections actualizadas, tras
//   confirmar). SIEMPRE requiere confirm_write, a diferencia de
//   create-report-from-proposal — a propósito, porque modificar un reporte
//   que puede estar ya compartido expone la métrica de inmediato.
// SIEMPRE 200 a nivel HTTP aunque una de estas tools dé
// forbidden/invalid/error — no asumir éxito por el código HTTP, hay que
// inspeccionar result.status. Se sigue leyendo de forma estructural en
// PlatformAgentPanel.tsx (¿tiene proposed/proposed_metric? ¿tiene
// report_id/metric_id?) en vez de matchear por nombre de tool, para no
// depender de nombres internos. Desde el cambio de contrato 2026-08-10, el
// objeto propuesto para una métrica calculada trae query (objeto), no
// formula_expression (string) — PlatformAgentPanel.tsx lo detecta con
// isQuerySpec y lo muestra vía QuerySummary, no como InfoRow de texto.
export type ObservabilityTraceEntry = { tool: string; result: Record<string, unknown> };

export type PlatformAgentResponse = {
  intent_recognized: string;
  tool_plan: string[];
  data_used: string[];
  answer: string; // narrativa ya redactada, lista para mostrar
  pending_clarifications: string[];
  action_requests: string[];
  observability_trace: ObservabilityTraceEntry[];
  registry: { agent: string; domain: string; tool_count: number; tools: string[] };
};

// ---- Sheets: analizar hoja transaccional (sigue siendo un flujo puntual) ----

export type SuggestedField = { column: string; field_key: string; value_type: "number" | "text" };
// fields_used/dependencies son solo informativos para la UI — no se guardan
// en ningún lado, upsert-metric-definition no los acepta.
export type SuggestedMetric = {
  name: string;
  category: string;
  description: string;
  why_it_matters: string;
  formula_expression: string;
  aggregation: string;
  unit: string;
  fields_used: string[];
  dependencies: string[];
};
// Se ofrece en el paso 3 del wizard de Sheets, ANTES de guardar la conexión —
// mismo paso que ya usa get-sheet-headers. Requiere ser owner. headers/
// sample_rows salen directo de la respuesta de get-sheet-headers, ver
// GrowthTrackerSheets.tsx.
export type AnalyzeTransactionalSheetRequest = {
  company_id: string;
  account_id: string;
  spreadsheet_id: string;
  sheet_name: string;
  headers: string[];
  sample_rows: string[][]; // hasta 15 filas, tal cual las devuelve get-sheet-headers
  formula_syntax: FormulaSyntaxEntry[];
};
// Cualquiera de las dos listas puede venir vacía (el backend filtra
// internamente lo que no pasa validación) — mostrar solo lo que vino.
export type AnalyzeTransactionalSheetResponse = {
  suggested_fields: SuggestedField[];
  suggested_metrics: SuggestedMetric[];
};
