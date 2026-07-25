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
import { ImportLogTable } from "@/components/financial/ImportLogTable";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/FormDialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutGrid, Table2, Plus } from "lucide-react";
import { evalFormula, type MetricDef, type InputsMap } from "@/lib/metrics";
import { periodKey, prevMonth, toPeriodString } from "@/lib/metricPeriod";
import { handleMembershipError } from "@/lib/membership";
import { UPSERT_FINANCIAL_METRIC_DEFINITION_URL, RAW_INPUT_KEYS } from "@/lib/financialReports";

// Los tabs del lado GCP (useFinancialMetrics) son dinámicos: cualquier
// category que devuelva list-financial-metrics se vuelve un tab (así una
// métrica custom con category nueva ya aparece sin tocar código). Acquisition
// y Retention siguen fijos porque son Supabase, hasta que se migren también.
const FINANCIAL_CATEGORY_LABELS: Record<string, string> = {
  revenue: "Revenue",
  cash_efficiency: "Cash & Efficiency",
};
function labelForCategory(cat: string) {
  return FINANCIAL_CATEGORY_LABELS[cat] ?? cat.charAt(0).toUpperCase() + cat.slice(1).replace(/_/g, " ");
}

const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const now = new Date();

type ViewMode = "annual" | "monthly";
const VIEW_KEY = "cv:metrics:view";

export default function Metrics() {
  const { startup } = useStartup();
  const { company_id, is_owner } = useAuth();
  const [activeCat, setActiveCat] = useState("revenue");
  // Acquisition/Retention son las únicas categorías fijas (Supabase); todo lo
  // demás sale de list-financial-metrics (GCP), category incluida.
  const isFinancialCat = activeCat !== "acquisition" && activeCat !== "retention";
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

  // ---- Financial dataset: Revenue/Cash & Efficiency/Team/…, GCP-backed ----
  const financial = useFinancialMetrics(company_id);

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

  const categories = useMemo(
    () => [
      ...financialCategoryTabs,
      { id: "acquisition", label: "Acquisition" },
      { id: "retention", label: "Retention" },
    ],
    [financialCategoryTabs]
  );

  // ---- Métrica custom (owner-only) ----
  const [addMetricOpen, setAddMetricOpen] = useState(false);
  const [newMetricName, setNewMetricName] = useState("");
  const [newMetricCategory, setNewMetricCategory] = useState("");
  const [newMetricType, setNewMetricType] = useState<"input" | "calculated">("calculated");
  const [newMetricInputKey, setNewMetricInputKey] = useState<string>(RAW_INPUT_KEYS[0]);
  const [newMetricFormula, setNewMetricFormula] = useState("");
  const [newMetricUnit, setNewMetricUnit] = useState("");
  const [newMetricDescription, setNewMetricDescription] = useState("");
  const [savingMetric, setSavingMetric] = useState(false);

  const openAddMetric = () => {
    setNewMetricName("");
    setNewMetricCategory(isFinancialCat ? activeCat : financialCategoryTabs[0]?.id ?? "");
    setNewMetricType("calculated");
    setNewMetricInputKey(RAW_INPUT_KEYS[0]);
    setNewMetricFormula("");
    setNewMetricUnit("");
    setNewMetricDescription("");
    setAddMetricOpen(true);
  };

  const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
  const slugify = (s: string) =>
    s
      .trim()
      .toLowerCase()
      .normalize("NFD")
      .replace(DIACRITICS_RE, "")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "");

  const submitNewMetric = async () => {
    if (!company_id) return;
    const category = newMetricCategory.trim();
    if (!newMetricName.trim() || !category) {
      toast.error("Nombre y categoría son obligatorios");
      return;
    }
    if (newMetricType === "calculated" && !newMetricFormula.trim()) {
      toast.error("La fórmula es obligatoria para una métrica calculada");
      return;
    }

    const existingIds = new Set(financial.metrics.map((m) => m.id));
    const base = slugify(newMetricName);
    let slug = base;
    let suffix = 2;
    while (existingIds.has(slug)) {
      slug = `${base}_${suffix}`;
      suffix++;
    }
    const maxOrder = Math.max(0, ...financial.metrics.filter((m) => m.category === category).map((m) => m.order_index));

    const body: Record<string, unknown> = {
      company_id,
      metric_id: slug,
      name: newMetricName.trim(),
      category,
      metric_type: newMetricType,
      unit: newMetricUnit.trim() || null,
      display_order: maxOrder + 1,
    };
    if (newMetricType === "input") body.input_key = newMetricInputKey;
    else body.formula_expression = newMetricFormula.trim();
    if (newMetricDescription.trim()) body.description = newMetricDescription.trim();

    setSavingMetric(true);
    try {
      const res = await fetch(UPSERT_FINANCIAL_METRIC_DEFINITION_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (await handleMembershipError(res)) return;
      toast.success("Métrica agregada");
      setAddMetricOpen(false);
      await financial.reload();
      setActiveCat(category);
    } catch {
      toast.error("No se pudo agregar la métrica");
    } finally {
      setSavingMetric(false);
    }
  };

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

        <div className="flex items-center justify-between border-b border-border mb-8">
          <div className="flex gap-1">
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
          {is_owner && (
            <Button size="sm" variant="ghost" className="mb-1" onClick={openAddMetric}>
              <Plus size={14} className="mr-1" /> Agregar métrica
            </Button>
          )}
        </div>

        {isFinancialCat && financial.notEnabled && (
          <div className="border border-border rounded-lg p-4 mb-6 text-sm text-muted-foreground bg-surface">
            Todavía no tenés el formulario manual habilitado para reportar datos financieros. Pedile a CloudValley
            que lo active para tu startup.
          </div>
        )}

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

        {isFinancialCat && !loadingActive && (
          <section className="mt-10">
            <h3 className="text-xs font-medium text-foreground uppercase tracking-wide mb-3">Historial de cargas</h3>
            {financial.loadingLogs ? (
              <LoadingState />
            ) : (
              <ImportLogTable logs={financial.logs} emptyLabel="Todavía no reportaste ningún dato." />
            )}
          </section>
        )}
      </div>

      <MetricInfoSheet metric={openInfo} onClose={() => setOpenInfo(null)} history={infoHistory} />

      <FormDialog
        open={addMetricOpen}
        onOpenChange={setAddMetricOpen}
        title="Agregar métrica"
        description="Se agrega solo para tu startup — no afecta a las demás."
        onSubmit={submitNewMetric}
        submitLabel={savingMetric ? "Guardando…" : "Agregar"}
        busy={savingMetric}
      >
        <div>
          <Label className="text-xs">Nombre</Label>
          <Input value={newMetricName} onChange={(e) => setNewMetricName(e.target.value)} className="mt-1" placeholder="Ej: Revenue por empleado" />
        </div>
        <div>
          <Label className="text-xs">Categoría (tab donde aparece)</Label>
          <Input
            value={newMetricCategory}
            onChange={(e) => setNewMetricCategory(e.target.value)}
            className="mt-1"
            placeholder="Ej: revenue, cash_efficiency, o una nueva como ops"
            list="metric-categories"
          />
          <datalist id="metric-categories">
            {financialCategoryTabs.map((c) => (
              <option key={c.id} value={c.id} />
            ))}
          </datalist>
          <p className="text-xs text-muted-foreground mt-1">
            Si escribís una categoría que no existe todavía, se crea un tab nuevo para ella.
          </p>
        </div>
        <div>
          <Label className="text-xs">Tipo</Label>
          <Select value={newMetricType} onValueChange={(v: "input" | "calculated") => setNewMetricType(v)}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="calculated">Calculada (fórmula)</SelectItem>
              <SelectItem value="input">Dato crudo existente</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {newMetricType === "input" ? (
          <div>
            <Label className="text-xs">Campo</Label>
            <Select value={newMetricInputKey} onValueChange={setNewMetricInputKey}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {RAW_INPUT_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>{k}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Solo podés elegir uno de los campos crudos que ya se reportan — esta opción sirve para mostrar ese
              mismo dato bajo otro nombre o en otra categoría, no para agregar un campo nuevo.
            </p>
          </div>
        ) : (
          <div>
            <Label className="text-xs">Fórmula</Label>
            <Textarea
              value={newMetricFormula}
              onChange={(e) => setNewMetricFormula(e.target.value)}
              className="mt-1 font-mono text-sm"
              rows={2}
              placeholder="Ej: revenue / headcount"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Expresión que combina {RAW_INPUT_KEYS.join(", ")}.
            </p>
          </div>
        )}
        <div>
          <Label className="text-xs">Unidad (opcional)</Label>
          <Input value={newMetricUnit} onChange={(e) => setNewMetricUnit(e.target.value)} className="mt-1" placeholder="USD, %, x, meses…" />
        </div>
        <div>
          <Label className="text-xs">Descripción (opcional)</Label>
          <Textarea
            value={newMetricDescription}
            onChange={(e) => setNewMetricDescription(e.target.value)}
            className="mt-1"
            rows={2}
            placeholder="Qué es esta métrica"
          />
        </div>
      </FormDialog>
    </AppLayout>
  );
}
