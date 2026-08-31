import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Sparkles } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { FundRequiredMetricsSection } from "@/components/metrics/FundRequiredMetricsSection";
import { MetricValueCard } from "@/components/metrics/MetricValueCard";
import { useEvaluatedMetrics } from "@/hooks/useEvaluatedMetrics";
import { STANDARD_KEY_LABELS, STANDARD_KEY_ORDER, type FundRequiredMetricRow } from "@/lib/metricRequirements";
import { formatMetricValue, type MetricDef } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import type { MetricClassWarning, MetricScenario } from "@/lib/financialData";
import { EXPLAIN_METRIC_DISCREPANCY_URL, LIST_METRIC_HIGHLIGHTS_URL, type ExplainMetricDiscrepancyResponse, type MetricHighlight } from "@/lib/metricIntelligence";
import { toPeriodString } from "@/lib/metricPeriod";

const SCENARIO_LABELS: Record<MetricScenario, string> = { actual: "Real", forecast: "Forecast", budget: "Presupuesto" };

type Props = {
  companyId: string | null;
  metrics: MetricDef[];
  warnings: MetricClassWarning[];
  fundRequired: FundRequiredMetricRow[];
  loading: boolean;
  onChanged: () => void;
  onGoToExplorer: (fulfillRequirementId?: string) => void;
  // Deep-link directo a una métrica puntual (/metrics/:id) — antes cualquier
  // click en "info" de una card llevaba al Explorador genérico, sin la
  // métrica preseleccionada.
  onOpenMetric: (metricId: string) => void;
};

// Presets relativos, no meses calendario hardcodeados (se rompería con el
// tiempo) — mismo criterio que el resto del rediseño de esta pasada.
const RANGE_PRESETS = [
  { months: 3, label: "3 meses" },
  { months: 6, label: "6 meses" },
  { months: 12, label: "12 meses" },
] as const;

function currentValueOf(m: MetricDef, values: Record<string, Record<string, number>>): number | null {
  const series = values[m.id] ?? {};
  const periods = Object.keys(series).sort();
  return periods.length > 0 ? (series[periods[periods.length - 1]] ?? null) : null;
}

// Diferencia entre el mínimo y el máximo del grupo en conflicto — mismo dato
// que ya evalúa el grid principal (useEvaluatedMetrics), sin un request más.
function diffPctLabel(group: MetricDef[], values: Record<string, Record<string, number>>): string | null {
  const nums = group.map((m) => currentValueOf(m, values)).filter((v): v is number => v != null);
  if (nums.length < 2) return null;
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  if (min === 0) return null;
  const pct = ((max - min) / Math.abs(min)) * 100;
  return `${pct.toFixed(1)}% de diferencia`;
}

function lastNPeriodSpec(months: number) {
  const now = new Date();
  const to = toPeriodString(now.getMonth() + 1, now.getFullYear());
  const fromDate = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const from = toPeriodString(fromDate.getMonth() + 1, fromDate.getFullYear());
  return { period_from: from, period_to: to };
}

// Overview — capa ChartMogul-style de datos confiables: grilla de los 8 KPIs
// estándar (STANDARD_KEY_ORDER, el enum real que definió backend, no la
// lista aspiracional de 14 del spec original), requisitos de fondos, y
// Destacados real (list-metric-highlights, ver Notas generales del handoff
// de backend — no bloqueante por rate limit, puede volver sin `description`).
export function MetricsOverviewTab({ companyId, metrics, warnings, fundRequired, loading, onChanged, onGoToExplorer, onOpenMetric }: Props) {
  const standardMetrics = useMemo(() => metrics.filter((m) => m.metric_class === "standard"), [metrics]);
  const byKey = useMemo(() => {
    const map = new Map<string, MetricDef[]>();
    for (const m of standardMetrics) {
      if (!m.standard_key) continue;
      const list = map.get(m.standard_key) ?? [];
      list.push(m);
      map.set(m.standard_key, list);
    }
    return map;
  }, [standardMetrics]);

  const [rangeMonths, setRangeMonths] = useState<number>(6);
  const periodSpec = useMemo(() => lastNPeriodSpec(rangeMonths), [rangeMonths]);
  const metricIds = useMemo(() => standardMetrics.map((m) => m.id), [standardMetrics]);
  const [scenario, setScenario] = useState<MetricScenario>("actual");
  const { values, valuesActual, loading: loadingValues } = useEvaluatedMetrics(companyId, metricIds, periodSpec, scenario);

  const [highlights, setHighlights] = useState<MetricHighlight[] | null>(null);
  const [loadingHighlights, setLoadingHighlights] = useState(false);
  const [highlightsError, setHighlightsError] = useState(false);
  const loadHighlights = async () => {
    if (!companyId) return;
    setLoadingHighlights(true);
    setHighlightsError(false);
    try {
      const period = toPeriodString(new Date().getMonth() + 1, new Date().getFullYear());
      const res = await fetch(`${LIST_METRIC_HIGHLIGHTS_URL}?company_id=${encodeURIComponent(companyId)}&period=${period}`, {
        credentials: "include",
      });
      if (!res.ok) {
        setHighlightsError(true);
        return;
      }
      const data = await res.json();
      setHighlights(Array.isArray(data?.highlights) ? data.highlights : []);
    } catch {
      setHighlightsError(true);
    } finally {
      setLoadingHighlights(false);
    }
  };

  const [discrepancy, setDiscrepancy] = useState<Record<string, ExplainMetricDiscrepancyResponse | "loading" | "error">>({});
  const explainDiscrepancy = async (standardKey: string) => {
    if (!companyId) return;
    setDiscrepancy((prev) => ({ ...prev, [standardKey]: "loading" }));
    try {
      const res = await fetch(
        `${EXPLAIN_METRIC_DISCREPANCY_URL}?company_id=${encodeURIComponent(companyId)}&standard_key=${encodeURIComponent(standardKey)}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        setDiscrepancy((prev) => ({ ...prev, [standardKey]: "error" }));
        return;
      }
      const data = (await res.json()) as ExplainMetricDiscrepancyResponse;
      setDiscrepancy((prev) => ({ ...prev, [standardKey]: data }));
    } catch {
      setDiscrepancy((prev) => ({ ...prev, [standardKey]: "error" }));
    }
  };

  if (loading) return null;

  return (
    <div className="space-y-8">
      <FundRequiredMetricsSection
        rows={fundRequired}
        ownMetrics={metrics}
        onChanged={onChanged}
        onCreateNew={(row) => onGoToExplorer(row.requirement_id)}
      />

      <SectionCard
        title="KPIs principales"
        action={
          <div className="flex items-center gap-2 flex-wrap">
            <ToggleGroup
              type="single"
              value={String(rangeMonths)}
              onValueChange={(v) => v && setRangeMonths(Number(v))}
              className="justify-start"
            >
              {RANGE_PRESETS.map((p) => (
                <ToggleGroupItem key={p.months} value={String(p.months)} size="sm" aria-label={p.label} className="text-xs px-2.5">
                  {p.label}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
            <Select value={scenario} onValueChange={(v) => setScenario(v as MetricScenario)}>
              <SelectTrigger className="h-8 w-36 text-xs" aria-label="Escenario">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(SCENARIO_LABELS) as MetricScenario[]).map((s) => (
                  <SelectItem key={s} value={s}>
                    {SCENARIO_LABELS[s]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        }
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {STANDARD_KEY_ORDER.map((key) => {
            const group = byKey.get(key) ?? [];
            if (group.length === 0) {
              return (
                <div key={key} className="border border-dashed border-border rounded-lg p-5 flex flex-col items-start justify-between min-h-[140px]">
                  <h3 className="text-sm font-medium text-muted-foreground">{STANDARD_KEY_LABELS[key]}</h3>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">Todavía no la trackeás.</p>
                    <Button variant="outline" size="sm" onClick={() => onGoToExplorer()}>
                      Crear métrica
                    </Button>
                  </div>
                </div>
              );
            }
            if (group.length > 1) {
              const warning = warnings.find((w) => w.standard_key === key);
              const result = discrepancy[key];
              return (
                <div key={key} className="border border-warning/40 bg-warning/5 rounded-lg p-5 sm:col-span-2">
                  <div className="flex items-center gap-1.5 mb-2">
                    <AlertTriangle size={13} strokeWidth={1.5} className="text-muted-foreground" />
                    <h3 className="text-sm font-medium">{STANDARD_KEY_LABELS[key]} — {group.length} métricas en conflicto</h3>
                  </div>
                  <div className="space-y-1 mb-3">
                    {group.map((m) => {
                      const gCurrent = currentValueOf(m, values);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => onOpenMetric(m.id)}
                          className="flex items-center justify-between gap-3 w-full text-left hover:underline underline-offset-2"
                        >
                          <span className="text-xs text-muted-foreground">
                            {m.name}
                            {m.source_role && <span className="ml-1.5 text-[10px] uppercase tracking-wide">({m.source_role})</span>}
                          </span>
                          <span className="text-xs font-medium shrink-0">{formatMetricValue(gCurrent, m.unit)}</span>
                        </button>
                      );
                    })}
                  </div>
                  {!result && (
                    <Button variant="outline" size="sm" onClick={() => explainDiscrepancy(key)}>
                      ¿Por qué difieren?{diffPctLabel(group, values) ? ` (${diffPctLabel(group, values)})` : ""}
                    </Button>
                  )}
                  {result === "loading" && <p className="text-xs text-muted-foreground">Investigando…</p>}
                  {result === "error" && <p className="text-xs text-muted-foreground">No se pudo investigar la diferencia ahora.</p>}
                  {result && result !== "loading" && result !== "error" && (
                    <div className="text-xs text-muted-foreground space-y-1">
                      {result.structural_diff.length === 0 ? (
                        <p>Calculan exactamente lo mismo — la diferencia no se explica por su definición.</p>
                      ) : (
                        result.structural_diff.map((d, i) => <p key={i}>• {d}</p>)
                      )}
                      {result.explanation && <p className="italic mt-1">{result.explanation}</p>}
                    </div>
                  )}
                  {warning?.suggested_source_roles && Object.keys(warning.suggested_source_roles).length > 0 && (
                    <p className="text-[11px] text-muted-foreground mt-2">
                      IA sugiere un rol de fuente — asignalo desde el Explorador para elegir cuál mostrar acá.
                    </p>
                  )}
                </div>
              );
            }
            const m = group[0];
            const series = values[m.id] ?? {};
            const periods = Object.keys(series).sort();
            const current = periods.length > 0 ? series[periods[periods.length - 1]] : null;
            const prev = periods.length > 1 ? series[periods[periods.length - 2]] : null;
            const change = current != null && prev != null && prev !== 0 ? ((current - prev) / Math.abs(prev)) * 100 : null;
            const sparkData = periods.map((p) => ({ v: series[p] ?? 0 }));
            // scenario != "actual": evaluate-metrics devuelve values_actual en
            // la misma respuesta (ver Notas del handoff de backend) — se
            // compara sin un segundo request.
            const actualSeries = scenario !== "actual" ? (valuesActual?.[m.id] ?? {}) : null;
            const actualCurrent =
              actualSeries && periods.length > 0 ? (actualSeries[periods[periods.length - 1]] ?? null) : null;
            return (
              <MetricValueCard
                key={m.id}
                name={STANDARD_KEY_LABELS[key]}
                unit={m.unit}
                subtitle={
                  scenario !== "actual"
                    ? `${SCENARIO_LABELS[scenario]} vs. real: ${formatMetricValue(actualCurrent, m.unit)}`
                    : undefined
                }
                onInfo={() => onOpenMetric(m.id)}
                current={current}
                missing={loadingValues ? ["cargando"] : current == null ? ["sin datos"] : []}
                missingMessage={loadingValues ? "Cargando…" : "Sin datos para este período."}
                change={change}
                sparkData={sparkData}
              />
            );
          })}
        </div>
      </SectionCard>

      <SectionCard
        title="Destacados"
        action={
          !highlights && !loadingHighlights ? (
            <Button variant="outline" size="sm" onClick={loadHighlights}>
              <Sparkles size={13} className="mr-1.5" /> Generar
            </Button>
          ) : undefined
        }
      >
        {loadingHighlights ? (
          <p className="text-sm text-muted-foreground">Buscando los cambios más relevantes del período…</p>
        ) : highlightsError ? (
          <EmptyState
            bordered={false}
            icon={Sparkles}
            title="No pudimos generar destacados ahora."
            description="Puede ser un problema temporal del servicio. Probá de nuevo en un rato."
            action={{ label: "Reintentar", onClick: loadHighlights }}
          />
        ) : !highlights ? (
          <EmptyState
            bordered={false}
            icon={Sparkles}
            title="Todavía no generaste los destacados de este período."
            description="Resume los cambios más grandes de tus métricas principales vs. el período anterior, con evidencia real."
            action={{ label: "Generar destacados", onClick: loadHighlights }}
          />
        ) : highlights.length === 0 ? (
          <EmptyState bordered={false} icon={Sparkles} title="Sin cambios destacados este período." description="Ningún KPI principal tuvo una variación significativa." />
        ) : (
          <div className="space-y-3">
            {highlights.map((h) => (
              <div key={h.metric_id + h.title} className="border border-border rounded-md p-3">
                <p className="text-sm font-medium">{h.title}</p>
                {h.description ? (
                  <p className="text-xs text-muted-foreground mt-1">{h.description}</p>
                ) : (
                  <p className="text-xs text-muted-foreground mt-1">
                    {h.delta.current_value.toLocaleString()} vs {h.delta.prior_value.toLocaleString()} ({h.delta.delta_pct >= 0 ? "+" : ""}
                    {h.delta.delta_pct.toFixed(1)}%)
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
