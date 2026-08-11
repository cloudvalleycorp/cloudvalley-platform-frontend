import { useQuery } from "@tanstack/react-query";
import {
  LIST_FINANCIAL_METRICS_URL,
  LIST_FINANCIAL_RECORDS_URL,
  type FinancialMetricDef,
} from "@/lib/financialData";
import { buildEntriesFromRecords } from "@/lib/metricPeriod";
import { toMetricDef, type MetricDef } from "@/lib/metrics";

type PeriodRange = { from: string; to: string };

type Result = {
  metrics: MetricDef[];
  entries: Record<string, Record<string, number>>;
  forbidden: boolean;
};

async function fetchConnectedCompanyMetrics(companyId: string, range: PeriodRange): Promise<Result> {
  const qs = `?company_id=${encodeURIComponent(companyId)}`;
  const [defsRes, recordsRes] = await Promise.all([
    fetch(`${LIST_FINANCIAL_METRICS_URL}${qs}`, { credentials: "include" }),
    fetch(`${LIST_FINANCIAL_RECORDS_URL}${qs}&from=${range.from}&to=${range.to}`, { credentials: "include" }),
  ]);

  if (defsRes.status === 403 || recordsRes.status === 403) {
    return { metrics: [], entries: {}, forbidden: true };
  }

  let defs: FinancialMetricDef[] = [];
  if (defsRes.ok) {
    const data = await defsRes.json();
    defs = Array.isArray(data?.metrics) ? data.metrics : [];
  }
  // list-metrics no filtra las métricas soft-deleted (active: false) — bug
  // de backend reportado 2026-08-09, se filtra acá para no mostrarle al
  // inversor una métrica que el founder ya eliminó.
  const mapped = defs.filter((d) => d.active !== false).map(toMetricDef);

  // Métricas no compartidas vienen ausentes del objeto (undefined), no
  // null — buildEntriesFromRecords ya filtra ambos casos por igual.
  let entries: Record<string, Record<string, number>> = {};
  if (recordsRes.ok) {
    const data = await recordsRes.json();
    const records: Record<string, unknown>[] = Array.isArray(data?.records) ? data.records : [];
    entries = buildEntriesFromRecords(mapped, records);
  }

  return { metrics: mapped, entries, forbidden: false };
}

/**
 * Read-only counterpart of useFinancialMetrics, for a fund member viewing a
 * CONNECTED company's public metrics — not the company's own owner/member.
 * list-metrics/list-records already come pre-filtered to only public
 * metrics for this caller type (backend-enforced), so there's no privacy
 * toggle, no submit, no import log here — nothing to write.
 */
export function useConnectedCompanyMetrics(companyId: string | null, range: PeriodRange) {
  const { data, isLoading } = useQuery({
    queryKey: ["connected-company-metrics", companyId, range.from, range.to],
    queryFn: () => fetchConnectedCompanyMetrics(companyId!, range),
    enabled: !!companyId,
  });

  return {
    metrics: data?.metrics ?? [],
    entries: data?.entries ?? {},
    loading: isLoading,
    forbidden: data?.forbidden ?? false,
  };
}
