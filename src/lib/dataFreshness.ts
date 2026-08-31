import type { GoogleAccount, SheetConnection } from "@/lib/sheetsIntegration";

// CAPA: heurístico puro de frescura — categoriza un timestamp real
// (last_synced_at) en una etiqueta de UI. No es un dato de backend (backend
// no tiene un concepto de "freshness_sla" evaluado todavía, ver
// set-connection-sync-settings), es una categorización determinística sobre
// un dato que sí es real — nunca inventa un número.
export type FreshnessLabel = "live" | "recent" | "stale" | "critical" | "never";

const RECENT_DAYS = 2;
const STALE_DAYS = 7;
const CRITICAL_DAYS = 21;

export function computeFreshness(lastSyncedAt: string | null): { label: FreshnessLabel; ageDays: number | null } {
  if (!lastSyncedAt) return { label: "never", ageDays: null };
  const ageMs = Date.now() - new Date(lastSyncedAt).getTime();
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  if (ageDays < RECENT_DAYS) return { label: "live", ageDays };
  if (ageDays < STALE_DAYS) return { label: "recent", ageDays };
  if (ageDays < CRITICAL_DAYS) return { label: "stale", ageDays };
  return { label: "critical", ageDays };
}

export const FRESHNESS_LABELS: Record<FreshnessLabel, string> = {
  live: "Al día",
  recent: "Reciente",
  stale: "Desactualizada",
  critical: "Muy desactualizada",
  never: "Nunca sincronizada",
};

export function freshnessBadgeVariant(label: FreshnessLabel): "success" | "secondary" | "outline" | "destructive" {
  switch (label) {
    case "live":
      return "success";
    case "recent":
      return "secondary";
    case "stale":
      return "outline";
    case "critical":
    case "never":
      return "destructive";
  }
}

// Un solo estado por fuente — antes "Frescura" y "Estado" eran dos columnas
// con dos cálculos independientes que podían contradecirse (ej: una conexión
// nunca sincronizada podía mostrar "Nunca sincronizada" en Frescura y "Al
// día" en Estado, porque Estado no miraba el timestamp en absoluto). Un solo
// cálculo con prioridad de severidad elimina esa contradicción de raíz.
export type SourceStatus = "reconnect_required" | "sync_error" | "never_synced" | "critical" | "stale" | "recent" | "up_to_date";

export const SOURCE_STATUS_LABELS: Record<SourceStatus, string> = {
  reconnect_required: "Reconectar",
  sync_error: "Error de sync",
  never_synced: "Nunca sincronizada",
  critical: "Muy desactualizada",
  stale: "Desactualizada",
  recent: "Reciente",
  up_to_date: "Al día",
};

export function computeSourceStatus(connection: Pick<SheetConnection, "last_synced_at" | "last_sync_status">, account: Pick<GoogleAccount, "reconnect_required"> | undefined): SourceStatus {
  if (account?.reconnect_required) return "reconnect_required";
  if (connection.last_sync_status && connection.last_sync_status !== "success") return "sync_error";
  const { label } = computeFreshness(connection.last_synced_at);
  if (label === "never") return "never_synced";
  if (label === "critical") return "critical";
  if (label === "stale") return "stale";
  if (label === "recent") return "recent";
  return "up_to_date";
}
