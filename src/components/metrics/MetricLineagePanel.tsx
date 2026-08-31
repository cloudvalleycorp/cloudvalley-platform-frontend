import { useEffect, useState } from "react";
import { Link2 } from "lucide-react";
import { formatMetricValue, sourceSettingsPath, type MetricDef, type RawField } from "@/lib/metrics";
import { resolveMetricSources, resolveMetricSourceLeaves, type LineageLeaf } from "@/lib/metricLineage";
import { GET_METRIC_LINEAGE_URL, LIST_RAW_FIELD_VALUES_URL, type RawFieldValueRow } from "@/lib/metricIntelligence";
import { EVALUATE_METRICS_URL, type LineageNode } from "@/lib/financialData";
import { toPeriodString, periodKey, MONTH_LABELS } from "@/lib/metricPeriod";
import { QuerySummary } from "@/components/metrics/query-builder/QuerySummary";
import type { AggregationNode } from "@/lib/querySpec";

type Props = {
  metric: MetricDef;
  allMetrics: MetricDef[];
  rawFields: RawField[];
  companyId: string | null;
  // Para el desglose por fuente: valor de métricas "input" (carga manual)
  // referenciadas dentro de la query — ya en memoria en el caller
  // (useFinancialMetrics), evita un fetch nuevo. Sin esto, una hoja "input"
  // igual se lista (nombre + "Valor ingresado manualmente") pero sin monto.
  entries?: Record<string, Record<string, number>>;
};

function aggregateRawValues(node: AggregationNode, rows: RawFieldValueRow[]): number {
  if (node.aggregation === "count_distinct") return new Set(rows.map((r) => r.normalized_value)).size;
  if (node.aggregation === "count") return rows.length;
  const nums = rows.map((r) => Number(r.normalized_value)).filter((n) => Number.isFinite(n));
  const sum = nums.reduce((a, b) => a + b, 0);
  return node.aggregation === "average" ? (nums.length > 0 ? sum / nums.length : 0) : sum;
}

type LeafResult = { leaf: LineageLeaf; value: number | null; computable: boolean };

// Lineage — de dónde sale este número. Tres capas: un trail instantáneo
// best-effort calculado en el cliente (resolveMetricSources, siempre
// disponible, multi-fuente aware), el trail real de backend si
// get-metric-lineage responde (todavía no llega a cell_ref — ver Notas del
// handoff de backend), y — cuando hay 2+ fuentes — un desglose real de
// cuánto aportó cada una este período (sumando list-raw-field-values por
// fuente, 100% determinístico, sin IA) junto al total real de
// evaluate-metrics como referencia cruzada honesta. Nunca se muestra un
// número "mágico": si no hay ninguna fuente resuelta, se dice explícitamente,
// y una hoja con filtros/ventana (que no se puede resumar sin re-implementar
// esa lógica del lado del cliente) se marca "no desglosable" en vez de
// mostrar un número inventado.
export function MetricLineagePanel({ metric, allMetrics, rawFields, companyId, entries }: Props) {
  const clientSources = resolveMetricSources(metric, allMetrics, rawFields);
  const [backendLineage, setBackendLineage] = useState<LineageNode[] | null>(null);

  const now = new Date();
  const period = toPeriodString(now.getMonth() + 1, now.getFullYear());

  useEffect(() => {
    setBackendLineage(null);
    if (!companyId || metric.metric_type !== "calculated") return;
    fetch(`${GET_METRIC_LINEAGE_URL}?company_id=${encodeURIComponent(companyId)}&metric_id=${encodeURIComponent(metric.id)}&period=${period}`, {
      credentials: "include",
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setBackendLineage(Array.isArray(data?.lineage) ? data.lineage : null))
      .catch(() => setBackendLineage(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, metric.id, metric.metric_type]);

  const leaves = resolveMetricSourceLeaves(metric, allMetrics, rawFields);
  const [leafResults, setLeafResults] = useState<LeafResult[] | null>(null);
  const [loadingBreakdown, setLoadingBreakdown] = useState(false);
  const [totalValue, setTotalValue] = useState<number | null>(null);

  useEffect(() => {
    setLeafResults(null);
    setTotalValue(null);
    if (!companyId || leaves.length < 2) return;
    let cancelled = false;
    setLoadingBreakdown(true);
    (async () => {
      const results: LeafResult[] = [];
      for (const leaf of leaves) {
        if (leaf.kind === "input") {
          const value = entries?.[leaf.metricId]?.[periodKey(now.getMonth() + 1, now.getFullYear())] ?? null;
          results.push({ leaf, value, computable: value != null });
          continue;
        }
        // Filtros/ventana: sumar los valores crudos de la columna sola ya no
        // reproduce lo que calcula backend (que aplica ese filtro/ventana) —
        // mostrar un número igual sería inventarlo. Se deja "no desglosable".
        if (leaf.node.filters.length > 0 || leaf.node.window) {
          results.push({ leaf, value: null, computable: false });
          continue;
        }
        const key = leaf.node.aggregation === "count_distinct" ? leaf.node.distinct_field_key : leaf.node.field_key;
        try {
          const res = await fetch(
            `${LIST_RAW_FIELD_VALUES_URL}?company_id=${encodeURIComponent(companyId)}&connection_id=${encodeURIComponent(leaf.connectionId)}&field_key=${encodeURIComponent(key ?? "")}&period=${period}`,
            { credentials: "include" }
          );
          const data = res.ok ? await res.json() : null;
          const rows: RawFieldValueRow[] = Array.isArray(data?.values) ? data.values : [];
          results.push({ leaf, value: aggregateRawValues(leaf.node, rows), computable: true });
        } catch {
          results.push({ leaf, value: null, computable: false });
        }
      }
      if (cancelled) return;
      setLeafResults(results);
      try {
        const totalRes = await fetch(EVALUATE_METRICS_URL, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_id: companyId, metric_ids: [metric.id], period }),
        });
        const totalData = totalRes.ok ? await totalRes.json() : null;
        const v = totalData?.values?.[metric.id]?.[period];
        if (!cancelled) setTotalValue(typeof v === "number" ? v : null);
      } catch {
        if (!cancelled) setTotalValue(null);
      }
      if (!cancelled) setLoadingBreakdown(false);
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, metric.id, period]);

  if (metric.metric_type === "input") {
    return (
      <div>
        <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Origen</h4>
        <p className="text-sm text-muted-foreground">Valor ingresado manualmente.</p>
      </div>
    );
  }

  return (
    <div>
      <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
        <Link2 size={12} strokeWidth={1.5} /> Origen
      </h4>
      {backendLineage && backendLineage.length > 0 ? (
        <ul className="space-y-1.5 text-sm">
          {backendLineage.map((node, i) => (
            <li key={i} className="text-muted-foreground">
              {node.sheet_name ?? node.workbook_id ?? node.source_id ?? "Fuente"} — {node.formula}
            </li>
          ))}
        </ul>
      ) : clientSources.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Esta métrica todavía no está conectada a ninguna fuente de datos — su fórmula no referencia ningún campo
          mapeado.
        </p>
      ) : clientSources.length === 1 ? (
        <p className="text-sm">
          Este cálculo viene de{" "}
          <a href={sourceSettingsPath("sheet", clientSources[0].connectionId) ?? undefined} className="underline underline-offset-2">
            {clientSources[0].connectionLabel}
          </a>
          .
        </p>
      ) : (
        <div className="text-sm">
          <p className="mb-1">Este cálculo combina datos de {clientSources.length} fuentes:</p>
          <ul className="space-y-1">
            {clientSources.map((s) => (
              <li key={s.connectionId}>
                <a href={sourceSettingsPath("sheet", s.connectionId) ?? undefined} className="underline underline-offset-2">
                  {s.connectionLabel}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      {leaves.length >= 2 && (
        <div className="mt-3 pt-3 border-t border-border">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <p className="text-xs text-muted-foreground">
              Desglose de {MONTH_LABELS[now.getMonth()]} {now.getFullYear()}
            </p>
            {totalValue != null && (
              <span className="text-xs font-medium tabular-nums">Total real: {formatMetricValue(totalValue, metric.unit)}</span>
            )}
          </div>
          {loadingBreakdown ? (
            <p className="text-xs text-muted-foreground">Calculando el aporte de cada fuente…</p>
          ) : (
            <ul className="space-y-1.5">
              {(leafResults ?? []).map((r, i) => (
                <li key={i} className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs truncate">{r.leaf.kind === "aggregation" ? r.leaf.connectionLabel : r.leaf.metricName}</p>
                    <p className="text-[11px] text-tertiary truncate">
                      {r.leaf.kind === "aggregation" ? (
                        <QuerySummary query={r.leaf.node} rawFields={rawFields} className="text-[11px] text-tertiary" />
                      ) : (
                        "Valor ingresado manualmente"
                      )}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-mono tabular-nums text-muted-foreground">
                    {r.computable ? formatMetricValue(r.value, metric.unit) : "no desglosable"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
