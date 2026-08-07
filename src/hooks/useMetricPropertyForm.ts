import { useEffect, useState } from "react";
import { toast } from "sonner";
import { handleMembershipError } from "@/lib/membership";
import { toPeriodString } from "@/lib/metricPeriod";
import { useRawFieldValues } from "@/hooks/useRawFieldValues";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import {
  UPSERT_FINANCIAL_METRIC_DEFINITION_URL,
  DELETE_FINANCIAL_METRIC_DEFINITION_URL,
  type DeleteMetricDefinitionResponse,
} from "@/lib/financialReports";
import type { MetricDef, PeriodInputs, ValueType } from "@/lib/metrics";

export type Draft = {
  name: string;
  category: string;
  unit: string;
  description: string;
  why_it_matters: string;
  metric_type: "input" | "calculated";
  input_key: string;
  value_type: ValueType;
  formula: string;
};

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
export function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

// Trims/collapses whitespace like `name`, and folds onto an existing
// category's casing when it matches case-insensitively — otherwise "Ops",
// "ops ", and "ops" would silently fork into three separate tabs.
export function normalizeCategory(raw: string, existing: { id: string }[]): string {
  const cleaned = raw.trim().replace(/\s+/g, " ");
  const match = existing.find((c) => c.id.toLowerCase() === cleaned.toLowerCase());
  return match ? match.id : cleaned;
}

function emptyDraft(defaultCategory: string): Draft {
  return {
    name: "",
    category: defaultCategory,
    unit: "",
    description: "",
    why_it_matters: "",
    metric_type: "calculated",
    input_key: "",
    value_type: "count",
    formula: "",
  };
}

function draftFromMetric(m: MetricDef): Draft {
  return {
    name: m.name,
    category: m.category,
    unit: m.unit ?? "",
    description: m.description ?? "",
    why_it_matters: m.why_it_matters ?? "",
    metric_type: m.metric_type,
    input_key: m.input_key ?? "",
    value_type: m.value_type ?? "count",
    formula: m.formula_expression ?? "",
  };
}

type Params = {
  metric: MetricDef | null;
  creating: boolean;
  companyId: string | null;
  allMetrics: MetricDef[];
  categories: { id: string; label: string }[];
  defaultCategory: string;
  formulaHistory: PeriodInputs[];
  onSaved: (id: string, isNew: boolean) => void;
  onDeleted: () => void;
};

// Form state, draft-formula live-preview data, and the save/delete mutations
// for MetricPropertyPanel — split out so the component itself stays a plain
// presentational consumer of this hook.
export function useMetricPropertyForm({
  metric,
  creating,
  companyId,
  allMetrics,
  categories,
  defaultCategory,
  formulaHistory,
  onSaved,
  onDeleted,
}: Params) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(defaultCategory));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteRecordsToo, setDeleteRecordsToo] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const seedKey = metric?.id ?? (creating ? "__new__" : null);
  useEffect(() => {
    if (metric) setDraft(draftFromMetric(metric));
    else if (creating) setDraft(emptyDraft(defaultCategory));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey]);

  // El período actual es siempre el último de formulaHistory (ver Metrics.tsx:
  // "chronological, ending at the current period"). Se resuelve acá, sobre
  // draft.formula (lo que se está tipeando, guardado o no), en vez de
  // reusar los valores ya resueltos a nivel página (esos solo cubren
  // fórmulas YA guardadas) — así la preview de un FIELDSUM/FIELDCOUNT recién
  // escrito calcula sin tener que guardar primero.
  const currentPeriod =
    formulaHistory.length > 0
      ? toPeriodString(formulaHistory[formulaHistory.length - 1].month, formulaHistory[formulaHistory.length - 1].year)
      : null;
  // Debounced so a formula preview doesn't fire a network request on every
  // keystroke — FormulaField's own live preview (client-side, cheap) still
  // updates instantly off draft.formula directly.
  const debouncedFormula = useDebouncedValue(draft.formula, 400);
  const { valuesByPeriod: draftRawFieldValuesByPeriod, loading: draftRawFieldValuesLoading } = useRawFieldValues(
    companyId,
    currentPeriod ? [currentPeriod] : [],
    [debouncedFormula]
  );
  const draftRawFieldValues = currentPeriod ? draftRawFieldValuesByPeriod[currentPeriod] ?? {} : {};

  const setField = (key: string, value: string | boolean) => setDraft((prev) => ({ ...prev, [key]: value }));

  // POST /generate-formula pre-llena el formulario ENTERO cuando se está
  // creando una métrica desde cero (ver FormulaField.tsx modo simple) — se
  // aplica sin chequear "si ya estaba lleno" a propósito: es exactamente lo
  // que ese botón promete (arrancar de una descripción, no de un formulario
  // vacío), y category puede venir como una sugerencia nueva que el usuario
  // ve y edita después, no algo para preservar a medias. No toca `formula`:
  // eso ya lo aplica FormulaField vía onChange (mismo camino que "solo
  // regenerar la fórmula" en una métrica existente).
  const applyGeneratedDraft = (extras: { name: string; category: string; description: string; why_it_matters: string; unit: string }) => {
    setDraft((prev) => ({ ...prev, ...extras }));
  };

  const handleSave = async () => {
    if (!companyId) return;
    const category = normalizeCategory(draft.category, categories);
    if (!draft.name.trim() || !category) {
      toast.error("Nombre y categoría son obligatorios");
      return;
    }
    if (draft.metric_type === "calculated" && !draft.formula.trim()) {
      toast.error("La fórmula es obligatoria para una métrica calculada");
      return;
    }
    const inputKeySlug = slugify(draft.input_key);
    if (draft.metric_type === "input" && !inputKeySlug) {
      toast.error("El campo es obligatorio para un dato crudo");
      return;
    }

    let slug: string;
    let displayOrder: number;
    let isNew: boolean;
    if (metric) {
      slug = metric.id;
      displayOrder = metric.order_index;
      isNew = false;
    } else {
      const existingIds = new Set(allMetrics.map((m) => m.id));
      const base = slugify(draft.name);
      slug = base;
      let suffix = 2;
      while (existingIds.has(slug)) {
        slug = `${base}_${suffix}`;
        suffix++;
      }
      displayOrder = Math.max(0, ...allMetrics.filter((m) => m.category === category).map((m) => m.order_index)) + 1;
      isNew = true;
    }

    const body: Record<string, unknown> = {
      company_id: companyId,
      metric_id: slug,
      name: draft.name.trim(),
      category,
      metric_type: draft.metric_type,
      unit: draft.unit.trim() || null,
      display_order: displayOrder,
    };
    if (draft.metric_type === "input") {
      body.input_key = inputKeySlug;
      body.value_type = draft.value_type;
    } else {
      body.formula_expression = draft.formula.trim();
    }
    if (draft.description.trim()) body.description = draft.description.trim();
    if (draft.why_it_matters.trim()) body.why_it_matters = draft.why_it_matters.trim();

    setSaving(true);
    try {
      const res = await fetch(UPSERT_FINANCIAL_METRIC_DEFINITION_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (await handleMembershipError(res)) return;
      toast.success(isNew ? "Métrica agregada" : "Métrica actualizada");
      onSaved(slug, isNew);
    } catch {
      toast.error(isNew ? "No se pudo agregar la métrica" : "No se pudo actualizar la métrica");
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteMetric = async () => {
    if (!companyId || !metric) return;
    setDeleting(true);
    try {
      const res = await fetch(DELETE_FINANCIAL_METRIC_DEFINITION_URL, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          metric_id: metric.id,
          delete_records: metric.metric_type === "input" ? deleteRecordsToo : false,
        }),
      });
      if (res.status === 404) {
        toast.error(
          "Esta métrica es parte del catálogo default y todavía no tiene una versión propia de tu startup, no se puede eliminar. Podés editarla si querés cambiarla."
        );
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
      setConfirmDelete(false);
      onDeleted();
    } catch {
      toast.error("No se pudo eliminar la métrica");
    } finally {
      setDeleting(false);
    }
  };

  return {
    draft,
    setField,
    applyGeneratedDraft,
    saving,
    confirmDelete,
    setConfirmDelete,
    deleteRecordsToo,
    setDeleteRecordsToo,
    deleting,
    handleSave,
    confirmDeleteMetric,
    draftRawFieldValues,
    draftRawFieldValuesLoading,
  };
}
