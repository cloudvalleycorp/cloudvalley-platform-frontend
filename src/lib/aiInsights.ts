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
  | "reporting_list"
  // Portfolio del investor (InvestorPortfolio.tsx) — cross-company, cambio
  // de contrato 2026-08-15. Es el único surface donde NO se manda
  // company_id singular: se reemplaza por company_ids (plural, opcional —
  // ausente = todo el portfolio del fondo). El session_key de esta
  // conversación es por fondo (portfolio_{fund_id}), no por company; es
  // UNA sola conversación continua para toda la pantalla, distinta de las
  // conversaciones por-company del resto de la app — resuelto server-side
  // a partir del JWT, no hace falta mandar fund_id a mano.
  | "investor_portfolio"
  // 4 superficies nuevas del rediseño Investor (contrato confirmado
  // 2026-08-23) — Overview/Reporting/Data Room/Tasks, las 4 pantallas
  // portfolio-wide que antes no tenían contexto propio para el agente. No
  // necesitan company_id (mismo criterio que investor_portfolio).
  | "investor_overview"
  | "investor_reporting"
  | "investor_data_room"
  | "investor_tasks"
  // 3 superficies nuevas del refactor de Dashboard/Roadmap/Data Room del
  // founder (2026-09-04) — mismo criterio que las 4 de investor de arriba:
  // pantallas portfolio-wide (acá, "de la propia startup") que antes no
  // tenían contexto propio para el agente. No necesitan company_id propio en
  // el tipo (se sigue mandando el singular de siempre, una sola startup).
  | "founder_dashboard"
  | "founder_roadmap"
  | "founder_data_room";

// Campos plurales agregados en el rediseño Investor (2026-08-23) — el
// agente ahora puede responder sobre una selección activa de varias
// empresas/métricas/un rango de período/un segmento, sin que el investor
// tenga que repetirlo en texto. Los 4 singulares NO se deprecan — siguen
// siendo lo que mandan metrics/metric_property_panel/report_editor.
// Confirmado por backend: el agente resuelve solo comparaciones de
// portfolio incluso en surface investor_company (una sola empresa abierta)
// — no hace falta mandar nada distinto para que funcione ahí.
export type PlatformAgentUiContext = {
  selectedMetricId: string | null;
  selectedCategoryId: string | null;
  selectedReportId: string | null;
  currentPeriodId: string | null;
  selectedCompanyIds?: string[] | null;
  selectedMetricIds?: string[] | null;
  selectedRange?: string | null; // RelativeRangeKind, ver lib/portfolioIntelligence.ts
  selectedSegmentId?: string | null;
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
  // Ausente cuando surface === "investor_portfolio" (se manda company_ids
  // en su lugar, ver abajo) — presente y obligatorio en el resto.
  company_id?: string;
  // Solo aplica a surface === "investor_portfolio". Opcional: ausente o
  // vacío = todo el portfolio conectado del fondo. Una company que no
  // pertenezca de verdad al portfolio del investor se descarta en silencio
  // del lado backend (JWT desactualizado o intento no autorizado) — nunca
  // genera un error visible.
  company_ids?: string[];
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
  // Fuerza crear una métrica calculada nueva aunque el backend haya
  // detectado una equivalente ya existente (cambio de contrato 2026-08-14,
  // ver "duplicado detectado" en PlatformAgentPanel.tsx). Sin esto, un
  // pedido de creación que matchea una métrica existente vuelve como
  // pending_clarifications en vez de crear directo.
  confirm_duplicate?: boolean;
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
// Detección de duplicados (cambio de contrato 2026-08-14): si el pedido es
// crear una métrica calculada y el backend encuentra una equivalente ya
// existente, el paso de upsert-metric-definition en el trace trae
// result.existing_metric_id (+ opcional result.proposed_query) en vez de
// pending_confirmation directo, y pending_clarifications explica la
// situación en texto. Ver duplicateSuggestion() en PlatformAgentPanel.tsx.
// company_id (contrato ampliado 2026-08-23): null en surfaces multi-company
// (investor_portfolio y las 4 nuevas) — ahí el company_id real vive dentro
// de result, fila por fila (ej. result.values[metric_id][company_id]), no a
// nivel de la entrada del trace. Presente y único en surfaces de una sola
// empresa (investor_company). Se usa para armar el deep-link
// /companies/:id?tab=... de las acciones del agente, ver PlatformAgentPanel.tsx.
export type ObservabilityTraceEntry = { tool: string; company_id?: string | null; result: Record<string, unknown> };

export type PlatformAgentResponse = {
  // Puede venir "metadata_edit" (cambio de contrato 2026-08-14) cuando el
  // pedido edita nombre/categoría/descripción/unidad/why_it_matters/
  // benchmark/origen de una métrica ya existente sin tocar su query — no
  // hay ninguna rama del frontend que dependa de este valor puntual hoy
  // (la detección sigue siendo estructural, ver arriba), es solo para
  // debug/observability.
  intent_recognized: string;
  tool_plan: string[];
  data_used: string[];
  answer: string; // narrativa ya redactada, lista para mostrar
  // Renderizado en PlatformAgentPanel.tsx (antes se ignoraba por completo).
  pending_clarifications: string[];
  action_requests: string[];
  observability_trace: ObservabilityTraceEntry[];
  registry: { agent: string; domain: string; tool_count: number; tools: string[] };
};

// ---- Sheets: analizar hoja transaccional (sigue siendo un flujo puntual) ----

export type SuggestedField = { column: string; field_key: string; value_type: "number" | "text" };
// Cambio de contrato 2026-08-14: query (QuerySpec estructurado) reemplaza a
// formula_expression, mismo criterio que upsert-metric-definition/
// propose-query desde el 2026-08-10 — ahora se puede confirmar directo sin
// pasar por el query builder a mano (ver SuggestedMetricsReview.tsx).
// aggregation/fields_used/dependencies salieron del contrato (la
// aggregation ya vive adentro de query, fields_used/dependencies eran solo
// informativos y nunca se guardaban).
// mode (contrato ampliado 2026-09-03, aditivo): "create" = métrica nueva de
// verdad, target_metric_id null (comportamiento de siempre). "connect" = ya
// existe una métrica (default o custom) para el mismo concepto pero
// metric_type="input" sin datos todavía — target_metric_id apunta a ella.
// "enrich" = la existente ya es "calculated" con query real, y este query ya
// viene combinando el cálculo VIEJO (intacto) + la fuente nueva vía
// arithmetic "+" — nunca hace falta combinarlo del lado frontend, mismo
// criterio que ya usa list-metric-source-coverage (MetricCoverageReviewDialog.tsx).
// Antes de este cambio, cada hoja nueva con un concepto ya cubierto proponía
// una métrica nueva en conflicto en vez de reconocer la existente — reportado
// en vivo 2026-09-03.
export type SuggestedMetric = {
  name: string;
  category: string;
  description: string;
  why_it_matters: string;
  unit: string;
  query: QuerySpec;
  mode: "create" | "connect" | "enrich";
  target_metric_id: string | null;
};
// Mismo cambio de contrato: cuando el modelo necesitaría inventar un
// supuesto de negocio (margen, tasa) sin datos reales para proponer una
// métrica, la devuelve acá en vez de forzar un query inventado — mostrar
// el mensaje tal cual, nunca completar el hueco del lado frontend.
export type MetricNeedingMoreData = { name: string; missing_data_description: string };
// Se ofrece en el paso 3 del wizard de Sheets, ANTES de guardar la conexión —
// mismo paso que ya usa get-sheet-headers. Requiere ser owner. headers/
// sample_rows salen directo de la respuesta de get-sheet-headers, ver
// GrowthTrackerSheets.tsx. formula_syntax ya NO se manda (cambio de
// contrato 2026-08-14, lo ignora si igual llega).
export type AnalyzeTransactionalSheetRequest = {
  company_id: string;
  account_id: string;
  spreadsheet_id: string;
  sheet_name: string;
  headers: string[];
  sample_rows: string[][]; // hasta 15 filas, tal cual las devuelve get-sheet-headers
};
// Cualquiera de las listas puede venir vacía (el backend filtra
// internamente lo que no pasa validación) — mostrar solo lo que vino.
export type AnalyzeTransactionalSheetResponse = {
  suggested_fields: SuggestedField[];
  suggested_metrics: SuggestedMetric[];
  metrics_needing_more_data: MetricNeedingMoreData[];
};
