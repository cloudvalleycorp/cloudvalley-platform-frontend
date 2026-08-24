// CAPA: entidades nuevas del rediseño Investor (Portfolio Intelligence,
// 2026-08-23) — inbox de tareas cross-company, estado de reporting,
// Segment y feed de actividad. Contrato confirmado por backend, ver el
// documento de diseño "Portfolio Intelligence" (Artifact) y el prompt de
// backend de esta sesión. No confundir con src/lib/roadmap.ts (RoadmapTask
// en sí, extendido ahí) ni src/lib/metricRequirements.ts (MetricRequirement,
// extendido ahí) — este archivo es solo lo genuinamente nuevo.
import { API_BASE_URL } from "@/lib/apiConfig";
import type { RoadmapTaskStatus, Criticality } from "@/lib/roadmap";

export const LIST_PORTFOLIO_TASKS_URL = `${API_BASE_URL}/list-portfolio-tasks`;
export const LIST_REPORTING_STATUS_URL = `${API_BASE_URL}/list-reporting-status`;
export const MARK_REPORT_VIEWED_URL = `${API_BASE_URL}/mark-report-viewed`;
export const MARK_REPORT_REVIEWED_URL = `${API_BASE_URL}/mark-report-reviewed`;
export const LIST_SEGMENTS_URL = `${API_BASE_URL}/list-segments`;
export const UPSERT_SEGMENT_URL = `${API_BASE_URL}/upsert-segment`;
export const DELETE_SEGMENT_URL = `${API_BASE_URL}/delete-segment`;
export const LIST_ACTIVITY_URL = `${API_BASE_URL}/list-activity`;

// ---- Tasks (inbox cross-company) ----

// Fila de list-portfolio-tasks — superset de RoadmapTask con company_id/name
// resueltos (viene de N startups distintas) y is_overdue ya calculado
// server-side (nunca recalcular contra timezone client-side).
export type PortfolioTask = {
  startup_task_id: string;
  company_id: string;
  company_name: string;
  title: string;
  status: RoadmapTaskStatus;
  criticality: Criticality;
  due_date: string | null; // "YYYY-MM-DD"
  is_overdue: boolean;
  related_report_id: string | null;
  related_document_id: string | null;
  requested_by_user_id: string | null; // null en tareas scope="admin"
  requested_by_name: string | null;
  created_at: string | null;
};

export type ListPortfolioTasksParams = {
  company_ids?: string[];
  segment_id?: string;
  status?: RoadmapTaskStatus;
  criticality?: Criticality;
  due_before?: string; // "YYYY-MM-DD"
  page?: number;
  page_size?: number;
};

export type ListPortfolioTasksResponse = {
  tasks: PortfolioTask[];
  total: number;
  page: number;
  page_size: number;
};

// ---- Reporting status ----

export type ReportingStatus = "up_to_date" | "new_update" | "awaiting_update" | "missing_data" | "needs_review";

export type ReportingStatusRow = {
  company_id: string;
  company_name: string;
  status: ReportingStatus;
  report_id: string | null;
  last_viewed_at: string | null;
  needs_review: boolean;
  updated_at: string | null;
  shared_by_name: string | null;
  shared_at: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
};

export type ListReportingStatusResponse = { rows: ReportingStatusRow[] };

export const REPORTING_STATUS_LABELS: Record<ReportingStatus, string> = {
  up_to_date: "Al día",
  new_update: "Nuevo update",
  awaiting_update: "Esperando update",
  missing_data: "Sin datos",
  needs_review: "Necesita revisión",
};

// ---- Segment ----

export type SegmentSource = "custom" | "derived";

export type Segment = {
  segment_id: string;
  name: string;
  company_ids: string[];
  source: SegmentSource;
  created_by_name: string | null;
  created_at: string | null;
};

export type ListSegmentsResponse = { segments: Segment[] };

export type UpsertSegmentRequest = { segment_id?: string; name: string; company_ids: string[] };

// Shorthand de agrupación por business_model sin crear un Segment real —
// usable como segment_id? en cualquier endpoint que lo acepte. business_model
// ya existe en CompanyProfile (get-company-profile), esto solo lo expone
// como filtro sin tabla nueva.
export function derivedSegmentId(businessModel: string): string {
  return `derived:${businessModel}`;
}

// ---- Activity feed ----

export type ActivityEventType = "report_shared" | "document_uploaded";

export type ActivityEvent = {
  type: ActivityEventType;
  company_id: string;
  company_name: string;
  actor: { user_id: string; name: string };
  occurred_at: string;
  related_id: string;
  summary: string; // ya redactado en español, listo para mostrar tal cual
};

export type ListActivityParams = { company_id?: string; segment_id?: string; since?: string; page?: number; page_size?: number };

export type ListActivityResponse = { events: ActivityEvent[]; total: number; page: number; page_size: number };

// ---- Selector de período relativo (reemplaza PeriodSelect en pantallas investor) ----

export type RelativeRangeKind = "last_30_days" | "current_quarter" | "last_6_months" | "last_12_months" | "custom";

export type RelativeRange = { kind: RelativeRangeKind; from?: string; to?: string };

export const RELATIVE_RANGE_LABELS: Record<RelativeRangeKind, string> = {
  last_30_days: "Últimos 30 días",
  current_quarter: "Este trimestre",
  last_6_months: "Últimos 6 meses",
  last_12_months: "Últimos 12 meses",
  custom: "Personalizado",
};

// Serializa un RelativeRange a los query params que ya acepta
// list-portfolio-metrics-dashboard (range=<key> o range=custom&from=&to=).
export function rangeToParams(range: RelativeRange): Record<string, string> {
  if (range.kind === "custom") {
    return { range: "custom", from: range.from ?? "", to: range.to ?? "" };
  }
  return { range: range.kind };
}
