import { useEffect, useMemo, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useStartup } from "@/hooks/useStartup";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialMetrics } from "@/hooks/useFinancialMetrics";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { InputsPanel } from "@/components/metrics/InputsPanel";
import { CalculatedMetricsGrid } from "@/components/metrics/CalculatedMetricsGrid";
import { MetricInfoSheet, type MetricHistoryPoint } from "@/components/metrics/MetricInfoSheet";
import { AnnualGrid } from "@/components/metrics/AnnualGrid";
import { LayoutGrid, Table2 } from "lucide-react";
import { evalFormula, type MetricDef, type InputsMap } from "@/lib/metrics";

// Revenue y Cash & Efficiency están respaldadas por el módulo nuevo en GCP
// (useFinancialMetrics) en vez de Supabase. Acquisition y Retention siguen
// en metric_configs/metric_entries hasta que se migren también.
const categories = [
  { id: "revenue", label: "Revenue" },
  { id: "acquisition", label: "Acquisition" },
  { id: "retention", label: "Retention" },
  { id: "cash_efficiency", label: "Cash & Efficiency" },
];
const FINANCIAL_CATEGORIES = new Set(["revenue", "cash_efficiency"]);

const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const now = new Date();

const periodKey = (m: number, y: number) => `${y}-${m}`;
const prevMonth = (m: number, y: number) =>
  m === 1 ? { m: 12, y: y - 1 } : { m: m - 1, y };
const toPeriodString = (m: number, y: number) => `${y}-${String(m).padStart(2, "0")}`;

type ViewMode = "annual" | "monthly";
const VIEW_KEY = "cv:metrics:view";

export default function Metrics() {
  const { startup } = useStartup();
  const { company_id } = useAuth();
  const [activeCat, setActiveCat] = useState("revenue");
  const isFinancialCat = FINANCIAL_CATEGORIES.has(activeCat);
  const [view, setView] = useState<ViewMode>(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem(VIEW_KEY)) as ViewMode | null;
    return stored === "monthly" ? "monthly" : "annual";
  });
  const [year, setYear] = useState(now.getFullYear());
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });

  // ---- Legacy dataset: Acquisition/Retention, Supabase-backed ----
  const [legacyMetrics, setLegacyMetrics] = useState<MetricDef[]>([]);
  const [legacyEntries, setLegacyEntries] = useState<Record<string, Record<string, number>>>({});
  const [legacySources, setLegacySources] = useState<Record<string, Record<string, string>>>({});
  const [legacyPrivacy, setLegacyPrivacy] = useState<Record<string, boolean>>({});
  const [openInfo, setOpenInfo] = useState<MetricDef | null>(null);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  useEffect(() => {
    if (!startup) return;
    (async () => {
      const { data: configs } = await supabase
        .from("metric_configs")
        .select("metric_id, display_order, metric_definitions(*)")
        .eq("startup_id", startup.id)
        .eq("is_active", true)
        .order("display_order");
      const defs = (configs ?? [])
        .map((c: any) => c.metric_definitions)
        .filter(Boolean) as MetricDef[];
      setLegacyMetrics(defs);

      const { data: ents } = await supabase
        .from("metric_entries")
        .select("metric_id, value, period_month, period_year, source")
        .eq("startup_id", startup.id);
      const map: Record<string, Record<string, number>> = {};
      const srcMap: Record<string, Record<string, string>> = {};
      for (const e of ents ?? []) {
        if (e.value === null || e.value === undefined) continue;
        map[e.metric_id] ??= {};
        map[e.metric_id][periodKey(e.period_month, e.period_year)] = Number(e.value);
        if (e.source) {
          srcMap[e.metric_id] ??= {};
          srcMap[e.metric_id][periodKey(e.period_month, e.period_year)] = e.source as string;
        }
      }
      setLegacyEntries(map);
      setLegacySources(srcMap);

      const { data: priv } = await supabase
        .from("metric_privacy")
        .select("metric_id, is_public")
        .eq("startup_id", startup.id);
      const privMap: Record<string, boolean> = {};
      for (const p of priv ?? []) privMap[p.metric_id] = p.is_public;
      setLegacyPrivacy(privMap);
    })();
  }, [startup?.id]);

  const legacySaveInput = async (inputKey: string, value: number | null) => {
    if (!startup) return;
    const def = legacyMetrics.find((m) => m.metric_type === "input" && m.input_key === inputKey);
    if (!def) return;

    if (value === null) {
      await supabase
        .from("metric_entries")
        .delete()
        .eq("startup_id", startup.id)
        .eq("metric_id", def.id)
        .eq("period_month", period.month)
        .eq("period_year", period.year);
      setLegacyEntries((prev) => {
        const next = { ...prev };
        if (next[def.id]) {
          const inner = { ...next[def.id] };
          delete inner[periodKey(period.month, period.year)];
          next[def.id] = inner;
        }
        return next;
      });
      return;
    }

    const { error } = await supabase
      .from("metric_entries")
      .upsert(
        {
          startup_id: startup.id,
          metric_id: def.id,
          period_month: period.month,
          period_year: period.year,
          value,
        },
        { onConflict: "startup_id,metric_id,period_month,period_year" }
      );
    if (error) {
      toast.error("No se pudo guardar");
      return;
    }
    setLegacyEntries((prev) => ({
      ...prev,
      [def.id]: {
        ...(prev[def.id] ?? {}),
        [periodKey(period.month, period.year)]: value,
      },
    }));
  };

  const legacyTogglePrivacy = async (metricId: string, next: boolean) => {
    if (!startup) return;
    setLegacyPrivacy((p) => ({ ...p, [metricId]: next }));
    const { error } = await supabase
      .from("metric_privacy")
      .upsert(
        { startup_id: startup.id, metric_id: metricId, is_public: next },
        { onConflict: "startup_id,metric_id" }
      );
    if (error) {
      toast.error("No se pudo actualizar la privacidad");
      setLegacyPrivacy((p) => ({ ...p, [metricId]: !next }));
    }
  };

  const legacySaveAnnualBatch = async (
    changes: { metricId: string; year: number; month: number; value: number | null }[]
  ) => {
    if (!startup || changes.length === 0) return;

    const toUpsert = changes.filter((c) => c.value !== null);
    const toDelete = changes.filter((c) => c.value === null);

    if (toUpsert.length > 0) {
      const { error } = await supabase
        .from("metric_entries")
        .upsert(
          toUpsert.map((c) => ({
            startup_id: startup.id,
            metric_id: c.metricId,
            period_month: c.month,
            period_year: c.year,
            value: c.value!,
          })),
          { onConflict: "startup_id,metric_id,period_month,period_year" }
        );
      if (error) {
        toast.error("No se pudieron guardar todos los cambios");
        return;
      }
    }

    for (const d of toDelete) {
      await supabase
        .from("metric_entries")
        .delete()
        .eq("startup_id", startup.id)
        .eq("metric_id", d.metricId)
        .eq("period_month", d.month)
        .eq("period_year", d.year);
    }

    setLegacyEntries((prev) => {
      const next = { ...prev };
      for (const c of changes) {
        next[c.metricId] = { ...(next[c.metricId] ?? {}) };
        const pk = periodKey(c.month, c.year);
        if (c.value === null) delete next[c.metricId][pk];
        else next[c.metricId][pk] = c.value;
      }
      return next;
    });

    toast.success(`${changes.length} cambio${changes.length === 1 ? "" : "s"} guardado${changes.length === 1 ? "" : "s"}`);
  };

  // ---- Financial dataset: Revenue/Cash & Efficiency, GCP-backed ----
  const financial = useFinancialMetrics(company_id);

  const financialSaveInput = async (inputKey: string, value: number | null) => {
    if (value === null) {
      toast.error("Todavía no se puede vaciar un campo ya cargado — solo corregirlo con un valor nuevo.");
      return;
    }
    const def = financial.metrics.find((m) => m.metric_type === "input" && m.input_key === inputKey);
    if (!def) return;
    const ok = await financial.submitValues(toPeriodString(period.month, period.year), { [inputKey]: value });
    if (!ok) return;
    financial.applyLocalEntry(def.id, period.month, period.year, value);
    toast.success("Guardado");
  };

  const financialSaveAnnualBatch = async (
    changes: { metricId: string; year: number; month: number; value: number | null }[]
  ) => {
    if (changes.length === 0) return;
    const cleared = changes.filter((c) => c.value === null);
    const toSave = changes.filter((c) => c.value !== null);
    if (cleared.length > 0) {
      toast.error(
        `${cleared.length} campo${cleared.length === 1 ? "" : "s"} no se pudo vaciar — el módulo nuevo solo permite corregir con un valor nuevo, no borrar.`
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

  // ---- Active dataset, switched by category ----
  const activeMetrics = isFinancialCat ? financial.metrics : legacyMetrics;
  const activeEntries = isFinancialCat ? financial.entries : legacyEntries;
  const activeSources = isFinancialCat ? undefined : legacySources;
  const activePrivacy = isFinancialCat ? financial.privacy : legacyPrivacy;
  const activeTogglePrivacy = isFinancialCat ? financial.togglePrivacy : legacyTogglePrivacy;
  const activeSaveInput = isFinancialCat ? financialSaveInput : legacySaveInput;
  const activeSaveAnnualBatch = isFinancialCat ? financialSaveAnnualBatch : legacySaveAnnualBatch;

  const inputDefs = useMemo(
    () => activeMetrics.filter((m) => m.metric_type === "input" && m.category === activeCat),
    [activeMetrics, activeCat]
  );
  const calcDefs = useMemo(
    () => activeMetrics.filter((m) => m.metric_type === "calculated" && m.category === activeCat),
    [activeMetrics, activeCat]
  );
  const allInputDefs = useMemo(
    () => activeMetrics.filter((m) => m.metric_type === "input"),
    [activeMetrics]
  );
  const inputsForPeriod = (m: number, y: number): InputsMap => {
    const result: InputsMap = {};
    const pk = periodKey(m, y);
    for (const def of allInputDefs) {
      if (!def.input_key) continue;
      const v = activeEntries[def.id]?.[pk];
      if (v !== undefined) result[def.input_key] = v;
    }
    return result;
  };

  const currentInputs = inputsForPeriod(period.month, period.year);
  const prev = prevMonth(period.month, period.year);
  const prevInputs = inputsForPeriod(prev.m, prev.y);

  const historyInputs = useMemo(() => {
    const arr: InputsMap[] = [];
    let m = period.month, y = period.year;
    for (let i = 0; i < 6; i++) {
      arr.unshift(inputsForPeriod(m, y));
      const p = prevMonth(m, y);
      m = p.m;
      y = p.y;
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeEntries, period, allInputDefs]);

  const infoHistory = useMemo<MetricHistoryPoint[]>(() => {
    if (!openInfo) return [];
    const out: MetricHistoryPoint[] = [];
    let m = now.getMonth() + 1;
    let y = now.getFullYear();
    for (let i = 0; i < 12; i++) {
      let v: number | null = null;
      if (openInfo.metric_type === "input" && openInfo.input_key) {
        const raw = activeEntries[openInfo.id]?.[periodKey(m, y)];
        if (raw !== undefined) v = raw;
      } else if (openInfo.metric_type === "calculated" && openInfo.formula_expression) {
        const inp = inputsForPeriod(m, y);
        v = evalFormula(openInfo.formula_expression, inp);
      }
      if (v !== null && v !== undefined) out.unshift({ year: y, month: m, value: v });
      const p = prevMonth(m, y);
      m = p.m;
      y = p.y;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInfo, activeEntries, allInputDefs]);

  const loadingActive = isFinancialCat && financial.loading;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <PageHeader
          title="Growth Tracker"
          subtitle="Cargá los datos del mes y mirá cómo evolucionan tus métricas clave."
          action={
            <>
              {view === "monthly" && (
                <select
                  value={`${period.year}-${period.month}`}
                  onChange={(e) => {
                    const [y, m] = e.target.value.split("-").map(Number);
                    setPeriod({ month: m, year: y });
                  }}
                  className="border border-border rounded-md px-3 py-1.5 text-sm bg-background h-9"
                >
                  {Array.from({ length: 12 }, (_, i) => {
                    const d = new Date(now.getFullYear(), now.getMonth() - i);
                    return (
                      <option key={i} value={`${d.getFullYear()}-${d.getMonth() + 1}`}>
                        {months[d.getMonth()]} {d.getFullYear()}
                      </option>
                    );
                  })}
                </select>
              )}
              <div className="inline-flex border border-border rounded-md overflow-hidden h-9">
                <button
                  onClick={() => setView("annual")}
                  className={cn(
                    "px-3 text-xs flex items-center gap-1.5 transition-all",
                    view === "annual" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Vista anual"
                >
                  <Table2 size={12} strokeWidth={1.5} /> Anual
                </button>
                <button
                  onClick={() => setView("monthly")}
                  className={cn(
                    "px-3 text-xs flex items-center gap-1.5 transition-all border-l border-border",
                    view === "monthly" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                  )}
                  title="Vista mensual"
                >
                  <LayoutGrid size={12} strokeWidth={1.5} /> Mensual
                </button>
              </div>
            </>
          }
        />

        <div className="flex gap-1 border-b border-border mb-8">
          {categories.map((c) => (
            <button
              key={c.id}
              onClick={() => setActiveCat(c.id)}
              className={cn(
                "px-3 py-2 text-sm transition-all duration-150 border-b-2 -mb-px",
                activeCat === c.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {c.label}
            </button>
          ))}
        </div>

        {loadingActive ? (
          <div className="text-center py-16 text-sm text-muted-foreground">Cargando…</div>
        ) : view === "annual" ? (
          inputDefs.length === 0 && calcDefs.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              No hay métricas activas en esta categoría para tu modelo de negocio.
            </div>
          ) : (
            <AnnualGrid
              year={year}
              onYearChange={setYear}
              inputDefs={inputDefs}
              calcDefs={calcDefs}
              allInputDefs={allInputDefs}
              entries={activeEntries}
              sources={activeSources}
              onSaveBatch={activeSaveAnnualBatch}
              privacy={activePrivacy}
              onTogglePrivacy={activeTogglePrivacy}
              onInfo={setOpenInfo}
            />
          )
        ) : (
          <div className="space-y-10">
            {inputDefs.length > 0 && (
              <InputsPanel
                inputs={inputDefs}
                values={currentInputs}
                onSave={activeSaveInput}
                onInfo={setOpenInfo}
                privacy={activePrivacy}
                onTogglePrivacy={activeTogglePrivacy}
              />
            )}

            {calcDefs.length > 0 && (
              <CalculatedMetricsGrid
                metrics={calcDefs}
                currentInputs={currentInputs}
                prevInputs={prevInputs}
                historyInputs={historyInputs}
                inputDefs={allInputDefs}
                onInfo={setOpenInfo}
                privacy={activePrivacy}
                onTogglePrivacy={activeTogglePrivacy}
              />
            )}

            {inputDefs.length === 0 && calcDefs.length === 0 && (
              <div className="text-center py-16 text-sm text-muted-foreground">
                No hay métricas activas en esta categoría para tu modelo de negocio.
              </div>
            )}
          </div>
        )}
      </div>

      <MetricInfoSheet metric={openInfo} onClose={() => setOpenInfo(null)} history={infoHistory} />
    </AppLayout>
  );
}
