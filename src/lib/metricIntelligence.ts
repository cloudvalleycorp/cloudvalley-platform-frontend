// CAPA: Metric Intelligence (Metrics AI-native, 2026-08-30) — lineage,
// salud de datos, highlights, versionado y reconciliación. Todo lo que
// antes este mismo rediseño planeaba armar client-side como "best effort"
// (resolveMetricSources en metricLineage.ts) ahora tiene un endpoint real
// detrás — esos helpers puros quedan como complemento (ej. la búsqueda
// inversa "qué métricas usan este campo", que backend no expone), no como
// reemplazo.
import { API_BASE_URL } from "@/lib/apiConfig";
import type { Confidence, LineageNode } from "@/lib/financialData";

export const GET_METRIC_LINEAGE_URL = `${API_BASE_URL}/get-metric-lineage`;
export const LIST_RAW_FIELD_VALUES_URL = `${API_BASE_URL}/list-raw-field-values`;
export const LIST_DATA_HEALTH_ISSUES_URL = `${API_BASE_URL}/list-data-health-issues`;
export const LIST_METRIC_HIGHLIGHTS_URL = `${API_BASE_URL}/list-metric-highlights`;
export const DIFF_METRIC_VERSION_URL = `${API_BASE_URL}/diff-metric-version`;
export const EXPLAIN_METRIC_DISCREPANCY_URL = `${API_BASE_URL}/explain-metric-discrepancy`;
export const LIST_DUPLICATE_TRANSACTIONS_URL = `${API_BASE_URL}/list-duplicate-transactions`;

export type GetMetricLineageResponse = { metric_id: string; period: string; lineage: LineageNode[] };

export type RawFieldValueRow = { raw_value: unknown; normalized_value: unknown; row_number: number | null };
export type ListRawFieldValuesResponse = { values: RawFieldValueRow[] };

export type LowConfidenceMappingIssue = {
  type: "low_confidence_mapping";
  connection_id: string;
  field_key: string;
  column: string;
  confidence: Confidence;
};

export type StatisticalAnomalyIssue = {
  type: "statistical_anomaly";
  connection_id: string;
  field_key: string;
  period: string;
  row_number: number;
  value: number;
  expected_range: { mean: number; stdev: number };
  confidence: Confidence;
};

export type DataHealthIssue = LowConfidenceMappingIssue | StatisticalAnomalyIssue;
export type ListDataHealthIssuesResponse = { issues: DataHealthIssue[] };

export type MetricHighlight = {
  metric_id: string;
  title: string;
  description: string | null;
  delta: { current_value: number; prior_value: number; delta_pct: number };
  confidence: Confidence;
  evidence: LineageNode[];
};
export type ListMetricHighlightsResponse = { highlights: MetricHighlight[] };

export type MetricVersionSummary = { version_id: string; created_at: string | null; created_by_user_id: string | null; deleted: boolean };
export type ListMetricVersionsResponse = { versions: MetricVersionSummary[] };
export type DiffMetricVersionResponse = {
  metric_id: string;
  from_version_id: string;
  to_version_id: string;
  changed_fields: Record<string, { from: unknown; to: unknown }>;
};

export type ExplainMetricDiscrepancyResponse = {
  metric_a: { metric_id: string; name: string; value: number | null };
  metric_b: { metric_id: string; name: string; value: number | null };
  structural_diff: string[];
  explanation: string | null;
  confidence: Confidence | null;
};

export type DuplicateTransactionRow = { row_number: number; period: string; fields: Record<string, unknown>; entities: Record<string, string> };
export type DuplicateTransactionGroup = { period: string; entities: Record<string, string>; rows: DuplicateTransactionRow[] };
export type ListDuplicateTransactionsResponse = { duplicate_groups: DuplicateTransactionGroup[] };
