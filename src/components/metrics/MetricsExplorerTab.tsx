import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useSearchParams, type NavigateFunction } from "react-router-dom";
import { InputsPanel } from "@/components/metrics/InputsPanel";
import { CalculatedMetricsGrid } from "@/components/metrics/CalculatedMetricsGrid";
import { MetricInfoSheet, type MetricHistoryPoint } from "@/components/metrics/MetricInfoSheet";
import { AnnualGrid } from "@/components/metrics/AnnualGrid";
import { MetricsManager } from "@/components/metrics/MetricsManager";
import { MetricPropertyPanel } from "@/components/metrics/MetricPropertyPanel";
import { ScenarioEntryDialog } from "@/components/metrics/ScenarioEntryDialog";
import { ImportLogTable } from "@/components/financial/ImportLogTable";
import { PeriodSelect } from "@/components/metrics/PeriodSelect";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { LayoutGrid, Table2, Settings2, BarChart3, GitCompare } from "lucide-react";
import { type MetricDef, type RawField, sourceLabel } from "@/lib/metrics";
import { evalFormula } from "@/lib/formulaEngine";
import { periodKey, prevMonth, toPeriodString, periodRange } from "@/lib/metricPeriod";
import { RAW_INPUT_KEYS } from "@/lib/financialReports";
import { useRawFieldValues } from "@/hooks/useRawFieldValues";
import { useMetricReportData } from "@/hooks/useMetricReportData";
import { useFinancialMetrics } from "@/hooks/useFinancialMetrics";
import { cn } from "@/lib/utils";

const FINANCIAL_CATEGORY_LABELS: Record<string, string> = {
  revenue: "Revenue",
  cash_efficiency: "Cash & Efficiency",
};
function labelForCategory(cat: string) {
  return FINANCIAL_CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, " ");
}

const now = new Date();

type ViewMode = "annual" | "monthly";
const VIEW_KEY = "cv:metrics:view";

// "data" = cargar/ver valores (tabs, anual/mensual). "manage" = editor de
// esquema de métricas estilo AppSheet (lista + panel). Antes eran los dos
// "modos" de la página entera de Metrics.tsx — ahora son el List/Grid
// interno de este tab (Explorador), relocalizado sin reescribir.
type PageMode = "data" | "manage";
const PAGE_MODE_KEY = "cv:metrics:pageMode";

type Props = {
  companyId: string | null;
  isOwner: boolean;
  metricId?: string;
  navigate: NavigateFunction;
  rawFields: RawField[];
  onOpenAssistant: () => void;
  onDataChanged: () => void;
};

// Explorador — fusión de los antiguos modos "data"/"manage" de Metrics.tsx
// (relocalización mecánica, no una reescritura: mismo estado, mismos
// componentes, mismo comportamiento verificado). MetricInfoSheet y
// MetricPropertyPanel viven acá porque su estado (openInfo/selectedMetric)
// es puramente de este tab. financial (useFinancialMetrics) se sigue
// llamando acá mismo, no como prop del shell — su rango depende de
// year/period/view, que son estado local de este tab (igual que en la
// página original), así que compartirlo con Overview/Salud de datos
// significaría acoplar su navegación de período a la de ellos. Costo
// aceptado: al entrar a este tab se dispara un fetch propio (cacheado por
// react-query aparte del de más arriba) — prioridad fue no tocar el
// comportamiento ya verificado de Explorador, marcado como el de mayor
// riesgo de regresión en el plan.
export function MetricsExplorerTab({ companyId, isOwner, metricId, navigate, rawFields, onOpenAssistant, onDataChanged }: Props) {
  const [activeCat, setActiveCat] = useState("revenue");
  const [view, setView] = useState<ViewMode>(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem(VIEW_KEY)) as ViewMode | null;
    return stored === "monthly" ? "monthly" : "annual";
  });
  const [pageMode, setPageMode] = useState<PageMode>(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem(PAGE_MODE_KEY)) as PageMode | null;
    return stored === "manage" ? "manage" : "data";
  });
  const [creatingNew, setCreatingNew] = useState(false);
  const [year, setYear] = useState(now.getFullYear());
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [openInfo, setOpenInfo] = useState<MetricDef | null>(null);
  const [fulfillingRequirement, setFulfillingRequirement] = useState<import("@/lib/metricRequirements").FundRequiredMetricRow | null>(null);
  const [scenarioDialogOpen, setScenarioDialogOpen] = useState(false);

  const financialRange = useMemo(
    () => periodRange(view === "annual" ? { month: 12, year } : period, 24),
    [view, year, period]
  );
  const financial = useFinancialMetrics(companyId, financialRange);

  // Handoff desde Overview > FundRequiredMetricsSection ("Crear métrica para
  // cumplir esto"): llega acá como ?tab=explorer&fulfill=<requirement_id> en
  // vez de estado compartido — Overview y Explorador tienen cada uno su
  // propio useFinancialMetrics (ver comentario arriba), así que no hay
  // estado de React en común para pasar directo.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const fulfillId = searchParams.get("fulfill");
    if (!fulfillId || financial.loading) return;
    const row = financial.fundRequired.find((r) => r.requirement_id === fulfillId);
    if (row) {
      setFulfillingRequirement(row);
      setCreatingNew(true);
      setPageMode("manage");
    }
    const next = new URLSearchParams(searchParams);
    next.delete("fulfill");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, financial.loading, financial.fundRequired]);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem(PAGE_MODE_KEY, pageMode);
  }, [pageMode]);

  useEffect(() => {
    if (metricId) setPageMode("manage");
  }, [metricId]);

  const selectedMetric = metricId ? (financial.metrics.find((m) => m.id === metricId) ?? null) : null;

  useEffect(() => {
    if (!metricId || financial.loading || financial.refreshing) return;
    if (!financial.metrics.some((m) => m.id === metricId)) {
      toast.error("No encontramos esa métrica. Puede que se haya eliminado.");
      navigate("/metrics?tab=explorer", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricId, financial.loading, financial.refreshing, financial.metrics]);

  const financialCategoryTabs = useMemo(() => {
    const minOrder = new Map<string, number>();
    for (const m of financial.metrics) {
      const current = minOrder.get(m.category);
      if (current === undefined || m.order_index < current) minOrder.set(m.category, m.order_index);
    }
    return Array.from(minOrder.entries())
      .sort((a, b) => a[1] - b[1])
      .map(([id]) => ({ id, label: labelForCategory(id) }));
  }, [financial.metrics]);

  const inputKeySuggestions = useMemo(() => {
    const keys = new Set<string>(RAW_INPUT_KEYS);
    for (const m of financial.metrics) {
      if (m.metric_type === "input" && m.input_key) keys.add(m.input_key);
    }
    return Array.from(keys);
  }, [financial.metrics]);

  const allCalcDefs = useMemo(() => financial.metrics.filter((m) => m.metric_type === "calculated"), [financial.metrics]);

  const financialSaveInput = async (inputKey: string, value: number | null) => {
    if (value === null) {
      toast.error("Todavía no se puede vaciar un campo ya cargado. Solo se puede corregir con un valor nuevo.");
      return;
    }
    const def = financial.metrics.find((m) => m.metric_type === "input" && m.input_key === inputKey);
    if (!def) return;
    const syncedFrom = sourceLabel(def.source);
    if (syncedFrom) {
      toast.error(`Este campo se sincroniza desde ${syncedFrom}, no se puede cargar a mano.`);
      return;
    }
    const ok = await financial.submitValues(toPeriodString(period.month, period.year), { [inputKey]: value });
    if (!ok) return;
    financial.applyLocalEntry(def.id, period.month, period.year, value);
    toast.success("Guardado");
  };

  const financialSaveAnnualBatch = async (
    changes: { metricId: string; year: number; month: number; value: number | null }[]
  ): Promise<{ metricId: string; month: number }[]> => {
    if (changes.length === 0) return [];
    const synced = changes.filter((c) => sourceLabel(financial.metrics.find((m) => m.id === c.metricId)?.source ?? null));
    const editable = changes.filter((c) => !sourceLabel(financial.metrics.find((m) => m.id === c.metricId)?.source ?? null));
    if (synced.length > 0) {
      toast.error(
        synced.length === 1
          ? "1 campo se sincroniza automáticamente, no se puede cargar a mano."
          : `${synced.length} campos se sincronizan automáticamente, no se pueden cargar a mano.`
      );
    }
    const cleared = editable.filter((c) => c.value === null);
    const toSave = editable.filter((c) => c.value !== null);
    if (cleared.length > 0) {
      toast.error(
        cleared.length === 1
          ? "1 campo no se pudo vaciar. El módulo nuevo solo permite corregir con un valor nuevo, no borrar."
          : `${cleared.length} campos no se pudieron vaciar. El módulo nuevo solo permite corregir con un valor nuevo, no borrar.`
      );
    }
    const byPeriod = new Map<string, { year: number; month: number; values: Record<string, number> }>();
    for (const c of toSave) {
      const inputKey = financial.inputKeyByMetricId[c.metricId];
      if (!inputKey) continue;
      const pk = `${c.year}-${c.month}`;
      if (!byPeriod.has(pk)) byPeriod.set(pk, { year: c.year, month: c.month, values: {} });
      byPeriod.get(pk)!.values[inputKey] = c.value as number;
    }
    // synced/cleared nunca se van a poder guardar (bloqueo estructural, ya
    // explicado en el toast de arriba) — no tiene sentido dejarlos
    // "pendientes" para reintentar. Los de toSave que fallen sí quedan en
    // `failed`: son la única categoría con chance real de guardarse después
    // (ej. una vez que CloudValley habilite el formulario manual, ver
    // useFinancialMetrics.ts `notEnabled`) — perder el valor tipeado ahí
    // obligaba a escribirlo de nuevo a ciegas. Encontrado en vivo 2026-09-03.
    const failed: { metricId: string; month: number }[] = [];
    let anyFailed = false;
    for (const { year: y, month: m, values } of byPeriod.values()) {
      const ok = await financial.submitValues(toPeriodString(m, y), values);
      if (!ok) {
        anyFailed = true;
        for (const inputKey of Object.keys(values)) {
          const def = financial.metrics.find((d) => d.input_key === inputKey);
          if (def) failed.push({ metricId: def.id, month: m });
        }
        continue;
      }
      for (const [inputKey, value] of Object.entries(values)) {
        const def = financial.metrics.find((d) => d.input_key === inputKey);
        if (def) financial.applyLocalEntry(def.id, m, y, value);
      }
    }
    if (!anyFailed && toSave.length > 0) {
      toast.success(`${toSave.length} cambio${toSave.length === 1 ? "" : "s"} guardado${toSave.length === 1 ? "" : "s"}`);
    }
    return failed;
  };

  const inputDefs = useMemo(
    () => financial.metrics.filter((m) => m.metric_type === "input" && m.category === activeCat),
    [financial.metrics, activeCat]
  );
  const calcDefs = useMemo(
    () => financial.metrics.filter((m) => m.metric_type === "calculated" && m.category === activeCat),
    [financial.metrics, activeCat]
  );
  const { allInputDefs, inputsForPeriod, currentInputs, prevInputs, prev, historyInputs, formulaHistory, baseRawFieldPeriods } =
    useMetricReportData({ metrics: financial.metrics, entries: financial.entries, period });

  const allFormulas = useMemo(() => allCalcDefs.map((d) => d.formula_expression), [allCalcDefs]);
  const rawFieldPeriods = useMemo(() => {
    const set = new Set(baseRawFieldPeriods);
    for (let m = 1; m <= 12; m++) set.add(toPeriodString(m, year));
    return Array.from(set);
  }, [year, baseRawFieldPeriods]);
  const { valuesByPeriod: rawFieldValuesByPeriod } = useRawFieldValues(companyId, rawFieldPeriods, allFormulas);

  const infoHistory = useMemo<MetricHistoryPoint[]>(() => {
    if (!openInfo) return [];
    const out: MetricHistoryPoint[] = [];
    let m = now.getMonth() + 1;
    let y = now.getFullYear();
    for (let i = 0; i < 12; i++) {
      let v: number | null = null;
      if (openInfo.metric_type === "input" && openInfo.input_key) {
        const raw = financial.entries[openInfo.id]?.[periodKey(m, y)];
        if (raw !== undefined) v = raw;
      } else if (openInfo.metric_type === "calculated" && openInfo.formula_expression) {
        const inp = inputsForPeriod(m, y);
        v = evalFormula(openInfo.formula_expression, inp, [], allCalcDefs, rawFieldValuesByPeriod[toPeriodString(m, y)] ?? {});
      }
      if (v !== null && v !== undefined) out.unshift({ year: y, month: m, value: v });
      const p = prevMonth(m, y);
      m = p.m;
      y = p.y;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInfo, financial.entries, allInputDefs, rawFieldValuesByPeriod]);

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          {pageMode === "data" && view === "monthly" && <PeriodSelect period={period} onChange={setPeriod} />}
          {pageMode === "data" && (
            <div className="inline-flex border border-border rounded-md overflow-hidden h-9">
              <button
                onClick={() => setView("annual")}
                aria-pressed={view === "annual"}
                className={cn(
                  "px-3 text-xs flex items-center gap-1.5 transition-all",
                  view === "annual" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                )}
                title="Vista anual"
              >
                <Table2 size={12} strokeWidth={1.5} aria-hidden="true" /> Anual
              </button>
              <button
                onClick={() => setView("monthly")}
                aria-pressed={view === "monthly"}
                className={cn(
                  "px-3 text-xs flex items-center gap-1.5 transition-all border-l border-border",
                  view === "monthly" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                )}
                title="Vista mensual"
              >
                <LayoutGrid size={12} strokeWidth={1.5} aria-hidden="true" /> Mensual
              </button>
            </div>
          )}
        </div>
        {pageMode === "data" ? (
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setScenarioDialogOpen(true)}>
              <GitCompare size={14} className="mr-1" /> Cargar escenario
            </Button>
            <Button variant="outline" onClick={() => setPageMode("manage")}>
              <Settings2 size={14} className="mr-1" /> Administrar métricas
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            onClick={() => {
              setPageMode("data");
              if (metricId) navigate("/metrics?tab=explorer");
            }}
          >
            <LayoutGrid size={14} className="mr-1" /> Cargar datos
          </Button>
        )}
      </div>

      {pageMode === "data" && (
        <>
          <div className="flex gap-1 border-b border-border mb-8 overflow-x-auto">
            {financialCategoryTabs.map((c) => (
              <button
                key={c.id}
                onClick={() => setActiveCat(c.id)}
                aria-pressed={activeCat === c.id}
                className={cn(
                  "px-3 py-2 text-sm rounded-md transition-all duration-150 shrink-0 whitespace-nowrap",
                  activeCat === c.id
                    ? "bg-surface text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-surface/60"
                )}
              >
                {c.label}
              </button>
            ))}
          </div>

          {financial.notEnabled && (
            <div className="border border-border rounded-lg p-4 mb-6 text-sm text-muted-foreground bg-surface" aria-live="polite">
              Todavía no tenés el formulario manual habilitado para reportar datos financieros. Pedile a CloudValley que lo
              active para tu startup.
            </div>
          )}

          <div key={`${activeCat}-${view}`} className="animate-fade-in">
            {financial.loading ? (
              <LoadingState variant="centered" className="py-16" />
            ) : view === "annual" ? (
              inputDefs.length === 0 && calcDefs.length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="No hay métricas activas en esta categoría."
                  description="Las métricas disponibles dependen de tu modelo de negocio."
                  action={{
                    label: "Agregar métrica",
                    onClick: () => {
                      setPageMode("manage");
                      setFulfillingRequirement(null);
                      setCreatingNew(true);
                    },
                  }}
                  secondaryAction={{ label: "Ver reportes", onClick: () => navigate("/reporting") }}
                />
              ) : (
                <AnnualGrid
                  year={year}
                  onYearChange={setYear}
                  inputDefs={inputDefs}
                  calcDefs={calcDefs}
                  allInputDefs={allInputDefs}
                  allCalcDefs={allCalcDefs}
                  entries={financial.entries}
                  onSaveBatch={financialSaveAnnualBatch}
                  privacy={financial.privacy}
                  onTogglePrivacy={isOwner ? financial.togglePrivacy : undefined}
                  onInfo={setOpenInfo}
                  rawFieldValuesByPeriod={rawFieldValuesByPeriod}
                  companyId={companyId}
                />
              )
            ) : (
              <div className="space-y-10">
                {inputDefs.length > 0 && (
                  <InputsPanel
                    inputs={inputDefs}
                    values={currentInputs}
                    onSave={financialSaveInput}
                    onInfo={setOpenInfo}
                    privacy={financial.privacy}
                    onTogglePrivacy={isOwner ? financial.togglePrivacy : undefined}
                  />
                )}

                {calcDefs.length > 0 && (
                  <CalculatedMetricsGrid
                    metrics={calcDefs}
                    currentInputs={currentInputs}
                    prevInputs={prevInputs}
                    historyInputs={historyInputs}
                    formulaHistory={formulaHistory}
                    inputDefs={allInputDefs}
                    calcDefs={allCalcDefs}
                    rawFieldValues={rawFieldValuesByPeriod[toPeriodString(period.month, period.year)] ?? {}}
                    prevRawFieldValues={rawFieldValuesByPeriod[toPeriodString(prev.m, prev.y)] ?? {}}
                    companyId={companyId}
                    period={period}
                    onInfo={setOpenInfo}
                    privacy={financial.privacy}
                    onTogglePrivacy={isOwner ? financial.togglePrivacy : undefined}
                  />
                )}

                {inputDefs.length === 0 && calcDefs.length === 0 && (
                  <EmptyState
                    icon={BarChart3}
                    title="No hay métricas activas en esta categoría."
                    description="Las métricas disponibles dependen de tu modelo de negocio."
                  />
                )}
              </div>
            )}
          </div>

          {!financial.loading && (
            <section className="mt-10">
              <h3 className="text-xs font-medium text-foreground uppercase tracking-wide mb-3">Historial de cargas</h3>
              {financial.loadingLogs ? (
                <LoadingState />
              ) : (
                <ImportLogTable logs={financial.logs} emptyLabel="Todavía no reportaste ningún dato." />
              )}
            </section>
          )}
        </>
      )}

      {pageMode === "manage" &&
        (financial.loading ? (
          <LoadingState variant="centered" className="py-16" />
        ) : (
          <MetricsManager
            metrics={financial.metrics}
            categories={financialCategoryTabs}
            allMetrics={financial.metrics}
            rawFields={rawFields}
            onSelect={(m) => {
              setCreatingNew(false);
              setFulfillingRequirement(null);
              navigate(`/metrics/${m.id}`);
            }}
            onCreateNew={() => {
              setFulfillingRequirement(null);
              setCreatingNew(true);
            }}
          />
        ))}

      <ScenarioEntryDialog
        open={scenarioDialogOpen}
        onOpenChange={setScenarioDialogOpen}
        inputDefs={allInputDefs}
        onSubmit={financial.submitValues}
      />

      <MetricInfoSheet
        metric={pageMode === "data" ? openInfo : null}
        onClose={() => setOpenInfo(null)}
        history={infoHistory}
        onEdit={(m) => {
          setOpenInfo(null);
          navigate(`/metrics/${m.id}`);
        }}
        onOpenAssistant={onOpenAssistant}
        allMetrics={financial.metrics}
        rawFields={rawFields}
        companyId={companyId}
        entries={financial.entries}
      />

      {pageMode === "manage" && (
        <MetricPropertyPanel
          metric={selectedMetric}
          creating={creatingNew}
          open={!!selectedMetric || creatingNew}
          isOwner={isOwner}
          companyId={companyId}
          allMetrics={financial.metrics}
          categories={financialCategoryTabs}
          inputKeySuggestions={inputKeySuggestions}
          defaultCategory={activeCat}
          rawFields={rawFields}
          privacy={financial.privacy}
          onTogglePrivacy={financial.togglePrivacy}
          onClose={() => {
            setCreatingNew(false);
            setFulfillingRequirement(null);
            navigate("/metrics?tab=explorer");
          }}
          onSaved={(id) => {
            setCreatingNew(false);
            setFulfillingRequirement(null);
            financial.reload();
            onDataChanged();
            navigate(`/metrics/${id}`, { replace: true });
          }}
          onDeleted={() => {
            financial.reload();
            onDataChanged();
            navigate("/metrics?tab=explorer");
          }}
          onAgentWrote={() => {
            financial.reload();
            onDataChanged();
          }}
          fulfillsRequirementId={fulfillingRequirement?.requirement_id ?? null}
          prefill={
            fulfillingRequirement
              ? {
                  name: fulfillingRequirement.name,
                  unit: fulfillingRequirement.unit,
                  value_type: fulfillingRequirement.value_type,
                  description: fulfillingRequirement.description ?? "",
                  why_it_matters: fulfillingRequirement.why_it_matters ?? "",
                }
              : undefined
          }
        />
      )}
    </>
  );
}
