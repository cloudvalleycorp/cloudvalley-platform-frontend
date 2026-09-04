import { STANDARD_KEY_ORDER } from "@/lib/metricRequirements";

// Extraído de MetricsOverviewTab.tsx — preferencia de qué KPIs estándar
// mostrar, compartida entre Metrics > Overview y el Company Health del
// Dashboard (una sola lista de "qué me importa", no una por pantalla). Ver
// docs/design-system-command-center.md.
export const VISIBLE_KPIS_KEY = "cv:metrics:visibleKpis";

export function loadVisibleKpis(): Set<string> {
  try {
    const raw = localStorage.getItem(VISIBLE_KPIS_KEY);
    if (!raw) return new Set(STANDARD_KEY_ORDER);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return new Set(STANDARD_KEY_ORDER);
    return new Set(parsed.filter((k) => STANDARD_KEY_ORDER.includes(k)));
  } catch {
    return new Set(STANDARD_KEY_ORDER);
  }
}

export function saveVisibleKpis(keys: Set<string>) {
  localStorage.setItem(VISIBLE_KPIS_KEY, JSON.stringify(Array.from(keys)));
}
