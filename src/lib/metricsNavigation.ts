// CAPA: navegación pura de la sección Metrics — un solo lugar que sabe qué
// tabs existen y cómo se leen/escriben en la URL, sin tocar red ni estado de
// negocio. `/metrics?tab=...`, default "overview".
export type MetricsTab = "overview" | "sources" | "health" | "explorer";

const VALID_TABS: MetricsTab[] = ["overview", "sources", "health", "explorer"];

export function parseMetricsTab(searchParams: URLSearchParams): MetricsTab {
  const raw = searchParams.get("tab");
  return (VALID_TABS as string[]).includes(raw ?? "") ? (raw as MetricsTab) : "overview";
}

export function metricsTabUrl(tab: MetricsTab): string {
  return tab === "overview" ? "/metrics" : `/metrics?tab=${tab}`;
}
