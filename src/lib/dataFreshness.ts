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
