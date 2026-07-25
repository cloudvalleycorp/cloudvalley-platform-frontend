export const ASSIGN_FINANCIAL_SOURCE_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/assign-financial-source";
export const LIST_FINANCIAL_SOURCES_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-financial-sources";
export const SUBMIT_FINANCIAL_RECORD_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/submit-financial-record";
export const LIST_FINANCIAL_REPORT_STATUS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-financial-report-status";
export const LIST_FINANCIAL_IMPORT_LOG_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-financial-import-log";

export type FinancialSourceType = "manual_form" | "sheet" | "stripe";
export type ReportStatus = "reportado" | "pendiente" | "con_errores";

export type FinancialMetricKey = "revenue" | "new_mrr" | "churned_mrr" | "cash_balance" | "monthly_burn" | "headcount";

export type FinancialMetrics = Partial<Record<FinancialMetricKey, number>>;

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

export const METRIC_LABELS: Record<FinancialMetricKey, { label: string; unit: string }> = {
  revenue: { label: "Revenue", unit: "USD" },
  new_mrr: { label: "New MRR", unit: "USD" },
  churned_mrr: { label: "Churned MRR", unit: "USD" },
  cash_balance: { label: "Cash balance", unit: "USD" },
  monthly_burn: { label: "Burn mensual", unit: "USD" },
  headcount: { label: "Headcount", unit: "" },
};

export function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}
