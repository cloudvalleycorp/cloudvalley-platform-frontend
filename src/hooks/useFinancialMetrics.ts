import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleMembershipError } from "@/lib/membership";
import {
  LIST_FINANCIAL_METRICS_URL,
  LIST_FINANCIAL_RECORDS_URL,
  LIST_FINANCIAL_METRIC_PRIVACY_URL,
  UPDATE_FINANCIAL_METRIC_PRIVACY_URL,
  LIST_FINANCIAL_IMPORT_LOG_URL,
  SUBMIT_FINANCIAL_RECORD_URL,
  type FinancialMetricDef,
  type ImportLogEntry,
} from "@/lib/financialData";
import { toMetricDef, type MetricDef } from "@/lib/metrics";
import { periodKey, buildEntriesFromRecords } from "@/lib/metricPeriod";
import type { FundRequiredMetricRow } from "@/lib/metricRequirements";

type PeriodRange = { from: string; to: string };

type FinancialData = {
  metrics: MetricDef[];
  entries: Record<string, Record<string, number>>;
  privacy: Record<string, boolean>;
  fundRequired: FundRequiredMetricRow[];
};

async function fetchFinancialData(companyId: string, range: PeriodRange): Promise<FinancialData> {
  const qs = `?company_id=${encodeURIComponent(companyId)}`;
  const recordsQs = `${qs}&from=${range.from}&to=${range.to}`;
  const [defsRes, recordsRes, privacyRes] = await Promise.all([
    fetch(`${LIST_FINANCIAL_METRICS_URL}${qs}`, { credentials: "include" }),
    fetch(`${LIST_FINANCIAL_RECORDS_URL}${recordsQs}`, { credentials: "include" }),
    fetch(`${LIST_FINANCIAL_METRIC_PRIVACY_URL}${qs}`, { credentials: "include" }),
  ]);

  let defs: FinancialMetricDef[] = [];
  if (defsRes.ok) {
    const data = await defsRes.json();
    defs = Array.isArray(data?.metrics) ? data.metrics : [];
  }
  // Contrato ampliado 2026-08-16: list-metrics ahora también trae filas
  // origin="fund_required" (metric_id null, no son MetricDefinition propias
  // todavía) mezcladas con el catálogo — se parten ANTES de mapear con
  // toMetricDef, que asume una métrica real.
  const ownDefs = defs.filter((d) => d.origin !== "fund_required");
  const fundRequiredDefs = defs.filter((d) => d.origin === "fund_required");
  // list-metrics no filtra las métricas soft-deleted (active: false) — bug
  // de backend reportado 2026-08-09, se filtra acá para que "Eliminar" no
  // deje la métrica visible en ningún lado.
  const mapped = ownDefs.filter((d) => d.active !== false).map(toMetricDef);
  const fundRequired: FundRequiredMetricRow[] = fundRequiredDefs.map((d) => ({
    requirement_id: d.requirement_id ?? "",
    source_fund_id: d.source_fund_id ?? "",
    source_fund_name: d.source_fund_name ?? "",
    is_mandatory: !!d.is_mandatory,
    linked_own_metric_id: d.linked_own_metric_id ?? null,
    compliance_status: d.compliance_status ?? "unfulfilled",
    name: d.name,
    description: d.description ?? null,
    why_it_matters: d.why_it_matters ?? null,
    unit: d.unit ?? "",
    value_type: d.value_type ?? "count",
    periodicity: d.periodicity ?? "monthly",
  }));

  let entries: Record<string, Record<string, number>> = {};
  if (recordsRes.ok) {
    const data = await recordsRes.json();
    const records: Record<string, unknown>[] = Array.isArray(data?.records) ? data.records : [];
    entries = buildEntriesFromRecords(mapped, records);
  }

  const privacy: Record<string, boolean> = {};
  if (privacyRes.ok) {
    const data = await privacyRes.json();
    const list: { metric_id: string; is_public: boolean }[] = Array.isArray(data?.privacy) ? data.privacy : [];
    for (const p of list) privacy[p.metric_id] = p.is_public;
  }

  return { metrics: mapped, entries, privacy, fundRequired };
}

async function fetchImportLog(companyId: string): Promise<ImportLogEntry[]> {
  const res = await fetch(`${LIST_FINANCIAL_IMPORT_LOG_URL}?company_id=${encodeURIComponent(companyId)}`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.logs) ? data.logs : [];
}

/**
 * CAPA: Services / API Layer del Growth Tracker — habla con el catálogo real
 * (lib/financialData.ts) y expone acciones (submitValues, togglePrivacy) a la
 * Presentation Layer. Mismo patrón que useConnectedCompanyMetrics.ts,
 * useSharedFinancialReports.ts, useRawFieldValues.ts, useMetricReportData.ts.
 *
 * Data layer for all Growth Tracker categories (Revenue, Cash & Efficiency,
 * Acquisition, Retention, and any custom ones), backed by the GCP financial
 * data module. Drives InputsPanel/CalculatedMetricsGrid/AnnualGrid/
 * MetricInfoSheet.
 */
export function useFinancialMetrics(companyId: string | null, range: PeriodRange) {
  const queryClient = useQueryClient();
  const [notEnabled, setNotEnabled] = useState(false);

  const dataQueryKey = ["financial-metrics", companyId, range.from, range.to] as const;
  const { data, isLoading: loading, isFetching: refreshing } = useQuery({
    queryKey: dataQueryKey,
    queryFn: () => fetchFinancialData(companyId!, range),
    enabled: !!companyId,
  });
  const metrics = data?.metrics ?? [];
  const entries = data?.entries ?? {};
  const privacy = data?.privacy ?? {};
  const fundRequired = data?.fundRequired ?? [];

  const logsQueryKey = ["financial-import-log", companyId] as const;
  const { data: logs = [], isLoading: loadingLogs } = useQuery({
    queryKey: logsQueryKey,
    queryFn: () => fetchImportLog(companyId!),
    enabled: !!companyId,
  });

  const inputKeyByMetricId = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of metrics) {
      if (m.metric_type === "input" && m.input_key) map[m.id] = m.input_key;
    }
    return map;
  }, [metrics]);

  const reload = () => queryClient.invalidateQueries({ queryKey: dataQueryKey });
  const reloadLogs = () => queryClient.invalidateQueries({ queryKey: logsQueryKey });

  /** POST submit-financial-record for one period. Returns false on failure (already toasted, except the "not enabled" case — see `notEnabled`). */
  const submitValues = async (periodStr: string, values: Record<string, number>): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(SUBMIT_FINANCIAL_RECORD_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, period: periodStr, ...values }),
      });
      if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        const msg: string = data?.error ?? "";
        if (/manual_form/i.test(msg) || /habilitad/i.test(msg)) {
          setNotEnabled(true);
          return false;
        }
        toast.error(msg || "Solicitud inválida");
        return false;
      }
      if (await handleMembershipError(res)) return false;
      setNotEnabled(false);
      const resBody = await res.json();
      if (Array.isArray(resBody?.row_errors)) {
        for (const e of resBody.row_errors) toast.error(`${e.field}: ${e.reason}`);
      }
      reloadLogs();
      return true;
    } catch {
      toast.error("No se pudieron guardar los datos");
      return false;
    }
  };

  const applyLocalEntry = (metricId: string, month: number, year: number, value: number) => {
    queryClient.setQueryData<FinancialData>(dataQueryKey, (prev) =>
      prev
        ? {
            ...prev,
            entries: {
              ...prev.entries,
              [metricId]: { ...(prev.entries[metricId] ?? {}), [periodKey(month, year)]: value },
            },
          }
        : prev
    );
  };

  const togglePrivacy = async (metricId: string, next: boolean) => {
    if (!companyId) return;
    queryClient.setQueryData<FinancialData>(dataQueryKey, (prev) =>
      prev ? { ...prev, privacy: { ...prev.privacy, [metricId]: next } } : prev
    );
    try {
      const res = await fetch(UPDATE_FINANCIAL_METRIC_PRIVACY_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, metric_id: metricId, is_public: next }),
      });
      if (await handleMembershipError(res)) {
        queryClient.setQueryData<FinancialData>(dataQueryKey, (prev) =>
          prev ? { ...prev, privacy: { ...prev.privacy, [metricId]: !next } } : prev
        );
      }
    } catch {
      toast.error("No se pudo actualizar la privacidad");
      queryClient.setQueryData<FinancialData>(dataQueryKey, (prev) =>
        prev ? { ...prev, privacy: { ...prev.privacy, [metricId]: !next } } : prev
      );
    }
  };

  return {
    metrics,
    entries,
    privacy,
    fundRequired,
    loading,
    refreshing,
    notEnabled,
    logs,
    loadingLogs,
    submitValues,
    applyLocalEntry,
    togglePrivacy,
    inputKeyByMetricId,
    reload,
    reloadLogs,
  };
}
