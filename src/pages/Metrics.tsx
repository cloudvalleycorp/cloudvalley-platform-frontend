import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialMetrics } from "@/hooks/useFinancialMetrics";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { InputsPanel } from "@/components/metrics/InputsPanel";
import { CalculatedMetricsGrid } from "@/components/metrics/CalculatedMetricsGrid";
import { MetricInfoSheet, type MetricHistoryPoint } from "@/components/metrics/MetricInfoSheet";
import { AnnualGrid } from "@/components/metrics/AnnualGrid";
import { MetricsManager } from "@/components/metrics/MetricsManager";
import { MetricPropertyPanel } from "@/components/metrics/MetricPropertyPanel";
import { ImportLogTable } from "@/components/financial/ImportLogTable";
import { PeriodSelect } from "@/components/metrics/PeriodSelect";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { LayoutGrid, Table2, Settings2, BarChart3 } from "lucide-react";
import { type MetricDef, type RawField, sourceLabel } from "@/lib/metrics";
import { evalFormula } from "@/lib/formulaEngine";
import { periodKey, prevMonth, toPeriodString } from "@/lib/metricPeriod";
import { RAW_INPUT_KEYS } from "@/lib/financialReports";
import { LIST_RAW_FIELDS_URL } from "@/lib/sheetsIntegration";
import { useRawFieldValues } from "@/hooks/useRawFieldValues";
import { useMetricReportData } from "@/hooks/useMetricReportData";
import { handleMembershipError } from "@/lib/membership";

// Los tabs son 100% dinámicos: cualquier category que devuelva list-metrics
// se vuelve un tab (así una métrica custom con category nueva, o el catálogo
// default de Acquisition/Retention, ya aparecen sin tocar código).
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

// "data" = cargar/ver valores (tabs, anual/mensual — sin cambios de siempre).
// "manage" = editor de esquema de métricas estilo AppSheet (lista + panel).
// Persistido igual que `view`, así refrescar la página durante una sesión de
// limpieza del catálogo no devuelve de golpe al modo de carga de datos.
type PageMode = "data" | "manage";
const PAGE_MODE_KEY = "cv:metrics:pageMode";

export default function Metrics() {
  const { company_id, is_owner } = useAuth();
  const { metricId } = useParams<{ metricId?: string }>();
  const navigate = useNavigate();
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

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  useEffect(() => {
    localStorage.setItem(PAGE_MODE_KEY, pageMode);
  }, [pageMode]);

  // Entrar con un metricId en la URL (link compartido) fuerza modo "manage",
  // pero nada vuelve a forzarlo a "data" automáticamente — si no, cerrar el
  // panel te patearía fuera del modo administrar sin que lo pidas.
  useEffect(() => {
    if (metricId) setPageMode("manage");
  }, [metricId]);

  // ---- Todas las categorías (Revenue, Cash & Efficiency, Acquisition,
  // Retention, y cualquier custom) salen de acá, GCP-backed. ----
  const financial = useFinancialMetrics(company_id);

  const selectedMetric = metricId ? (financial.metrics.find((m) => m.id === metricId) ?? null) : null;

  // Link a una métrica que ya no existe (borrada, o typo) — avisar y volver
  // a la lista en vez de dejar el panel colgado sin nada que mostrar.
  useEffect(() => {
    if (!metricId || financial.loading) return;
    if (!financial.metrics.some((m) => m.id === metricId)) {
      toast.error("No encontramos esa métrica. Puede que se haya eliminado.");
      navigate("/metrics", { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [metricId, financial.loading, financial.metrics]);

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

  // input_key ya no está restringido a RAW_INPUT_KEYS (los 8 campos
  // originales) — se suman los que ya existan como sugerencia, tanto para
  // el datalist del campo "Campo" como para el hint de la fórmula.
  const inputKeySuggestions = useMemo(() => {
    const keys = new Set<string>(RAW_INPUT_KEYS);
    for (const m of financial.metrics) {
      if (m.metric_type === "input" && m.input_key) keys.add(m.input_key);
    }
    return Array.from(keys);
  }, [financial.metrics]);

  // Todas las métricas calculadas (cualquier categoría) — se usan como
  // variables reutilizables adentro de OTRAS fórmulas.
  const allCalcDefs = useMemo(
    () => financial.metrics.filter((m) => m.metric_type === "calculated"),
    [financial.metrics]
  );

  // Campos crudos de integraciones (Sheets, a futuro Stripe) — para el
  // autocomplete de fórmulas (FormulaField) y para saber qué queries
  // resolver (una fórmula puede usar FIELDSUM/etc. sin que ese campo
  // aparezca en ningún otro lado de la company).
  const [rawFields, setRawFields] = useState<RawField[]>([]);
  useEffect(() => {
    if (!company_id) return;
    (async () => {
      try {
        const res = await fetch(`${LIST_RAW_FIELDS_URL}?company_id=${encodeURIComponent(company_id)}`, {
          credentials: "include",
        });
        if (await handleMembershipError(res)) return;
        const data = await res.json();
        setRawFields(Array.isArray(data?.fields) ? data.fields : []);
      } catch {
        // silencioso: el editor de fórmulas simplemente no sugiere campos crudos
      }
    })();
  }, [company_id]);

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
  ) => {
    if (changes.length === 0) return;
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
    let anyFailed = false;
    for (const { year: y, month: m, values } of byPeriod.values()) {
      const ok = await financial.submitValues(toPeriodString(m, y), values);
      if (!ok) {
        anyFailed = true;
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

  // Todos los períodos que alguna parte de la pantalla puede llegar a
  // necesitar para resolver FIELDSUM/FIELDCOUNT/FIELDCOUNTD/FIELDAVG: los 12
  // meses del año del grid anual (extra sobre lo que ya cubre
  // useMetricReportData) más el set base (mes actual + anterior + últimos 12
  // meses desde hoy). Una sola resolución deduplicada para toda la página en
  // vez de una por componente.
  const allFormulas = useMemo(() => allCalcDefs.map((d) => d.formula_expression), [allCalcDefs]);
  const rawFieldPeriods = useMemo(() => {
    const set = new Set(baseRawFieldPeriods);
    for (let m = 1; m <= 12; m++) set.add(toPeriodString(m, year));
    return Array.from(set);
  }, [year, baseRawFieldPeriods]);
  const { valuesByPeriod: rawFieldValuesByPeriod } = useRawFieldValues(company_id, rawFieldPeriods, allFormulas);

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
        v = evalFormula(
          openInfo.formula_expression,
          inp,
          [],
          allCalcDefs,
          rawFieldValuesByPeriod[toPeriodString(m, y)] ?? {}
        );
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
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <PageHeader
          title="Growth Tracker"
          subtitle="Cargá los datos del mes y mirá cómo evolucionan tus métricas clave."
          action={
            pageMode === "data" ? (
              <>
                {view === "monthly" && <PeriodSelect period={period} onChange={setPeriod} />}
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
                {is_owner && (
                  <Button variant="outline" onClick={() => setPageMode("manage")}>
                    <Settings2 size={14} className="mr-1" /> Administrar métricas
                  </Button>
                )}
              </>
            ) : (
              is_owner && (
                <Button
                  variant="outline"
                  onClick={() => {
                    setPageMode("data");
                    if (metricId) navigate("/metrics");
                  }}
                >
                  <LayoutGrid size={14} className="mr-1" /> Cargar datos
                </Button>
              )
            )
          }
        />

        {pageMode === "data" && (
          <>
            <div className="flex gap-1 border-b border-border mb-8">
              {financialCategoryTabs.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setActiveCat(c.id)}
                  aria-pressed={activeCat === c.id}
                  className={cn(
                    "px-3 py-2 text-sm rounded-md transition-all duration-150",
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
                Todavía no tenés el formulario manual habilitado para reportar datos financieros. Pedile a CloudValley
                que lo active para tu startup.
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
                  action={
                    is_owner
                      ? {
                          label: "Agregar métrica",
                          onClick: () => {
                            setPageMode("manage");
                            setCreatingNew(true);
                          },
                        }
                      : undefined
                  }
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
                  onTogglePrivacy={is_owner ? financial.togglePrivacy : undefined}
                  onInfo={setOpenInfo}
                  rawFieldValuesByPeriod={rawFieldValuesByPeriod}
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
                    onTogglePrivacy={is_owner ? financial.togglePrivacy : undefined}
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
                    onInfo={setOpenInfo}
                    privacy={financial.privacy}
                    onTogglePrivacy={is_owner ? financial.togglePrivacy : undefined}
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
              isOwner={is_owner}
              categories={financialCategoryTabs}
              onSelect={(m) => {
                setCreatingNew(false);
                navigate(`/metrics/${m.id}`);
              }}
              onCreateNew={() => setCreatingNew(true)}
            />
          ))}
      </div>

      <MetricInfoSheet
        metric={pageMode === "data" ? openInfo : null}
        onClose={() => setOpenInfo(null)}
        history={infoHistory}
        onEdit={
          is_owner
            ? (m) => {
                setOpenInfo(null);
                navigate(`/metrics/${m.id}`);
              }
            : undefined
        }
      />

      {pageMode === "manage" && (
        <MetricPropertyPanel
          metric={selectedMetric}
          creating={creatingNew}
          open={!!selectedMetric || creatingNew}
          isOwner={is_owner}
          companyId={company_id}
          allMetrics={financial.metrics}
          categories={financialCategoryTabs}
          inputKeySuggestions={inputKeySuggestions}
          defaultCategory={activeCat}
          currentInputs={currentInputs}
          formulaHistory={formulaHistory}
          rawFields={rawFields}
          privacy={financial.privacy}
          onTogglePrivacy={financial.togglePrivacy}
          onClose={() => {
            setCreatingNew(false);
            navigate("/metrics");
          }}
          onSaved={(id) => {
            setCreatingNew(false);
            financial.reload();
            navigate(`/metrics/${id}`, { replace: true });
          }}
          onDeleted={() => {
            financial.reload();
            navigate("/metrics");
          }}
        />
      )}
    </AppLayout>
  );
}
