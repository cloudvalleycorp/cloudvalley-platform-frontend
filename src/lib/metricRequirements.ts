// CAPA: Requisitos de métricas por fondo — contrato confirmado por backend
// 2026-08-16 (13 endpoints: 10 nuevos + 3 modificados). Un fondo pide un
// valor con nombre/descripción/unidad/periodicidad — NUNCA una fórmula, no
// tiene visibilidad del modelo de datos crudos de cada startup. La startup
// vincula (o crea) su propia métrica para cumplir el pedido; el fondo solo
// ve el valor resultante, nunca el query. Ver diseño completo en el
// artifact "Requisitos de Métricas" publicado esta sesión.
import { API_BASE_URL } from "@/lib/apiConfig";

// ---- Lado fondo — CRUD de requisitos ----
export const LIST_METRIC_REQUIREMENTS_URL = `${API_BASE_URL}/list-metric-requirements`;
export const UPSERT_METRIC_REQUIREMENT_URL = `${API_BASE_URL}/upsert-metric-requirement`;
export const SET_METRIC_REQUIREMENT_MANDATORY_URL = `${API_BASE_URL}/set-metric-requirement-mandatory`;
export const DELETE_METRIC_REQUIREMENT_URL = `${API_BASE_URL}/delete-metric-requirement`;

// ---- Lado fondo — vistas agregadas ----
export const LIST_METRIC_REQUIREMENT_COVERAGE_URL = `${API_BASE_URL}/list-metric-requirement-coverage`;
export const LIST_PORTFOLIO_METRICS_DASHBOARD_URL = `${API_BASE_URL}/list-portfolio-metrics-dashboard`;

// ---- Lado startup — cumplimiento (hooks/UI llegan en una pasada aparte) ----
export const SUGGEST_METRIC_LINKS_URL = `${API_BASE_URL}/suggest-metric-links`;
export const LINK_METRIC_TO_REQUIREMENT_URL = `${API_BASE_URL}/link-metric-to-requirement`;
export const UNLINK_METRIC_FROM_REQUIREMENT_URL = `${API_BASE_URL}/unlink-metric-from-requirement`;
export const SET_METRIC_APPLICABILITY_URL = `${API_BASE_URL}/set-metric-applicability`;

export type MetricValueType = "money" | "count" | "percentage" | "text";
export type MetricPeriodicity = "monthly" | "quarterly" | "annual";

// standard: comparable entre empresas (Revenue/ARR/MRR/Growth/Cash/Burn/
// Runway/Gross Margin — ver standard_key). custom: KPI propio de un negocio
// (NRR/CAC/GMV/DAU/etc.), sin comparabilidad implícita. Default "custom" si
// se omite al crear.
export type MetricClass = "standard" | "custom";
export type TargetOperator = "gte" | "lte" | "eq";

// Enum sugerido por backend para standard_key (prompt de backend, ítem 3) —
// las 8 métricas que Overview/Performance tratan como comparables entre
// startups. Cualquier otro valor server-side no está mapeado acá, pero
// igual se muestra (fallback al nombre crudo).
export const STANDARD_KEY_LABELS: Record<string, string> = {
  arr: "ARR",
  mrr: "MRR",
  revenue: "Revenue",
  growth: "Growth",
  cash: "Cash",
  burn: "Burn",
  runway: "Runway",
  gross_margin: "Gross Margin",
};

export const TARGET_OPERATOR_LABELS: Record<TargetOperator, string> = {
  gte: "mayor o igual a",
  lte: "menor o igual a",
  eq: "igual a",
};

export type MetricRequirement = {
  requirement_id: string;
  fund_id: string;
  fund_name: string;
  name: string;
  description: string | null;
  why_it_matters: string | null;
  unit: string;
  value_type: MetricValueType;
  periodicity: MetricPeriodicity;
  mandatory: boolean;
  effective_from: string | null; // "YYYY-MM"
  target_startup_ids: string[] | null; // null/[] = todas las conectadas
  metric_class: MetricClass;
  standard_key: string | null; // solo si metric_class="standard"
  target_value: number | null;
  target_operator: TargetOperator | null;
  created_by_name: string | null;
  created_at: string | null;
};

export type ListMetricRequirementsResponse = { requirements: MetricRequirement[] };

// Nunca lleva query/metric_type/input_key — el fondo no calcula. mandatory/
// target_startup_ids/effective_from se ignoran acá aunque se manden, viven
// en SetMetricRequirementMandatoryRequest. target_operator es requerido
// (400) si target_value viene presente.
export type UpsertMetricRequirementRequest = {
  requirement_id?: string; // ausente = crear
  name: string;
  description?: string;
  why_it_matters?: string;
  unit: string;
  value_type: MetricValueType;
  periodicity: MetricPeriodicity;
  metric_class?: MetricClass; // default "custom"
  standard_key?: string; // requerido si metric_class="standard", se descarta si no
  target_value?: number;
  target_operator?: TargetOperator;
};

export type SetMetricRequirementMandatoryRequest = {
  requirement_id: string;
  mandatory: boolean;
  target_startup_ids?: string[] | null; // null/omitido = todas las conectadas, dinámico
  effective_from?: string; // "YYYY-MM" — requerido la primera vez que mandatory pasa a true
};

export type ComplianceStatus =
  | "ok"
  | "pending"
  | "no_data"
  | "not_applicable"
  | "error"
  | "unfulfilled"
  | "not_required_then";

export type MetricRequirementCoverage = {
  requirement_id: string;
  mandatory: boolean;
  target_count: number;
  linked_count: number;
  ok_count: number;
  pending_count: number;
  no_data_count: number;
  not_applicable_count: number;
  error_count: number;
  unfulfilled_count: number;
  last_updated_period: string | null;
};

export type ListMetricRequirementCoverageResponse = { coverage: MetricRequirementCoverage[] };

// origin distingue si la fila viene de un requisito del fondo
// (requirement_id presente, metric_id null) o de un KPI propio de la
// startup pedido por metric_id (metric_id presente, requirement_id null) —
// contrato ampliado 2026-08-23 para habilitar comparar KPIs custom entre
// empresas, no solo requisitos obligatorios.
export type PortfolioDashboardRow = {
  company_id: string;
  company_name: string;
  origin: "requirement" | "own_metric";
  requirement_id: string | null;
  metric_id: string | null;
  values: Record<string, number | null>; // período -> valor
  compliance_status: Record<string, ComplianceStatus>; // período -> estado
};

export type PortfolioAggregateEntry = { sum?: number; count_with_data?: number; avg?: number; median?: number };

// Selección de período: 3 modos mutuamente excluyentes, mandar solo uno.
// "range" reemplaza el selector de mes fijo (no escalable) por un rango
// relativo — habilita el modo Trend de Portfolio Compare, que con un solo
// período puntual no es viable.
export type PortfolioMetricsDashboardParams =
  | { range: "last_30_days" | "current_quarter" | "last_6_months" | "last_12_months" }
  | { range: "custom"; from: string; to: string } // "YYYY-MM"
  | { period: string } // puntual, "YYYY-MM"
  | { period_from: string; period_to: string };

// portfolio_aggregates solo existe para requisitos con value_type en
// money/count/percentage (nunca text). skipped documenta requisitos que no
// aplican a ninguna company para el período pedido (no es un error).
export type PortfolioMetricsDashboardResponse = {
  periods: string[];
  rows: PortfolioDashboardRow[];
  portfolio_aggregates: Record<string, Record<string, PortfolioAggregateEntry>>;
  skipped: { requirement_id: string; reason: string }[];
};

// ---- Lado startup ----

// Fila origin="fund_required" dentro de la respuesta de list-metrics (D.1) —
// metric_id siempre null, no es una MetricDefinition real todavía, es el
// pedido del fondo. Se usa requirement_id como key, nunca metric_id.
export type FundRequiredMetricRow = {
  requirement_id: string;
  source_fund_id: string;
  source_fund_name: string;
  is_mandatory: boolean;
  linked_own_metric_id: string | null;
  compliance_status: ComplianceStatus;
  name: string;
  description: string | null;
  why_it_matters: string | null;
  unit: string;
  value_type: MetricValueType;
  periodicity: MetricPeriodicity;
};

export type SuggestedMetricLinkCandidate = { metric_id: string; name: string; score: number; reason: string };
export type SuggestMetricLinksResponse = { candidates: SuggestedMetricLinkCandidate[] };

export type LinkMetricToRequirementRequest = { requirement_id: string; own_metric_id: string };
// definition_conflict es informativo (ej. unidades distintas) — nunca bloquea.
export type LinkMetricToRequirementResponse = { link_id: string; definition_conflict: boolean };

export type SetMetricApplicabilityRequest = {
  requirement_id: string;
  status: "not_applicable" | "clear";
  reason?: string; // obligatorio si status="not_applicable"
};

export const VALUE_TYPE_LABELS: Record<MetricValueType, string> = {
  money: "Dinero",
  count: "Número",
  percentage: "Porcentaje",
  text: "Texto",
};

export const PERIODICITY_LABELS: Record<MetricPeriodicity, string> = {
  monthly: "Mensual",
  quarterly: "Trimestral",
  annual: "Anual",
};

// Formateo genérico de un valor de dashboard según el value_type del
// requisito — el fondo define la unidad como texto libre (no es uno de los
// units reconocidos por formatMetricValue en lib/metrics.ts, que es para el
// catálogo propio de una startup), así que acá el formato sale de
// value_type, con unit como sufijo solo para "count"/casos no cubiertos.
export function formatRequirementValue(
  value: number | null,
  requirement: Pick<MetricRequirement, "value_type" | "unit">
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  if (requirement.value_type === "money") return `$${value.toLocaleString()}`;
  if (requirement.value_type === "percentage") return `${value.toFixed(1)}%`;
  if (requirement.value_type === "count") return value.toLocaleString();
  return requirement.unit ? `${value} ${requirement.unit}` : String(value);
}

export const COMPLIANCE_STATUS_LABELS: Record<ComplianceStatus, string> = {
  ok: "Al día",
  pending: "Pendiente",
  no_data: "Sin datos",
  not_applicable: "No aplica",
  error: "Error",
  unfulfilled: "Sin vincular",
  not_required_then: "Todavía no exigido",
};
