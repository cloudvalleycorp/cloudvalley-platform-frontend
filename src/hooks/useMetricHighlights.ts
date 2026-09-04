import { useState } from "react";
import { LIST_METRIC_HIGHLIGHTS_URL, type MetricHighlight } from "@/lib/metricIntelligence";
import { toPeriodString } from "@/lib/metricPeriod";

/**
 * Extraído de MetricsOverviewTab.tsx (Destacados) para reusar el mismo feed
 * de "qué cambió" desde el Dashboard — mismo endpoint, mismo criterio de
 * disparo manual (nunca se pide solo al cargar la pantalla, es una llamada
 * de IA con costo y rate limit real).
 */
export function useMetricHighlights(companyId: string | null) {
  const [highlights, setHighlights] = useState<MetricHighlight[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  const load = async (period: string = toPeriodString(new Date().getMonth() + 1, new Date().getFullYear())) => {
    if (!companyId) return;
    setLoading(true);
    setError(false);
    try {
      const res = await fetch(`${LIST_METRIC_HIGHLIGHTS_URL}?company_id=${encodeURIComponent(companyId)}&period=${period}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setError(true);
        return;
      }
      const data = await res.json();
      setHighlights(Array.isArray(data?.highlights) ? data.highlights : []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  return { highlights, loading, error, load };
}
