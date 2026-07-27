export const ASSIGN_FINANCIAL_SOURCE_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/assign-source";
export const LIST_FINANCIAL_SOURCES_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-sources";
export const SUBMIT_FINANCIAL_RECORD_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/submit-record";
export const LIST_FINANCIAL_REPORT_STATUS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-report-status";
export const LIST_FINANCIAL_IMPORT_LOG_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-import-log";
export const LIST_FINANCIAL_RECORDS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-records";
export const LIST_FINANCIAL_METRICS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-metrics";
export const LIST_FINANCIAL_METRIC_PRIVACY_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-metric-privacy";
export const UPDATE_FINANCIAL_METRIC_PRIVACY_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/update-metric-privacy";

export type FinancialSourceType = "manual_form" | "sheet" | "stripe";
export type ReportStatus = "reportado" | "pendiente" | "con_errores";

export type ValueType = "money" | "count" | "percentage";

export type RowError = { field: string; reason: string };

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
  formula_expression: string | null;
  unit: string | null;
  display_order: number;
  description: string | null;
  why_it_matters: string | null;
  benchmark: string | null;
};

// Shape returned by GET /list-records — one row per period. Values are
// keyed by input_key, which isn't restricted to a fixed set (ver
// FinancialMetricDef) — puede tener cualquier snake_case, custom o del
// catálogo default de Acquisition/Retention. Ausente o null cuando nunca se
// cargó (nunca un 0 inventado).
export type FinancialRecordRow = { period: string } & Record<string, number | null>;

export type FinancialMetricPrivacyEntry = { metric_id: string; is_public: boolean };
