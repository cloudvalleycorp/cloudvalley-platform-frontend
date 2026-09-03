// CAPA: Cobertura de fuentes por métrica (list-metric-source-coverage,
// contrato entregado por backend 2026-09-02) — por cada métrica activa de la
// company, evalúa si hay una fuente ya conectada que la alimente (si es de
// carga manual, "connect") o la enriquezca con una fuente nueva que todavía
// no usa (si ya es calculada, "enrich"); y por cada uno de los 8 standard_key
// sin ninguna métrica propia, si es "derivable" con lo ya conectado o
// "missing" (con el motivo real, nunca inventado). 100% lectura,
// re-disparable en cualquier momento — confirmar una propuesta pasa por
// upsert-metric-definition (mismo endpoint que ya usa SuggestedMetricsReview/
// MetricPropertyPanel), esto nunca escribe nada solo.
import { API_BASE_URL } from "@/lib/apiConfig";
import type { Confidence } from "@/lib/financialData";
import type { QuerySpec } from "@/lib/querySpec";

export const LIST_METRIC_SOURCE_COVERAGE_URL = `${API_BASE_URL}/list-metric-source-coverage`;

// connected_no_gap/manual_no_candidate: nada para proponer. proposal_connect:
// de carga manual, hay un query nuevo completo. proposal_enrich: ya
// calculada, hay una fuente nueva para sumar (el query del proposal ya viene
// con el query viejo preservado adentro — no se combina del lado frontend).
export type MetricCoverageStatus = "connected_no_gap" | "manual_no_candidate" | "proposal_connect" | "proposal_enrich";

export type MetricCoverageProposal = {
  mode: "connect" | "enrich";
  target_metric_id: string;
  query: QuerySpec;
  confidence: Confidence;
  low_confidence: boolean;
  source_connection_ids: string[];
};

export type MetricCoverageRow = {
  metric_id: string;
  name: string;
  category: string;
  metric_type: "input" | "calculated";
  is_default: boolean;
  standard_key: string | null;
  current_source_connection_ids: string[];
  status: MetricCoverageStatus;
  proposal: MetricCoverageProposal | null;
};

export type NewStandardKpiProposal = {
  new_metric_id: string;
  query: QuerySpec;
  metric_class: "standard";
  standard_key: string;
  confidence: Confidence;
  low_confidence: boolean;
  source_connection_ids: string[];
};

export type NewStandardKpiRow = {
  standard_key: string;
  label: string;
  status: "derivable" | "missing";
  proposal: NewStandardKpiProposal | null;
  missing_data_description: string | null;
};

export type ListMetricSourceCoverageResponse = {
  generated_at: string;
  metrics: MetricCoverageRow[];
  new_standard_kpis: NewStandardKpiRow[];
  // metric_id que no se evaluaron esta corrida (tope de costo por llamada) —
  // re-disparar el endpoint más tarde para cubrirlos, nunca se pierden
  // silenciosamente.
  truncated_metric_ids: string[];
};
