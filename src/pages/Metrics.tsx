import { useEffect, useMemo, useRef, useState } from "react";
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
import { ImportLogTable } from "@/components/financial/ImportLogTable";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/components/FormDialog";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { LayoutGrid, Table2, Plus, BarChart3 } from "lucide-react";
import { type MetricDef, type InputsMap, type PeriodInputs, type ValueType, formatMetricValue } from "@/lib/metrics";
import { evalFormula, evalFormulaDetailed } from "@/lib/formulaEngine";
import { periodKey, prevMonth, toPeriodString } from "@/lib/metricPeriod";
import { handleMembershipError } from "@/lib/membership";
import {
  UPSERT_FINANCIAL_METRIC_DEFINITION_URL,
  DELETE_FINANCIAL_METRIC_DEFINITION_URL,
  RAW_INPUT_KEYS,
  type DeleteMetricDefinitionResponse,
} from "@/lib/financialReports";

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

const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const now = new Date();

type ViewMode = "annual" | "monthly";
const VIEW_KEY = "cv:metrics:view";

export default function Metrics() {
  const { company_id, is_owner } = useAuth();
  const [activeCat, setActiveCat] = useState("revenue");
  const [view, setView] = useState<ViewMode>(() => {
    const stored = (typeof window !== "undefined" && localStorage.getItem(VIEW_KEY)) as ViewMode | null;
    return stored === "monthly" ? "monthly" : "annual";
  });
  const [year, setYear] = useState(now.getFullYear());
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [openInfo, setOpenInfo] = useState<MetricDef | null>(null);

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, view);
  }, [view]);

  // ---- Todas las categorías (Revenue, Cash & Efficiency, Acquisition,
  // Retention, y cualquier custom) salen de acá, GCP-backed. ----
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

  // input_key ya no está restringido a RAW_INPUT_KEYS (los 8 campos
  // originales) — se suman los que ya existan como sugerencia, tanto para
  // el datalist del campo "Campo" como para el hint de la fórmula.
  const allRawInputKeys = useMemo(() => {
    const keys = new Set<string>(RAW_INPUT_KEYS);
    for (const m of financial.metrics) {
      if (m.metric_type === "input" && m.input_key) keys.add(m.input_key);
    }
    return Array.from(keys);
  }, [financial.metrics]);

  const inputKeySuggestions = allRawInputKeys;

  // Todas las métricas calculadas (cualquier categoría) — se usan como
  // variables reutilizables adentro de OTRAS fórmulas (ver formulaEngine's
  // calcDefs), no solo los campos crudos.
  const allCalcDefs = useMemo(
    () => financial.metrics.filter((m) => m.metric_type === "calculated"),
    [financial.metrics]
  );

  // ---- Métrica custom (owner-only) ----
  const [addMetricOpen, setAddMetricOpen] = useState(false);
  const [newMetricName, setNewMetricName] = useState("");
  const [newMetricCategory, setNewMetricCategory] = useState("");
  const [newMetricType, setNewMetricType] = useState<"input" | "calculated">("calculated");
  const [newMetricInputKey, setNewMetricInputKey] = useState("");
  const [newMetricValueType, setNewMetricValueType] = useState<ValueType>("count");
  const [newMetricFormula, setNewMetricFormula] = useState("");
  const [newMetricUnit, setNewMetricUnit] = useState("");
  const [newMetricDescription, setNewMetricDescription] = useState("");
  const [savingMetric, setSavingMetric] = useState(false);
  const [editingMetricId, setEditingMetricId] = useState<string | null>(null);
  const formulaTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Métricas calculadas que se pueden referenciar desde la fórmula que se
  // está editando — todas menos ella misma (autoreferenciarse no tiene
  // sentido; el motor igual lo cortaría como ciclo, pero mejor no ofrecerlo).
  const reusableCalcMetrics = useMemo(
    () => allCalcDefs.filter((m) => m.id !== editingMetricId),
    [allCalcDefs, editingMetricId]
  );

  const insertAtFormulaCursor = (text: string) => {
    const el = formulaTextareaRef.current;
    const start = el?.selectionStart ?? newMetricFormula.length;
    const end = el?.selectionEnd ?? newMetricFormula.length;
    const next = newMetricFormula.slice(0, start) + text + newMetricFormula.slice(end);
    setNewMetricFormula(next);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(start + text.length, start + text.length);
    });
  };

  const openAddMetric = () => {
    setEditingMetricId(null);
    setNewMetricName("");
    setNewMetricCategory(activeCat);
    setNewMetricType("calculated");
    setNewMetricInputKey("");
    setNewMetricValueType("count");
    setNewMetricFormula("");
    setNewMetricUnit("");
    setNewMetricDescription("");
    setAddMetricOpen(true);
  };

  const openEditMetric = (m: MetricDef) => {
    setEditingMetricId(m.id);
    setNewMetricName(m.name);
    setNewMetricCategory(m.category);
    setNewMetricType(m.metric_type);
    setNewMetricInputKey(m.input_key ?? "");
    setNewMetricValueType(m.value_type ?? "count");
    setNewMetricFormula(m.formula_expression ?? "");
    setNewMetricUnit(m.unit ?? "");
    setNewMetricDescription(m.description ?? "");
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
    const inputKeySlug = slugify(newMetricInputKey);
    if (newMetricType === "input" && !inputKeySlug) {
      toast.error("El campo es obligatorio para un dato crudo");
      return;
    }

    let slug: string;
    let displayOrder: number;
    if (editingMetricId) {
      slug = editingMetricId;
      displayOrder = financial.metrics.find((m) => m.id === editingMetricId)?.order_index ?? 0;
    } else {
      const existingIds = new Set(financial.metrics.map((m) => m.id));
      const base = slugify(newMetricName);
      slug = base;
      let suffix = 2;
      while (existingIds.has(slug)) {
        slug = `${base}_${suffix}`;
        suffix++;
      }
      displayOrder =
        Math.max(0, ...financial.metrics.filter((m) => m.category === category).map((m) => m.order_index)) + 1;
    }

    const body: Record<string, unknown> = {
      company_id,
      metric_id: slug,
      name: newMetricName.trim(),
      category,
      metric_type: newMetricType,
      unit: newMetricUnit.trim() || null,
      display_order: displayOrder,
    };
    if (newMetricType === "input") {
      body.input_key = inputKeySlug;
      body.value_type = newMetricValueType;
    } else {
      body.formula_expression = newMetricFormula.trim();
    }
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
      toast.success(editingMetricId ? "Métrica actualizada" : "Métrica agregada");
      setAddMetricOpen(false);
      setEditingMetricId(null);
      await financial.reload();
      setActiveCat(category);
    } catch {
      toast.error(editingMetricId ? "No se pudo actualizar la métrica" : "No se pudo agregar la métrica");
    } finally {
      setSavingMetric(false);
    }
  };

  // ---- Eliminar métrica (owner-only) ----
  const [deletingMetric, setDeletingMetric] = useState<MetricDef | null>(null);
  const [deleteRecordsToo, setDeleteRecordsToo] = useState(false);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const openDeleteMetric = (m: MetricDef) => {
    setDeleteRecordsToo(false);
    setDeletingMetric(m);
  };

  const confirmDeleteMetric = async () => {
    if (!company_id || !deletingMetric) return;
    setDeletingBusy(true);
    try {
      const res = await fetch(DELETE_FINANCIAL_METRIC_DEFINITION_URL, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id,
          metric_id: deletingMetric.id,
          delete_records: deletingMetric.metric_type === "input" ? deleteRecordsToo : false,
        }),
      });
      if (res.status === 404) {
        toast.error("Esta métrica es parte del catálogo default y todavía no tiene una versión propia de tu startup, no se puede eliminar. Podés editarla si querés cambiarla.");
        return;
      }
      if (await handleMembershipError(res)) return;
      if (!res.ok) {
        toast.error("No se pudo eliminar la métrica");
        return;
      }
      const data = (await res.json().catch(() => null)) as DeleteMetricDefinitionResponse | null;
      toast.success("Métrica eliminada");
      if (data?.affected_reports && data.affected_reports.length > 0) {
        const names = data.affected_reports.map((r) => r.name).join(", ");
        toast.error(
          `Esta métrica sigue en ${data.affected_reports.length} reporte${data.affected_reports.length === 1 ? "" : "s"} (${names}). Esa sección va a quedar sin poder resolver valor hasta que la saques del reporte.`,
          { duration: 8000 }
        );
      }
      setDeletingMetric(null);
      await financial.reload();
    } catch {
      toast.error("No se pudo eliminar la métrica");
    } finally {
      setDeletingBusy(false);
    }
  };

  const financialSaveInput = async (inputKey: string, value: number | null) => {
    if (value === null) {
      toast.error("Todavía no se puede vaciar un campo ya cargado. Solo se puede corregir con un valor nuevo.");
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
  const allInputDefs = useMemo(
    () => financial.metrics.filter((m) => m.metric_type === "input"),
    [financial.metrics]
  );
  const inputsForPeriod = (m: number, y: number): InputsMap => {
    const result: InputsMap = {};
    const pk = periodKey(m, y);
    for (const def of allInputDefs) {
      if (!def.input_key) continue;
      const v = financial.entries[def.id]?.[pk];
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
  }, [financial.entries, period, allInputDefs]);

  // Ventana más ancha (24 meses) para SUMLAST/AVGLAST/YTD en fórmulas
  // custom — no pega a la API de nuevo, financial.entries ya trae todo el
  // histórico (list-records no manda from/to).
  const formulaHistory = useMemo(() => {
    const arr: PeriodInputs[] = [];
    let m = period.month, y = period.year;
    for (let i = 0; i < 24; i++) {
      arr.unshift({ month: m, year: y, values: inputsForPeriod(m, y) });
      const p = prevMonth(m, y);
      m = p.m;
      y = p.y;
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [financial.entries, period, allInputDefs]);

  // Vista previa en vivo del formulario "Agregar/Editar métrica" — misma
  // fuente de datos que usa CalculatedMetricsGrid, así lo que se ve acá es
  // lo que se va a ver después en la grilla.
  const formulaPreview = useMemo(
    () => evalFormulaDetailed(newMetricFormula, currentInputs, formulaHistory, reusableCalcMetrics),
    [newMetricFormula, currentInputs, formulaHistory, reusableCalcMetrics]
  );

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
        v = evalFormula(openInfo.formula_expression, inp, [], allCalcDefs);
      }
      if (v !== null && v !== undefined) out.unshift({ year: y, month: m, value: v });
      const p = prevMonth(m, y);
      m = p.m;
      y = p.y;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInfo, financial.entries, allInputDefs]);

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
              {is_owner && (
                <Button variant="outline" onClick={openAddMetric}>
                  <Plus size={14} className="mr-1" /> Agregar métrica
                </Button>
              )}
            </>
          }
        />

        <div className="flex gap-1 border-b border-border mb-8">
          {financialCategoryTabs.map((c) => (
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
              onTogglePrivacy={financial.togglePrivacy}
              onInfo={setOpenInfo}
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
                onTogglePrivacy={financial.togglePrivacy}
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
                onInfo={setOpenInfo}
                privacy={financial.privacy}
                onTogglePrivacy={financial.togglePrivacy}
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
      </div>

      <MetricInfoSheet
        metric={openInfo}
        onClose={() => setOpenInfo(null)}
        history={infoHistory}
        onEdit={
          is_owner
            ? (m) => {
                setOpenInfo(null);
                openEditMetric(m);
              }
            : undefined
        }
        onDelete={
          is_owner
            ? (m) => {
                setOpenInfo(null);
                openDeleteMetric(m);
              }
            : undefined
        }
      />

      <ConfirmationDialog
        open={!!deletingMetric}
        onOpenChange={(o) => !o && setDeletingMetric(null)}
        title={`Eliminar ${deletingMetric?.name ?? "métrica"}`}
        description={
          <div className="space-y-3">
            <p>
              Se elimina esta métrica para tu startup.{" "}
              {deletingMetric?.metric_type === "input"
                ? "Los valores que ya cargaste quedan guardados pero dejan de mostrarse, salvo que elijas borrarlos también abajo."
                : "Como es una métrica calculada, no tiene valores propios que borrar."}
            </p>
            {deletingMetric?.metric_type === "input" && (
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={deleteRecordsToo}
                  onCheckedChange={(c) => setDeleteRecordsToo(c === true)}
                  className="mt-0.5"
                />
                <span>
                  Eliminar también los valores ya cargados para este campo. Esta acción no se puede deshacer.
                </span>
              </label>
            )}
          </div>
        }
        confirmLabel="Eliminar"
        variant="destructive"
        busy={deletingBusy}
        onConfirm={confirmDeleteMetric}
      />

      <FormDialog
        open={addMetricOpen}
        onOpenChange={(o) => {
          setAddMetricOpen(o);
          if (!o) setEditingMetricId(null);
        }}
        title={editingMetricId ? "Editar métrica" : "Agregar métrica"}
        description={
          editingMetricId
            ? "Los cambios aplican solo para tu startup."
            : "Se agrega solo para tu startup, no afecta a las demás."
        }
        onSubmit={submitNewMetric}
        submitLabel={savingMetric ? "Guardando…" : editingMetricId ? "Guardar" : "Agregar"}
        busy={savingMetric}
        contentClassName="sm:max-w-2xl"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
              Si escribís una que no existe todavía, se crea un tab nuevo.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
          <div>
            <Label className="text-xs">Unidad (opcional)</Label>
            <Input value={newMetricUnit} onChange={(e) => setNewMetricUnit(e.target.value)} className="mt-1" placeholder="USD, %, x, meses…" />
          </div>
        </div>

        {newMetricType === "input" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Campo</Label>
              <Input
                value={newMetricInputKey}
                onChange={(e) => setNewMetricInputKey(e.target.value)}
                className="mt-1"
                placeholder="Ej: new_customers"
                list="metric-input-keys"
              />
              <datalist id="metric-input-keys">
                {inputKeySuggestions.map((k) => (
                  <option key={k} value={k} />
                ))}
              </datalist>
              <p className="text-xs text-muted-foreground mt-1">
                El dato crudo que vas a cargar cada mes. Podés reusar uno que ya se reporta o escribir uno nuevo.
              </p>
            </div>
            <div>
              <Label className="text-xs">Tipo de valor</Label>
              <Select value={newMetricValueType} onValueChange={(v: ValueType) => setNewMetricValueType(v)}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="money">Moneda</SelectItem>
                  <SelectItem value="count">Entero</SelectItem>
                  <SelectItem value="percentage">Porcentaje</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">
                Define el formulario de carga que vas a ver todos los meses.
              </p>
            </div>
          </div>
        )}

        {newMetricType === "calculated" && (
          <div>
            <Label className="text-xs">Fórmula</Label>

            {(allRawInputKeys.length > 0 || reusableCalcMetrics.length > 0) && (
              <div className="space-y-1.5 mt-1.5">
                {allRawInputKeys.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-tertiary mr-0.5">Campos</span>
                    {allRawInputKeys.map((k) => (
                      <button
                        key={k}
                        type="button"
                        onClick={() => insertAtFormulaCursor(k)}
                        className="text-[11px] font-mono px-1.5 py-0.5 rounded border border-border bg-surface text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
                      >
                        {k}
                      </button>
                    ))}
                  </div>
                )}
                {reusableCalcMetrics.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1">
                    <span className="text-[10px] uppercase tracking-wide text-tertiary mr-0.5">Métricas</span>
                    {reusableCalcMetrics.map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => insertAtFormulaCursor(m.id)}
                        title={m.formula ?? undefined}
                        className="text-[11px] px-1.5 py-0.5 rounded border border-primary/30 bg-primary/5 text-primary hover:border-primary/60 transition-colors"
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            <Textarea
              ref={formulaTextareaRef}
              value={newMetricFormula}
              onChange={(e) => setNewMetricFormula(e.target.value)}
              className="mt-1.5 font-mono text-sm"
              rows={3}
              placeholder='Ej: SUM(revenue, headcount) o revenue / headcount'
            />

            {newMetricFormula.trim() && (
              <div
                aria-live="polite"
                className={cn(
                  "mt-1.5 rounded-md border px-3 py-2 text-xs",
                  formulaPreview.error
                    ? "border-destructive/40 bg-destructive/5 text-destructive"
                    : formulaPreview.value !== null
                      ? "border-success/40 bg-success/5 text-foreground"
                      : "border-border bg-surface text-muted-foreground"
                )}
              >
                {formulaPreview.error ? (
                  <>No se puede calcular: {formulaPreview.error}</>
                ) : formulaPreview.value !== null ? (
                  <>
                    Con los datos del período actual da{" "}
                    <span className="font-medium">
                      {formatMetricValue(formulaPreview.value, newMetricUnit.trim() || null)}
                    </span>
                    .
                  </>
                ) : (
                  <>
                    Todavía no se puede calcular: falta cargar{" "}
                    {formulaPreview.missing
                      .map((k) => reusableCalcMetrics.find((m) => m.id === k)?.name ?? k)
                      .join(", ")}
                    .
                  </>
                )}
              </div>
            )}

            <p className="text-xs text-muted-foreground mt-1.5">
              Funciona como Google Sheets: operadores (<code>+ - * /</code>) y funciones (
              <code>SUM</code>, <code>IF</code>, <code>ROUND</code>, <code>MIN</code>, <code>MAX</code>,{" "}
              <code>AVERAGE</code>, y más). Para promediar o sumar meses anteriores usá{" "}
              <code>SUMLAST("revenue", 3)</code>, <code>AVGLAST("revenue", 3)</code> o{" "}
              <code>YTD("revenue")</code>. El nombre del campo va entre comillas solo en esas tres.
            </p>
          </div>
        )}

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
