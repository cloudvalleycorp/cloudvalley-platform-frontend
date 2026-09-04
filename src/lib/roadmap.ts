import { API_BASE_URL } from "@/lib/apiConfig";

export const LIST_ROADMAP_URL = `${API_BASE_URL}/list-roadmap`;
export const TOGGLE_TASK_STATUS_URL = `${API_BASE_URL}/toggle-task-status`;
// Lado inversor: roadmap de solo lectura de una empresa conectada — mismo
// criterio que LIST_SHARED_DOCUMENTS_URL/LIST_SHARED_FINANCIAL_REPORTS_URL
// (403 si no hay conexión activa). Contrato confirmado por backend
// 2026-08-14: mismo shape que ListRoadmapResponse (readiness_score +
// pillars + tasks), salvo que nunca incluye tareas scope="startup" (notas
// propias del founder) — solo catálogo global + lo que el fondo del
// inversor le asignó a esa startup.
export const LIST_SHARED_ROADMAP_URL = `${API_BASE_URL}/list-shared-roadmap`;
// admin-only
export const LIST_ROADMAP_CATALOG_URL = `${API_BASE_URL}/list-roadmap-catalog`;
// Cualquier rol autenticado — global + los propios pilares custom (nunca los
// de una startup/fondo ajeno). Para poblar selectores de pilar sin necesitar
// el catálogo completo de admin.
export const LIST_ROADMAP_PILLARS_URL = `${API_BASE_URL}/list-roadmap-pillars`;
// Compartidos por admin/founder/investor — scope/company_id/fund_id se
// infieren server-side según quién llama, nunca se mandan desde acá.
export const UPSERT_ROADMAP_PILLAR_URL = `${API_BASE_URL}/upsert-roadmap-pillar`;
export const DELETE_ROADMAP_PILLAR_URL = `${API_BASE_URL}/delete-roadmap-pillar`;
export const UPSERT_ROADMAP_TASK_URL = `${API_BASE_URL}/upsert-roadmap-task`;
export const DELETE_ROADMAP_TASK_URL = `${API_BASE_URL}/delete-roadmap-task`;

export type RoadmapPillar = { id: string; name: string; weight: number; order_index: number; scope?: RoadmapScope };

export type RoadmapTaskStatus = "pending" | "in_progress" | "done";

export type Criticality = "critical" | "recommended" | "optional";

// Quién puede escribir en el catálogo — nunca se manda en el body de
// upsert-roadmap-pillar/task, el backend lo infiere de la sesión. Solo las
// tareas/pilares scope="admin" pesan en readiness_score.
export type RoadmapScope = "admin" | "startup" | "fund";

// document_id/document_status vienen resueltos por backend desde la fila de
// `documents` vinculada (si existe) — startup_tasks.doc_url ya no se usa,
// "esta tarea tiene archivo" se lee siempre de acá. requires_report se
// completa solo (server-side) al crear/compartir un reporte, no hay acción
// de frontend para eso — con requires_doc y requires_report ambos true,
// cualquiera de las dos evidencias marca done.
//
// Campos agregados en el rediseño Investor (2026-08-23): due_date/is_overdue
// habilitan el ordenamiento "vencidas primero" de la pantalla Tasks;
// related_report_id/related_document_id son de solo lectura (nunca se
// mandan en upsert-roadmap-task, se resuelven server-side) y permiten que
// una tarea deep-linkee al artefacto puntual que la satisface en vez de a
// una lista genérica; requested_by_user_id/requested_by_name/created_at son
// trazabilidad — vienen null en tareas scope="admin" (catálogo global, no
// pedidas por un investor puntual).
export type RoadmapTask = {
  startup_task_id: string;
  task_id: string;
  status: RoadmapTaskStatus;
  pillar_id: string;
  title: string;
  description: string | null;
  why_it_matters: string | null;
  how_to_do_it: string | null;
  criticality: Criticality;
  requires_doc: boolean;
  requires_report: boolean;
  stage_required: string | null;
  document_id: string | null;
  document_status: "uploaded" | "verified" | null;
  due_date: string | null; // "YYYY-MM-DD"
  is_overdue: boolean;
  related_report_id: string | null;
  related_document_id: string | null;
  requested_by_user_id: string | null;
  requested_by_name: string | null;
  created_at: string | null;
};

// Compartido por RoadmapTaskList.tsx (fila de tarea) y ActionCenterSection.tsx
// (Dashboard) — mismo texto en los dos lugares en vez de dos versiones que
// puedan desalinearse. "Vencida hace N días" usa is_overdue+due_date reales,
// nunca un estado inventado.
export function dueLabel(dueDate: string | null, isOverdue: boolean): string | null {
  if (!dueDate) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate + "T00:00:00");
  const days = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (isOverdue) {
    const daysLate = Math.abs(days);
    return daysLate <= 0 ? "Vencida" : `Vencida hace ${daysLate} día${daysLate === 1 ? "" : "s"}`;
  }
  if (days === 0) return "Vence hoy";
  if (days === 1) return "Vence mañana";
  if (days > 1) return `Vence en ${days} días`;
  return "Vence hoy";
}

export type ListRoadmapResponse = {
  readiness_score: number;
  pillars: RoadmapPillar[];
  tasks: RoadmapTask[];
};

export type ListRoadmapPillarsResponse = { pillars: RoadmapPillar[] };

// ---- Catálogo (admin-only: list-roadmap-catalog + upsert/delete) ----

export type CatalogPillar = {
  id: string;
  name: string;
  weight: number;
  order_index: number;
  scope: RoadmapScope;
  company_id: string | null;
  fund_id: string | null;
  target_startup_ids: string[] | null;
};

export type CatalogTask = {
  id: string;
  pillar_id: string;
  title: string;
  description: string | null;
  why_it_matters: string | null;
  how_to_do_it: string | null;
  criticality: Criticality;
  requires_doc: boolean;
  requires_report: boolean;
  stage_required: string | null;
  order_index: number;
  scope: RoadmapScope;
  company_id: string | null;
  fund_id: string | null;
  target_startup_ids: string[] | null;
};

export type ListRoadmapCatalogResponse = { pillars: CatalogPillar[]; tasks: CatalogTask[] };

// target_startup_ids: usable por admin e inversor (no por founder — el
// founder solo puede crear para su propia startup, implícito). Vacío/ausente
// = aplica a todas (todas las startups del sistema si admin, todas las
// conectadas si es fondo).
export type UpsertRoadmapPillarRequest = {
  pillar_id?: string;
  name: string;
  weight: number;
  order_index: number;
  target_startup_ids?: string[];
};

// task_id presente = editar una tarea existente (scope="fund", 403 si no es
// del fondo del investor autenticado o si es scope="admin"/"startup");
// ausente = crear. related_report_id/related_document_id NUNCA se mandan
// acá — son derivados server-side, se leen en list-portfolio-tasks.
export type UpsertRoadmapTaskRequest = {
  task_id?: string;
  pillar_id: string;
  title: string;
  description?: string;
  why_it_matters?: string;
  how_to_do_it?: string;
  criticality: Criticality;
  requires_doc: boolean;
  requires_report: boolean;
  stage_required?: string;
  order_index: number;
  target_startup_ids?: string[];
  due_date?: string; // "YYYY-MM-DD", 400 si el formato no matchea
};

export const CRITICALITY_LABELS: Record<Criticality, string> = {
  critical: "Crítica",
  recommended: "Recomendada",
  optional: "Opcional",
};
