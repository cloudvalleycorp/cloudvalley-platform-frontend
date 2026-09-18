import { API_BASE_URL } from "@/lib/apiConfig";

export const UPSERT_FINANCIAL_METRIC_DEFINITION_URL = `${API_BASE_URL}/upsert-metric-definition`;
export const DELETE_FINANCIAL_METRIC_DEFINITION_URL = `${API_BASE_URL}/delete-metric-definition`;
export const CREATE_FINANCIAL_REPORT_URL = `${API_BASE_URL}/create-financial-report`;
export const LIST_FINANCIAL_REPORTS_URL = `${API_BASE_URL}/list-financial-reports`;
export const GET_FINANCIAL_REPORT_URL = `${API_BASE_URL}/get-financial-report`;
export const UPDATE_FINANCIAL_REPORT_URL = `${API_BASE_URL}/update-financial-report`;
export const DELETE_FINANCIAL_REPORT_URL = `${API_BASE_URL}/delete-financial-report`;
export const SHARE_FINANCIAL_REPORT_URL = `${API_BASE_URL}/share-financial-report`;
export const UNSHARE_FINANCIAL_REPORT_URL = `${API_BASE_URL}/unshare-financial-report`;
export const LIST_FINANCIAL_REPORT_SHARES_URL = `${API_BASE_URL}/list-financial-report-shares`;
export const LIST_SHARED_FINANCIAL_REPORTS_URL = `${API_BASE_URL}/list-shared-financial-reports`;
// Contrato 2026-09-11 — exportar a PDF y analítica real de lectura (esta
// reemplaza el toggle manual "Marcar revisado": el estado "revisado" de
// list-reporting-status ahora se calcula solo del lado backend a partir de
// estos eventos, >=80% scroll y >=30s activos).
export const EXPORT_REPORT_PDF_URL = `${API_BASE_URL}/export-report-pdf`;
export const TRACK_REPORT_VIEW_EVENT_URL = `${API_BASE_URL}/track-report-view-event`;
export const LIST_REPORT_ANALYTICS_URL = `${API_BASE_URL}/list-report-analytics`;

export type SharedReportSummary = { report_id: string; name: string };

export type ReportSummary = { report_id: string; name: string; updated_at: string };

export type ReportBlock = { metric_id: string };

export type ReportSection = { title: string; subtitle: string | null; blocks: ReportBlock[] };

export type ReportDetail = {
  report_id: string;
  company_id: string;
  name: string;
  sections: ReportSection[];
};

export type DeleteMetricDefinitionResponse = {
  success: boolean;
  records_deleted: number;
  affected_reports: { report_id: string; name: string }[];
};

export type ReportShare = {
  report_id: string;
  report_name: string;
  connection_id: string;
  counterpart_name: string;
};

export type ExportReportPdfResponse = { download_url: string };

export type ReportViewEventType = "open" | "heartbeat" | "close";

// Nunca mandar company_id/fund_id/connection_id acá — se derivan de la
// sesión del lado backend (contrato 2026-09-11).
export type TrackReportViewEventRequest = {
  report_id: string;
  event_type: ReportViewEventType;
  active_seconds?: number;
  scroll_pct?: number;
};

export type ReportAnalyticsByFund = { fund_id: string; opens: number; active_seconds: number; max_scroll_pct: number };
export type ReportAnalyticsByPerson = {
  viewer_user_id: string;
  viewer_name: string;
  opens: number;
  active_seconds: number;
  max_scroll_pct: number;
};

export type ReportAnalytics = {
  report_id: string;
  total_opens: number;
  total_active_seconds: number;
  by_fund: ReportAnalyticsByFund[];
  by_person: ReportAnalyticsByPerson[];
};

// Los 8 campos originales de Revenue/Cash & Efficiency. submit-record ya
// acepta cualquier input_key que la company tenga definido (custom, o el
// catálogo default de Acquisition/Retention) — esta lista queda solo como
// sugerencia inicial en el datalist del campo "Campo" al crear una métrica
// de tipo input, no como restricción.
export const RAW_INPUT_KEYS = [
  "revenue",
  "new_mrr",
  "churned_mrr",
  "cash_balance",
  "monthly_burn",
  "headcount",
  "customers",
  "cac",
] as const;
