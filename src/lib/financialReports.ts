export const UPSERT_FINANCIAL_METRIC_DEFINITION_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/upsert-financial-metric-definition";
export const CREATE_FINANCIAL_REPORT_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/create-financial-report";
export const LIST_FINANCIAL_REPORTS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-financial-reports";
export const GET_FINANCIAL_REPORT_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/get-financial-report";
export const UPDATE_FINANCIAL_REPORT_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/update-financial-report";
export const DELETE_FINANCIAL_REPORT_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/delete-financial-report";
export const SHARE_FINANCIAL_REPORT_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/share-financial-report";
export const UNSHARE_FINANCIAL_REPORT_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/unshare-financial-report";
export const LIST_FINANCIAL_REPORT_SHARES_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-financial-report-shares";

export type ReportSummary = { report_id: string; name: string; updated_at: string };

export type ReportBlock = { metric_id: string };

export type ReportSection = { title: string; subtitle: string | null; blocks: ReportBlock[] };

export type ReportDetail = {
  report_id: string;
  company_id: string;
  name: string;
  sections: ReportSection[];
};

export type ReportShare = {
  report_id: string;
  report_name: string;
  connection_id: string;
  counterpart_name: string;
};

// Input metrics can only reference one of these 8 fixed financial_record
// fields — submit-financial-record doesn't accept arbitrary keys, so a
// "custom input metric" is really just a relabel/recategorization of an
// existing raw field. Custom "calculated" metrics are the flexible ones:
// any formula over these same 8 identifiers.
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
