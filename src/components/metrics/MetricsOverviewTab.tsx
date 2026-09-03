import { useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Sparkles, Wand2, SlidersHorizontal } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FundRequiredMetricsSection } from "@/components/metrics/FundRequiredMetricsSection";
import { MetricValueCard } from "@/components/metrics/MetricValueCard";
import { MetricCoverageReviewDialog, type CoverageReviewItem } from "@/components/metrics/MetricCoverageReviewDialog";
import { useEvaluatedMetrics } from "@/hooks/useEvaluatedMetrics";
import { STANDARD_KEY_LABELS, STANDARD_KEY_ORDER, type FundRequiredMetricRow } from "@/lib/metricRequirements";
import { formatMetricValue, type MetricDef, type RawField } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import type { MetricClassWarning, MetricScenario } from "@/lib/financialData";
import { EXPLAIN_METRIC_DISCREPANCY_URL, LIST_METRIC_HIGHLIGHTS_URL, type ExplainMetricDiscrepancyResponse, type MetricHighlight } from "@/lib/metricIntelligence";
import { LIST_METRIC_SOURCE_COVERAGE_URL, type ListMetricSourceCoverageResponse, type NewStandardKpiRow } from "@/lib/metricSourceCoverage";
import { handleMembershipError } from "@/lib/membership";
import { toPeriodString } from "@/lib/metricPeriod";

const SCENARIO_LABELS: Record<MetricScenario, string> = { actual: "Real", forecast: "Forecast", budget: "Presupuesto" };

type Props = {
  companyId: string | null;
  metrics: MetricDef[];
  warnings: MetricClassWarning[];
  fundRequired: FundRequiredMetricRow[];
  rawFields: RawField[];
  loading: boolean;
  onChanged: () => void;
  onGoToExplorer: (fulfillRequirementId?: string) => void;
  // Deep-link directo a una métrica puntual (/metrics/:id) — antes cualquier
  // click en "info" de una card llevaba al Explorador genérico, sin la
  // métrica preseleccionada.
  onOpenMetric: (metricId: string) => void;
};

// Mismo criterio de agrupación que financialCategoryTabs en
// MetricsExplorerTab.tsx (categoría con menor order_index primero) —
// duplicado acá porque este tab no comparte estado con el Explorador, solo
// se usa para el datalist de categoría del dialog de confirmación.
function categoryLabel(cat: string) {
  return cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, " ");
}

// Qué KPIs de STANDARD_KEY_ORDER mostrar en la grilla — preferencia por
// founder, persiste en localStorage (mismo criterio que VIEW_KEY/
// PAGE_MODE_KEY en MetricsExplorerTab.tsx). Pedido en vivo 2026-09-03: no
// todas las startups siguen los 8 KPIs estándar, algunas quieren ocultar los
// que no les aplican en vez de ver "Todavía no la trackeás" x N sin poder
// sacarlos de la vista.
const VISIBLE_KPIS_KEY = "cv:metrics:visibleKpis";

function loadVisibleKpis(): Set<string> {
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

type CoverageErrorKind = "rate_limit" | "unavailable" | "generic";
const COVERAGE_ERROR_MESSAGES: Record<CoverageErrorKind, string> = {
  rate_limit: "Se alcanzó el límite de uso de IA por ahora. Probá de nuevo en un rato.",
  unavailable: "El servicio de IA no está disponible en este momento. Probá de nuevo en unos minutos.",
  generic: "Puede ser un problema temporal del servicio. Probá de nuevo en un rato.",
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
export function MetricsOverviewTab({ companyId, metrics, warnings, fundRequired, rawFields, loading, onChanged, onGoToExplorer, onOpenMetric }: Props) {
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

  const categoryTabs = useMemo(() => {
    const minOrder = new Map<string, number>();
    for (const m of metrics) {
      const current = minOrder.get(m.category);
      if (current === undefined || m.order_index < current) minOrder.set(m.category, m.order_index);
    }
    return Array.from(minOrder.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => ({ id, label: categoryLabel(id) }));
  }, [metrics]);

  // list-metric-source-coverage (entregado por backend 2026-09-02) — nunca
  // se dispara solo al cargar la pantalla (mismo principio que Destacados,
  // ver loadHighlights más abajo): es una llamada de IA con costo y rate
  // limit real (429), el founder la pide cuando quiere. 100% lectura,
  // re-disparable en cualquier momento — confirmar una propuesta puntual
  // pasa por MetricCoverageReviewDialog (upsert-metric-definition real).
  const [coverage, setCoverage] = useState<ListMetricSourceCoverageResponse | null>(null);
  const [loadingCoverage, setLoadingCoverage] = useState(false);
  const [coverageError, setCoverageError] = useState<CoverageErrorKind | null>(null);
  const [reviewItem, setReviewItem] = useState<CoverageReviewItem | null>(null);

  const loadCoverage = async () => {
    if (!companyId) return;
    setLoadingCoverage(true);
    setCoverageError(null);
    try {
      const res = await fetch(`${LIST_METRIC_SOURCE_COVERAGE_URL}?company_id=${encodeURIComponent(companyId)}`, {
        credentials: "include",
      });
      if (res.status === 429) {
        setCoverageError("rate_limit");
        return;
      }
      if (res.status === 503) {
        setCoverageError("unavailable");
        return;
      }
      if (!res.ok) {
        await handleMembershipError(res);
        setCoverageError("generic");
        return;
      }
      const data = (await res.json()) as ListMetricSourceCoverageResponse;
      setCoverage(data);
    } catch {
      setCoverageError("generic");
    } finally {
      setLoadingCoverage(false);
    }
  };

  const improvableMetrics = useMemo(
    () => coverage?.metrics.filter((m) => m.status === "proposal_connect" || m.status === "proposal_enrich") ?? [],
    [coverage]
  );
  const derivableByKey = useMemo(() => {
    const map = new Map<string, NewStandardKpiRow>();
    for (const k of coverage?.new_standard_kpis ?? []) map.set(k.standard_key, k);
    return map;
  }, [coverage]);

  // Tras confirmar, se saca la propuesta ya aplicada de la lista local en vez
  // de volver a llamar list-metric-source-coverage (evita gastar otra
  // corrida de IA solo para refrescar una lista que ya sabemos que cambió) —
  // onChanged() sí recarga las métricas reales (financial.reload), que es lo
  // que hace que la grilla de KPIs de arriba muestre el valor nuevo.
  const handleCoverageSaved = () => {
    onChanged();
    setCoverage((prev) => {
      if (!prev || !reviewItem) return prev;
      if (reviewItem.kind === "new_standard") {
        return { ...prev, new_standard_kpis: prev.new_standard_kpis.filter((k) => k.standard_key !== reviewItem.row.standard_key) };
      }
      return { ...prev, metrics: prev.metrics.filter((m) => m.metric_id !== reviewItem.row.metric_id) };
    });
  };

  const [visibleKpis, setVisibleKpis] = useState<Set<string>>(loadVisibleKpis);
  const toggleKpiVisible = (key: string, checked: boolean) => {
    setVisibleKpis((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      // Nunca queda vacío — ni en memoria ni en localStorage. Vacío en
      // memoria dejaría la grilla entera en blanco sin ninguna pista de por
      // qué; vacío en localStorage se leería como "todos" al recargar (ver
      // loadVisibleKpis), mostrando los 8 de nuevo sin avisar.
      if (next.size === 0) {
        toast.error("Dejá al menos un KPI visible.");
        return prev;
      }
      localStorage.setItem(VISIBLE_KPIS_KEY, JSON.stringify(Array.from(next)));
      return next;
    });
  };
  const visibleKpiOrder = useMemo(() => STANDARD_KEY_ORDER.filter((k) => visibleKpis.has(k)), [visibleKpis]);

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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 text-xs px-2.5">
                  <SlidersHorizontal size={12} className="mr-1.5" aria-hidden="true" />
                  KPIs ({visibleKpiOrder.length}/{STANDARD_KEY_ORDER.length})
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel className="text-xs">Elegí qué KPIs mostrar</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {STANDARD_KEY_ORDER.map((key) => (
                  <DropdownMenuCheckboxItem
                    key={key}
                    checked={visibleKpis.has(key)}
                    onSelect={(e) => e.preventDefault()}
                    onCheckedChange={(checked) => toggleKpiVisible(key, checked === true)}
                  >
                    {STANDARD_KEY_LABELS[key]}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      >
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {visibleKpiOrder.map((key) => {
            const group = byKey.get(key) ?? [];
            if (group.length === 0) {
              const derivable = derivableByKey.get(key);
              // "derivable" con proposal: la IA ya encontró cómo calcularlo
              // con lo que el founder conectó — se ofrece confirmar en vez
              // de mandarlo al Explorador a armar la query a mano. "missing"
              // con motivo real: se muestra en vez del texto genérico "Todavía
              // no la trackeás" (nunca se inventa qué falta si no vino del
              // backend). Sin buscar coverage todavía (derivable undefined),
              // sigue el fallback de siempre — el founder decide cuándo pedir
              // esta capa de IA, ver botón "Buscar mejoras" más abajo.
              if (derivable?.status === "derivable" && derivable.proposal) {
                return (
                  <div key={key} className="border border-dashed border-primary/40 bg-primary/5 rounded-lg p-5 flex flex-col items-start justify-between min-h-[140px]">
                    <div className="flex items-center gap-1.5">
                      <Sparkles size={13} strokeWidth={1.5} className="text-primary" aria-hidden="true" />
                      <h3 className="text-sm font-medium">{STANDARD_KEY_LABELS[key]}</h3>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground mb-2">Lo podemos calcular con lo que ya conectaste.</p>
                      {derivable.proposal.low_confidence && (
                        <Badge variant="warning" className="mb-2 gap-1">
                          <AlertTriangle size={10} strokeWidth={1.5} aria-hidden="true" />
                          Confianza baja
                        </Badge>
                      )}
                      <Button variant="outline" size="sm" onClick={() => setReviewItem({ kind: "new_standard", row: derivable })}>
                        Revisar y confirmar
                      </Button>
                    </div>
                  </div>
                );
              }
              return (
                <div key={key} className="border border-dashed border-border rounded-lg p-5 flex flex-col items-start justify-between min-h-[140px]">
                  <h3 className="text-sm font-medium text-muted-foreground">{STANDARD_KEY_LABELS[key]}</h3>
                  <div>
                    <p className="text-xs text-muted-foreground mb-2">
                      {derivable?.status === "missing" && derivable.missing_data_description
                        ? derivable.missing_data_description
                        : "Todavía no la trackeás."}
                    </p>
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
        title="Qué podemos mejorar"
        action={
          !loadingCoverage ? (
            <Button variant="outline" size="sm" onClick={loadCoverage}>
              <Wand2 size={13} className="mr-1.5" aria-hidden="true" /> {coverage ? "Volver a buscar" : "Buscar mejoras"}
            </Button>
          ) : undefined
        }
      >
        {loadingCoverage ? (
          <p className="text-sm text-muted-foreground">Revisando tus fuentes conectadas contra tus métricas…</p>
        ) : coverageError ? (
          <EmptyState
            bordered={false}
            icon={Wand2}
            title="No pudimos buscar mejoras ahora."
            description={COVERAGE_ERROR_MESSAGES[coverageError]}
            action={{ label: "Reintentar", onClick: loadCoverage }}
          />
        ) : !coverage ? (
          <EmptyState
            bordered={false}
            icon={Wand2}
            title="Todavía no buscaste mejoras con tus fuentes conectadas."
            description="Revisamos tus métricas de carga manual y las que ya se calculan solas, y avisamos si hay una fuente ya conectada que las puede completar o mejorar."
            action={{ label: "Buscar mejoras", onClick: loadCoverage }}
          />
        ) : improvableMetrics.length === 0 ? (
          <EmptyState
            bordered={false}
            icon={Wand2}
            title="Con tus fuentes conectadas no encontramos mejoras nuevas."
            description="Volvé a buscar cuando conectes una fuente nueva."
          />
        ) : (
          <div className="space-y-3">
            {improvableMetrics.map((m) => (
              <div key={m.metric_id} className="border border-border rounded-md p-3 flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <p className="text-sm font-medium">{m.name}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {m.status === "proposal_connect"
                      ? "Se carga a mano — la podemos calcular sola con lo que ya conectaste."
                      : "Ya se calcula sola — hay una fuente nueva conectada para sumarle."}
                  </p>
                  {m.proposal?.low_confidence && (
                    <Badge variant="warning" className="mt-1.5 gap-1">
                      <AlertTriangle size={10} strokeWidth={1.5} aria-hidden="true" />
                      Confianza baja
                    </Badge>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReviewItem({ kind: m.status === "proposal_connect" ? "connect" : "enrich", row: m })}
                >
                  Revisar y confirmar
                </Button>
              </div>
            ))}
          </div>
        )}
        {coverage && coverage.truncated_metric_ids.length > 0 && (
          <p className="text-[11px] text-muted-foreground mt-3">
            Todavía no revisamos {coverage.truncated_metric_ids.length} métrica{coverage.truncated_metric_ids.length === 1 ? "" : "s"} más
            — volvé a buscar en un rato para cubrirlas.
          </p>
        )}
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

      <MetricCoverageReviewDialog
        item={reviewItem}
        onOpenChange={(o) => !o && setReviewItem(null)}
        companyId={companyId}
        allMetrics={metrics}
        rawFields={rawFields}
        categories={categoryTabs}
        defaultCategory={categoryTabs[0]?.id ?? "revenue"}
        onSaved={handleCoverageSaved}
      />
    </div>
  );
}
