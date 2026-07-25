import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { handleMembershipError } from "@/lib/membership";
import {
  LIST_FINANCIAL_METRICS_URL,
  LIST_FINANCIAL_RECORDS_URL,
  LIST_FINANCIAL_METRIC_PRIVACY_URL,
  UPDATE_FINANCIAL_METRIC_PRIVACY_URL,
  SUBMIT_FINANCIAL_RECORD_URL,
  type FinancialMetricDef,
  type FinancialMetricKey,
} from "@/lib/financialData";
import type { MetricDef } from "@/lib/metrics";

const periodKey = (m: number, y: number) => `${y}-${m}`;

function parsePeriod(period: string): { y: number; m: number } {
  const [y, m] = period.split("-").map(Number);
  return { y, m };
}

const toMetricDef = (d: FinancialMetricDef): MetricDef => ({
  id: d.metric_id,
  name: d.name,
  category: d.category,
  metric_type: d.metric_type,
  input_key: d.input_key,
  formula_expression: d.formula_expression,
  unit: d.unit,
  formula: d.formula_expression,
  description: null,
  why_it_matters: null,
  benchmark: null,
  order_index: d.display_order,
});

/**
 * Data layer for the two Growth Tracker categories backed by the GCP
 * financial-data module (Revenue, Cash & Efficiency) — mirrors the shape of
 * the legacy Supabase metric_configs/metric_entries/metric_privacy layer so
 * both datasets can drive the same presentational components
 * (InputsPanel/CalculatedMetricsGrid/AnnualGrid/MetricInfoSheet).
 */
export function useFinancialMetrics(companyId: string | null) {
  const [metrics, setMetrics] = useState<MetricDef[]>([]);
  const [entries, setEntries] = useState<Record<string, Record<string, number>>>({});
  const [privacy, setPrivacy] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  const inputKeyByMetricId = useMemo(() => {
    const map: Record<string, FinancialMetricKey> = {};
    for (const m of metrics) {
      if (m.metric_type === "input" && m.input_key) map[m.id] = m.input_key as FinancialMetricKey;
    }
    return map;
  }, [metrics]);

  const load = async () => {
    if (!companyId) {
      setMetrics([]);
      setEntries({});
      setPrivacy({});
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const qs = `?company_id=${encodeURIComponent(companyId)}`;
      const [defsRes, recordsRes, privacyRes] = await Promise.all([
        fetch(`${LIST_FINANCIAL_METRICS_URL}${qs}`, { credentials: "include" }),
        fetch(`${LIST_FINANCIAL_RECORDS_URL}${qs}`, { credentials: "include" }),
        fetch(`${LIST_FINANCIAL_METRIC_PRIVACY_URL}${qs}`, { credentials: "include" }),
      ]);

      let defs: FinancialMetricDef[] = [];
      if (defsRes.ok) {
        const data = await defsRes.json();
        defs = Array.isArray(data?.metrics) ? data.metrics : [];
      }
      const mapped = defs.map(toMetricDef);
      setMetrics(mapped);

      const nextEntries: Record<string, Record<string, number>> = {};
      if (recordsRes.ok) {
        const data = await recordsRes.json();
        const records: Record<string, unknown>[] = Array.isArray(data?.records) ? data.records : [];
        for (const def of mapped) {
          if (def.metric_type !== "input" || !def.input_key) continue;
          for (const rec of records) {
            const v = rec[def.input_key];
            const period = rec.period;
            if (typeof v !== "number" || typeof period !== "string") continue;
            const { y, m } = parsePeriod(period);
            nextEntries[def.id] ??= {};
            nextEntries[def.id][periodKey(m, y)] = v;
          }
        }
      }
      setEntries(nextEntries);

      const nextPrivacy: Record<string, boolean> = {};
      if (privacyRes.ok) {
        const data = await privacyRes.json();
        const list: { metric_id: string; is_public: boolean }[] = Array.isArray(data?.privacy) ? data.privacy : [];
        for (const p of list) nextPrivacy[p.metric_id] = p.is_public;
      }
      setPrivacy(nextPrivacy);
    } catch {
      toast.error("No se pudieron cargar las métricas financieras");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  /** POST submit-financial-record for one period. Returns false on failure (already toasted). */
  const submitValues = async (periodStr: string, values: Record<string, number>): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(SUBMIT_FINANCIAL_RECORD_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, period: periodStr, ...values }),
      });
      if (await handleMembershipError(res)) return false;
      const data = await res.json();
      if (Array.isArray(data?.row_errors)) {
        for (const e of data.row_errors) toast.error(`${e.field}: ${e.reason}`);
      }
      return true;
    } catch {
      toast.error("No se pudieron guardar los datos");
      return false;
    }
  };

  const applyLocalEntry = (metricId: string, month: number, year: number, value: number) => {
    setEntries((prev) => ({
      ...prev,
      [metricId]: { ...(prev[metricId] ?? {}), [periodKey(month, year)]: value },
    }));
  };

  const togglePrivacy = async (metricId: string, next: boolean) => {
    if (!companyId) return;
    setPrivacy((p) => ({ ...p, [metricId]: next }));
    try {
      const res = await fetch(UPDATE_FINANCIAL_METRIC_PRIVACY_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, metric_id: metricId, is_public: next }),
      });
      if (await handleMembershipError(res)) {
        setPrivacy((p) => ({ ...p, [metricId]: !next }));
      }
    } catch {
      toast.error("No se pudo actualizar la privacidad");
      setPrivacy((p) => ({ ...p, [metricId]: !next }));
    }
  };

  return { metrics, entries, privacy, loading, submitValues, applyLocalEntry, togglePrivacy, inputKeyByMetricId };
}
