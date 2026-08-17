import { useEffect, useState } from "react";
import { toast } from "sonner";
import { handleMembershipError } from "@/lib/membership";
import {
  UPSERT_FINANCIAL_METRIC_DEFINITION_URL,
  DELETE_FINANCIAL_METRIC_DEFINITION_URL,
  type DeleteMetricDefinitionResponse,
} from "@/lib/financialReports";
import { validateQuery, findRangeConflicts, type QuerySpec } from "@/lib/querySpec";
import type { MetricDef, ValueType } from "@/lib/metrics";

export type Draft = {
  name: string;
  category: string;
  unit: string;
  description: string;
  why_it_matters: string;
  metric_type: "input" | "calculated";
  input_key: string;
  value_type: ValueType;
  // Reemplaza a formula (texto) — árbol estructurado, ver src/lib/querySpec.ts.
  query: QuerySpec | null;
  // Solo lectura — una métrica vieja que todavía no se editó con el query
  // builder. Nunca se manda de vuelta al guardar; no hay conversión
  // automática a query (mandato de backend, se reconstruye a mano).
  legacyFormulaExpression: string | null;
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

function emptyDraft(defaultCategory: string, prefill?: Partial<Draft>): Draft {
  return {
    name: "",
    category: defaultCategory,
    unit: "",
    description: "",
    why_it_matters: "",
    metric_type: "calculated",
    input_key: "",
    value_type: "count",
    query: null,
    legacyFormulaExpression: null,
    ...prefill,
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
    query: m.query,
    legacyFormulaExpression: m.query ? null : m.formula_expression,
  };
}

type Params = {
  metric: MetricDef | null;
  creating: boolean;
  companyId: string | null;
  allMetrics: MetricDef[];
  categories: { id: string; label: string }[];
  defaultCategory: string;
  onSaved: (id: string, isNew: boolean) => void;
  onDeleted: () => void;
  // Set solo cuando el panel se abrió desde "Crear métrica para cumplir
  // esto" (ver FundRequiredMetricsSection) — precarga el draft con lo que
  // pidió el fondo, y al guardar manda fulfills_requirement_id para crear y
  // vincular en un solo paso (contrato ampliado 2026-08-16).
  fulfillsRequirementId?: string | null;
  prefill?: Partial<Draft>;
};

// Form state and the save/delete mutations for MetricPropertyPanel — split
// out so the component itself stays a plain presentational consumer of
// this hook.
export function useMetricPropertyForm({
  metric,
  creating,
  companyId,
  allMetrics,
  categories,
  defaultCategory,
  onSaved,
  onDeleted,
  fulfillsRequirementId = null,
  prefill,
}: Params) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(defaultCategory, prefill));
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteRecordsToo, setDeleteRecordsToo] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const seedKey = metric?.id ?? (creating ? fulfillsRequirementId ?? "__new__" : null);
  useEffect(() => {
    if (metric) setDraft(draftFromMetric(metric));
    else if (creating) setDraft(emptyDraft(defaultCategory, prefill));
    // metric además de seedKey: seedKey por sí solo (el id) no cambia
    // cuando la MISMA métrica trae datos nuevos por un refetch (ej.
    // financial.reload() tras confirmar una edición vía el Asistente) —
    // sin esto el panel seguía mostrando el valor viejo hasta un reload
    // manual de la página (bug real encontrado en vivo 2026-08-15). metric
    // solo cambia de referencia cuando react-query realmente refetchea, no
    // en cada render, así que esto no pisa cambios sin guardar del usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seedKey, metric]);

  const setField = (key: string, value: string | boolean) => setDraft((prev) => ({ ...prev, [key]: value }));
  const setQuery = (query: QuerySpec | null) => setDraft((prev) => ({ ...prev, query }));

  const handleSave = async () => {
    if (!companyId) return;
    const category = normalizeCategory(draft.category, categories);
    if (!draft.name.trim() || !category) {
      toast.error("Nombre y categoría son obligatorios");
      return;
    }
    if (draft.metric_type === "calculated") {
      const issues = validateQuery(draft.query, { selfMetricId: metric?.id });
      if (issues.length > 0) {
        toast.error(issues[0].message);
        return;
      }
      const conflicts = findRangeConflicts(draft.query);
      if (conflicts.length > 0) {
        toast.error(
          `Filtros incompatibles (${conflicts[0].fields.join(", ")}): Firestore solo permite un campo de rango/desigualdad por consulta.`
        );
        return;
      }
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
      // Antes solo se mandaba para metric_type="input" — una calculada
      // nunca declaraba su value_type, aunque el draft siempre lo trae
      // (default "count"). Confirmado en vivo: el backend SÍ lo valida al
      // vincular con un requisito de fondo ("value_type/periodicity no
      // coinciden"), sin importar el tipo — bug real, no algo a omitir.
      value_type: draft.value_type,
    };
    if (draft.metric_type === "input") {
      body.input_key = inputKeySlug;
    } else {
      body.query = draft.query;
    }
    if (draft.description.trim()) body.description = draft.description.trim();
    if (draft.why_it_matters.trim()) body.why_it_matters = draft.why_it_matters.trim();
    // Solo al crear — editar una métrica ya vinculada no debe re-disparar el
    // link (usaría unlink-metric-from-requirement para eso, ver
    // FundRequiredMetricsSection).
    if (isNew && fulfillsRequirementId) body.fulfills_requirement_id = fulfillsRequirementId;

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
    setQuery,
    saving,
    confirmDelete,
    setConfirmDelete,
    deleteRecordsToo,
    setDeleteRecordsToo,
    deleting,
    handleSave,
    confirmDeleteMetric,
  };
}
