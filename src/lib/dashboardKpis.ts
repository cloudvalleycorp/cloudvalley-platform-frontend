import { API_BASE_URL } from "@/lib/apiConfig";
import { STANDARD_KEY_ORDER } from "@/lib/metricRequirements";
import type { MetricDef } from "@/lib/metrics";

// Máximo de KPIs en "Cómo estamos": con más tarjetas deja de ser una lectura
// de un vistazo. Mismo tope que valida el backend.
export const DASHBOARD_KPI_MAX = 12;

export const GET_DASHBOARD_KPIS_URL = `${API_BASE_URL}/get-dashboard-kpis`;
export const SET_DASHBOARD_KPIS_URL = `${API_BASE_URL}/set-dashboard-kpis`;

// Default: la métrica estándar de cada clave que exista en la cuenta. Una
// startup nueva ve algo útil sin configurar nada, y no quedan tarjetas vacías
// por claves que no tiene. Se usa solo cuando el backend responde null
// (nunca configurado).
export function defaultDashboardKpiIds(metrics: MetricDef[]): string[] {
  const ids: string[] = [];
  for (const key of STANDARD_KEY_ORDER) {
    const m = metrics.find((x) => x.metric_class === "standard" && x.standard_key === key);
    if (m) ids.push(m.id);
  }
  return ids.slice(0, DASHBOARD_KPI_MAX);
}

// Mismas reglas que el backend, para no mandar una selección que sabemos
// inválida. El backend igual valida.
export function validateKpiSelection(ids: string[]): string | null {
  if (ids.length === 0) return "Elegí al menos 1 KPI.";
  if (ids.length > DASHBOARD_KPI_MAX) return `Máximo ${DASHBOARD_KPI_MAX} KPIs.`;
  if (new Set(ids).size !== ids.length) return "Hay KPIs repetidos en la selección.";
  return null;
}

// Orden de guardado: los estándar en el orden de defaultDashboardKpiIds (que ya
// viene en STANDARD_KEY_ORDER) y los propios después, en su orden. Así la lista
// guardada no depende del orden en que se marcaron los KPIs.
export function orderKpiIds(selected: string[], standardIdsInOrder: string[]): string[] {
  const standard = new Set(standardIdsInOrder);
  const chosen = new Set(selected);
  return [
    ...standardIdsInOrder.filter((id) => chosen.has(id)),
    ...selected.filter((id) => !standard.has(id)),
  ];
}

// Nueva selección al marcar o desmarcar un KPI estándar. Los estándar van en el
// orden de STANDARD_KEY_ORDER y los propios después, en su orden actual. Así
// desmarcar y volver a marcar deja la misma lista que el default.
export function nextKpiSelection(current: string[], standardIdsInOrder: string[], id: string, checked: boolean): string[] {
  const standard = new Set(standardIdsInOrder);
  const selected = new Set(current);
  if (checked) selected.add(id);
  else selected.delete(id);
  const standardOrdered = standardIdsInOrder.filter((x) => selected.has(x));
  const customIds = current.filter((x) => !standard.has(x) && selected.has(x));
  return [...standardOrdered, ...customIds];
}

// Resultado de guardar desde el selector. Si hay invalidIds, el selector las
// quita de su borrador y avisa cuáles eran.
export type KpiSaveOutcome = { ok: true } | { ok: false; message: string; invalidIds: string[] };

export class DashboardKpiError extends Error {
  invalidMetricIds: string[];

  constructor(message: string, invalidMetricIds: string[] = []) {
    super(message);
    this.name = "DashboardKpiError";
    this.invalidMetricIds = invalidMetricIds;
  }
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

async function readError(res: Response, fallback: string): Promise<DashboardKpiError> {
  const data: unknown = await res.json().catch(() => null);
  const body = (data ?? {}) as { error?: unknown; invalid_metric_ids?: unknown };
  const message = typeof body.error === "string" && body.error ? body.error : fallback;
  return new DashboardKpiError(message, stringArray(body.invalid_metric_ids));
}

// null = nunca configurado (usar default). Array = lista guardada, en el mismo
// orden. [] = configurado con todas sus métricas archivadas: dashboard vacío,
// nunca el default.
export async function fetchDashboardKpiIds(companyId: string): Promise<string[] | null> {
  const res = await fetch(`${GET_DASHBOARD_KPIS_URL}?company_id=${encodeURIComponent(companyId)}`, {
    credentials: "include",
  });
  if (res.status === 401) {
    window.location.assign("/login");
    throw new DashboardKpiError("No autenticado");
  }
  if (!res.ok) throw await readError(res, "No pudimos cargar tus KPIs.");
  const data: unknown = await res.json();
  const ids = (data as { kpi_metric_ids?: unknown } | null)?.kpi_metric_ids;
  return Array.isArray(ids) ? stringArray(ids) : null;
}

// Guarda la selección completa (no incremental). Devuelve la lista guardada
// tal como la confirma el backend.
export async function saveDashboardKpiIds(companyId: string, ids: string[]): Promise<string[]> {
  const invalid = validateKpiSelection(ids);
  if (invalid) throw new DashboardKpiError(invalid);

  const res = await fetch(SET_DASHBOARD_KPIS_URL, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_id: companyId, kpi_metric_ids: ids }),
  });
  if (res.status === 401) {
    window.location.assign("/login");
    throw new DashboardKpiError("No autenticado");
  }
  if (!res.ok) throw await readError(res, "No pudimos guardar la selección.");
  const data: unknown = await res.json();
  const saved = (data as { kpi_metric_ids?: unknown } | null)?.kpi_metric_ids;
  return Array.isArray(saved) ? stringArray(saved) : ids;
}
