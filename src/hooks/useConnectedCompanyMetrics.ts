import { useEffect, useState } from "react";
import {
  LIST_FINANCIAL_METRICS_URL,
  LIST_FINANCIAL_RECORDS_URL,
  type FinancialMetricDef,
} from "@/lib/financialData";
import { buildEntriesFromRecords } from "@/lib/metricPeriod";
import type { MetricDef } from "@/lib/metrics";

const toMetricDef = (d: FinancialMetricDef): MetricDef => ({
  id: d.metric_id,
  name: d.name,
  category: d.category,
  metric_type: d.metric_type,
  input_key: d.input_key,
  formula_expression: d.formula_expression,
  unit: d.unit,
  formula: d.formula_expression,
  description: d.description ?? null,
  why_it_matters: d.why_it_matters ?? null,
  benchmark: d.benchmark ?? null,
  order_index: d.display_order,
});

/**
 * Read-only counterpart of useFinancialMetrics, for a fund member viewing a
 * CONNECTED company's public metrics — not the company's own owner/member.
 * list-financial-metrics/list-financial-records already come pre-filtered
 * to only public metrics for this caller type (backend-enforced), so there's
 * no privacy toggle, no submit, no import log here — nothing to write.
 */
export function useConnectedCompanyMetrics(companyId: string | null) {
  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [entries, setEntries] = useState<Record<string, Record<string, number>>>({});
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setMetrics([]);
      setEntries({});
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setForbidden(false);
    (async () => {
      try {
        const qs = `?company_id=${encodeURIComponent(companyId)}`;
        const [defsRes, recordsRes] = await Promise.all([
          fetch(`${LIST_FINANCIAL_METRICS_URL}${qs}`, { credentials: "include" }),
          fetch(`${LIST_FINANCIAL_RECORDS_URL}${qs}`, { credentials: "include" }),
        ]);
        if (cancelled) return;

        if (defsRes.status === 403 || recordsRes.status === 403) {
          setForbidden(true);
          setMetrics([]);
          setEntries({});
          return;
        }

        let defs: FinancialMetricDef[] = [];
        if (defsRes.ok) {
          const data = await defsRes.json();
          defs = Array.isArray(data?.metrics) ? data.metrics : [];
        }
        const mapped = defs.map(toMetricDef);
        setMetrics(mapped);

        // Métricas no compartidas vienen ausentes del objeto (undefined), no
        // null — buildEntriesFromRecords ya filtra ambos casos por igual.
        let nextEntries: Record<string, Record<string, number>> = {};
        if (recordsRes.ok) {
          const data = await recordsRes.json();
          const records: Record<string, unknown>[] = Array.isArray(data?.records) ? data.records : [];
          nextEntries = buildEntriesFromRecords(mapped, records);
        }
        setEntries(nextEntries);
      } catch {
        if (!cancelled) {
          setMetrics([]);
          setEntries({});
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return { metrics, entries, loading, forbidden };
}
