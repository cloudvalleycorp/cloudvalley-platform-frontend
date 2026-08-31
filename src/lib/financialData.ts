// CAPA: Metrics Registry (DTOs) — el shape que devuelve el catálogo real de
// backend (list-metrics/upsert-metric-definition). lib/metrics.ts mapea esto
// al modelo de dominio del frontend (toMetricDef); esta capa no lo hace, solo
// tipa lo que viaja por la red.
import { API_BASE_URL } from "@/lib/apiConfig";
import type { QuerySpec } from "@/lib/querySpec";

export const ASSIGN_FINANCIAL_SOURCE_URL = `${API_BASE_URL}/assign-source`;
export const LIST_FINANCIAL_SOURCES_URL = `${API_BASE_URL}/list-sources`;
export const SUBMIT_FINANCIAL_RECORD_URL = `${API_BASE_URL}/submit-record`;
export const LIST_FINANCIAL_REPORT_STATUS_URL = `${API_BASE_URL}/list-report-status`;
export const LIST_FINANCIAL_IMPORT_LOG_URL = `${API_BASE_URL}/list-import-log`;
export const LIST_FINANCIAL_RECORDS_URL = `${API_BASE_URL}/list-records`;
export const LIST_FINANCIAL_METRICS_URL = `${API_BASE_URL}/list-metrics`;
export const LIST_FINANCIAL_METRIC_PRIVACY_URL = `${API_BASE_URL}/list-metric-privacy`;
export const UPDATE_FINANCIAL_METRIC_PRIVACY_URL = `${API_BASE_URL}/update-metric-privacy`;
// Lectura de valores ya calculados para métricas `query`-based (contrato
// 2026-08-11, ver src/hooks/useEvaluatedMetrics.ts) — reemplaza a
// formulaEngine.ts + query-raw-fields del lado de lectura para estas.
// Bulk, sin IA, evalúa el mismo árbol recursivo que usa el agente.
export const EVALUATE_METRICS_URL = `${API_BASE_URL}/evaluate-metrics`;
export const EVALUATE_METRICS_MAX_IDS = 30;
export const EVALUATE_METRICS_MAX_PERIODS = 12;

export type FinancialSourceType = "manual_form" | "sheet" | "stripe";

// Compartido por varios endpoints del rediseño AI-native (2026-08-30):
// score 0-1, basis en lenguaje simple, method identifica el origen para
// decidir si mostrar un badge "sugerido por IA" o no.
export type Confidence = {
  score: number;
  basis: string;
  method?: "llm_classification" | "statistical" | "structural_match";
};

// Un nodo del trail de lineage de una métrica (get-metric-lineage) o de la
// evidencia de un highlight (list-metric-highlights) — mismo shape en ambos.
export type LineageNode = {
  source_id: string | null;
  workbook_id: string | null;
  sheet_name: string | null;
  cell_ref: string | null;
  formula: string;
  version_id: string | null;
  confidence: Confidence | null;
};

export type MetricScenario = "actual" | "forecast" | "budget";
export type ReportStatus = "reportado" | "pendiente" | "con_errores";

export type ValueType = "money" | "count" | "percentage";

// row/period are present on sync-sheets' row_errors (pinpoint which sheet
// row and which period a rejected value came from) — absent on
// submit-record's, which is always a single period the caller already knows.
export type RowError = { field: string; reason: string; row?: number; period?: string };

// A bulk sync (sheets, and eventually other integrations) commonly rejects
// every row for the SAME reason (one bad column format, one missing
// mapping) — listing each one individually just buries the one real cause
// under dozens of duplicate lines. Group by field+reason so the UI can show
// "this happened, N times, here are a few examples" instead.
export type GroupedRowError = { field: string; reason: string; count: number; rows: number[]; periods: string[] };

export function groupRowErrors(errors: RowError[]): GroupedRowError[] {
  const groups = new Map<string, GroupedRowError>();
  for (const e of errors) {
    const key = `${e.field} ${e.reason}`;
    let g = groups.get(key);
    if (!g) {
      g = { field: e.field, reason: e.reason, count: 0, rows: [], periods: [] };
      groups.set(key, g);
    }
    g.count++;
    if (e.row !== undefined && g.rows.length < 5) g.rows.push(e.row);
    if (e.period && !g.periods.includes(e.period) && g.periods.length < 5) g.periods.push(e.period);
  }
  return Array.from(groups.values()).sort((a, b) => b.count - a.count);
}

export type SubmitFinancialRecordResponse = {
  import_log_id: string;
  period: string;
  rows_processed: number;
  rows_rejected: number;
  row_errors: RowError[];
};

export type ReportStatusEntry = {
  company_id: string;
  company_name: string;
  period: string;
  status: ReportStatus;
};

export type FinancialSourceEntry = {
  company_id: string;
  company_name: string;
  sources: FinancialSourceType[];
};

export type ImportLogEntry = {
  import_log_id: string;
  source_type: FinancialSourceType;
  period: string;
  status: string;
  rows_processed: number;
  rows_rejected: number;
  row_errors: RowError[];
  triggered_by: string;
  started_at: string;
  finished_at: string;
};

export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// Shape returned by GET /list-metrics — mirrors Supabase's
// metric_definitions, but company-scoped and backend-managed. input_key ya
// no está restringido a los 8 campos fijos: cualquier snake_case que la
// company haya definido (custom o default, incluido Acquisition/Retention).
export type FinancialMetricDef = {
  metric_id: string;
  name: string;
  category: string;
  metric_type: "input" | "calculated";
  input_key: string | null;
  value_type: ValueType | null;
  // Automated source currently feeding this field ("sheet", "stripe", ...),
  // or null/"manual_form" when it's typed in by hand. Always null for
  // metric_type "calculated". Live — reflects whatever save-sheet-mapping
  // (or the equivalent for other integrations) has active right now.
  source: string | null;
  // Which sheet connection (of possibly several) is mapping this field right
  // now — only set when source === "sheet".
  source_connection_id: string | null;
  // Legacy — texto libre, ya no se acepta para escrituras nuevas (ver
  // query abajo). Sigue viniendo en list-metrics para métricas viejas que
  // todavía no se editaron con el query builder.
  formula_expression: string | null;
  // Reemplaza a formula_expression para métricas calculadas nuevas — árbol
  // estructurado (agregación/referencia a métrica/constante/aritmética), lo
  // calcula el backend, el frontend nunca lo interpreta. Coexiste con
  // formula_expression: una métrica vieja sin editar tiene formula_expression
  // y query:null; una nueva tiene query y formula_expression:null.
  query?: QuerySpec | null;
  unit: string | null;
  display_order: number;
  description: string | null;
  why_it_matters: string | null;
  benchmark: string | null;
  // Soft-delete flag — delete-metric-definition lo pone en false en vez de
  // borrar la fila. list-metrics NO lo filtra (bug de backend reportado
  // 2026-08-09), así que cada caller filtra esto él mismo antes de mapear a
  // MetricDef — ver los usos de LIST_FINANCIAL_METRICS_URL. Ausente en
  // respuestas viejas, por eso siempre opcional y se trata undefined como
  // activo (nunca ocultar de más por falta del campo).
  active?: boolean;
  // Contrato ampliado 2026-08-16 (ver src/lib/metricRequirements.ts): una
  // fila fund_required trae metric_id null y estos campos en su lugar — se
  // parte de la respuesta de list-metrics ANTES de mapear con toMetricDef,
  // ver useFinancialMetrics.ts. periodicity es nuevo para cualquier fila.
  periodicity?: "monthly" | "quarterly" | "annual";
  origin?: "own" | "fund_required";
  requirement_id?: string;
  source_fund_id?: string;
  source_fund_name?: string;
  is_mandatory?: boolean;
  linked_own_metric_id?: string | null;
  compliance_status?: "ok" | "pending" | "no_data" | "not_applicable" | "error" | "unfulfilled" | "not_required_then";
  // Contrato ampliado 2026-08-23 (rediseño Investor): distingue métrica
  // "estándar" (comparable entre empresas, ver standard_key) de "custom"
  // (KPI propio). Presente tanto en filas origin="own" como
  // origin="fund_required". Default "custom" si el backend no lo manda.
  metric_class?: "standard" | "custom";
  standard_key?: string | null;
  // Contrato ampliado 2026-08-30 (Metrics AI-native): código ISO 4217 de 3
  // letras, o null — solo tiene sentido si value_type="money". Metadata
  // pura, no cambia cómo se evalúa la métrica.
  currency?: string | null;
  // Ídem — a quién considerar la fuente autoritativa cuando 2+ métricas
  // propias comparten standard_key (ver MetricClassWarning). Lo setea el
  // usuario (o acepta la sugerencia de IA en `warnings`), nunca se infiere
  // solo en el cliente.
  source_role?: "primary" | "secondary" | "derived" | "reporting" | null;
};

// list-metrics agrega esto cuando una company tiene 2+ métricas con el
// mismo standard_key — advertencia visual, nunca bloquea nada. Conflicto
// real (misma métrica, valores que pueden no coincidir según la fuente) —
// ver explain-metric-discrepancy para investigar la causa y
// upsert-metric-definition (source_role) para resolverlo.
export type MetricClassWarning = {
  standard_key: string;
  count: number;
  metric_ids: string[];
  requirement_ids: string[];
  // Sugerencia de IA cacheada por backend, opcional — puede venir ausente O
  // como objeto vacío {} (cupo de IA agotado, servicio caído, o el
  // conflicto ya se resolvió a mano). Nunca tratar {} como error: solo
  // significa "sin sugerencia para mostrar todavía".
  suggested_source_roles?: Record<string, "primary" | "secondary" | "derived" | "reporting">;
};

// Shape returned by GET /list-records — one row per period. Values are
// keyed by input_key, which isn't restricted to a fixed set (ver
// FinancialMetricDef) — puede tener cualquier snake_case, custom o del
// catálogo default de Acquisition/Retention. Ausente o null cuando nunca se
// cargó (nunca un 0 inventado).
export type FinancialRecordRow = { period: string } & Record<string, number | null>;

export type FinancialMetricPrivacyEntry = { metric_id: string; is_public: boolean };

// ---- evaluate-metrics (lectura de valores calculados, ver arriba) ----

export type EvaluateMetricsPeriodSpec = { period: string } | { period_from: string; period_to: string };

// Un metric_id pedido que NO aparece en `values` — nunca desaparece en
// silencio, siempre trae por qué (metric_type input, sin query todavía, etc.).
export type EvaluateMetricsSkipped = { metric_id: string; reason: string };

export type EvaluateMetricsMetadata = { currency: string | null; source_role: string | null };

export type EvaluateMetricsResponse = {
  // metric_id -> período ("YYYY-MM") -> valor. null = sin datos suficientes
  // ese período (nunca un 0 inventado) — distinto de "ausente" (nunca pedido
  // o el metric_id vino en `skipped`).
  values: Record<string, Record<string, number | null>>;
  periods: string[];
  skipped: EvaluateMetricsSkipped[];
  // Contrato ampliado 2026-08-30: siempre presente, une currency/source_role
  // por metric_id — list-metrics no expone estos dos campos, así que evaluate
  // es hoy la única forma de tenerlos junto con el valor ya calculado.
  metric_metadata: Record<string, EvaluateMetricsMetadata>;
  scenario: MetricScenario;
  // Solo presente cuando se pidió un scenario != "actual" — el valor real en
  // la MISMA respuesta, para comparar sin un segundo request. Ausente
  // (nunca objeto vacío) cuando scenario === "actual".
  values_actual?: Record<string, Record<string, number | null>>;
};
