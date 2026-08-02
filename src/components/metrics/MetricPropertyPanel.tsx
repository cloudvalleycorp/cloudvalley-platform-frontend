import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Link2, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { FormField } from "@/components/FormField";
import { FormActions } from "@/components/FormActions";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { PropertyField, type PropertyFieldDef } from "@/components/metrics/PropertyField";
import { FormulaField } from "@/components/metrics/FormulaField";
import {
  type MetricDef,
  type InputsMap,
  type PeriodInputs,
  type ValueType,
  sourceLabel,
  sourceSettingsPath,
} from "@/lib/metrics";
import { handleMembershipError } from "@/lib/membership";
import {
  UPSERT_FINANCIAL_METRIC_DEFINITION_URL,
  DELETE_FINANCIAL_METRIC_DEFINITION_URL,
  type DeleteMetricDefinitionResponse,
} from "@/lib/financialReports";

type Draft = {
  name: string;
  category: string;
  unit: string;
  description: string;
  metric_type: "input" | "calculated";
  input_key: string;
  value_type: ValueType;
  formula: string;
};

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
function slugify(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function emptyDraft(defaultCategory: string): Draft {
  return {
    name: "",
    category: defaultCategory,
    unit: "",
    description: "",
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
    metric_type: m.metric_type,
    input_key: m.input_key ?? "",
    value_type: m.value_type ?? "count",
    formula: m.formula_expression ?? "",
  };
}

type Props = {
  metric: MetricDef | null; // null = creando una nueva
  creating: boolean;
  open: boolean;
  isOwner: boolean;
  companyId: string | null;
  allMetrics: MetricDef[];
  categories: { id: string; label: string }[];
  inputKeySuggestions: string[];
  defaultCategory: string;
  currentInputs: InputsMap;
  formulaHistory: PeriodInputs[];
  privacy: Record<string, boolean>;
  onTogglePrivacy: (metricId: string, next: boolean) => Promise<void>;
  onClose: () => void;
  onSaved: (id: string, isNew: boolean) => void;
  onDeleted: () => void;
};

// El panel lateral estilo AppSheet: secciones agrupadas en un Accordion.
// General/Tipo se arman a partir de un array de PropertyFieldDef (agregar un
// campo ahí no requiere tocar este componente). Fuente de datos/Fórmula/
// Configuración quedan afuera de ese array a propósito — no son "un campo
// más": Fuente de datos es puro estado derivado + link (nunca editable acá,
// ver el plan), Fórmula es el componente FormulaField completo, y
// Configuración persiste por un endpoint aparte (update-metric-privacy, no
// upsert-metric-definition), no por el botón Guardar de este panel.
export function MetricPropertyPanel({
  metric,
  creating,
  open,
  isOwner,
  companyId,
  allMetrics,
  categories,
  inputKeySuggestions,
  defaultCategory,
  currentInputs,
  formulaHistory,
  privacy,
  onTogglePrivacy,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
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

  const readOnly = !isOwner;

  const allInputDefs = useMemo(() => allMetrics.filter((m) => m.metric_type === "input"), [allMetrics]);
  const allCalcDefs = useMemo(() => allMetrics.filter((m) => m.metric_type === "calculated"), [allMetrics]);
  const reusableCalcDefs = useMemo(
    () => allCalcDefs.filter((m) => m.id !== metric?.id),
    [allCalcDefs, metric?.id]
  );

  const setField = (key: string, value: string | boolean) => setDraft((prev) => ({ ...prev, [key]: value }));

  const generalFields: PropertyFieldDef[] = [
    { key: "name", label: "Nombre", type: "text", placeholder: "Ej: Revenue por empleado" },
    {
      key: "category",
      label: "Categoría (tab donde aparece)",
      type: "text",
      placeholder: "Ej: revenue, cash_efficiency, o una nueva como ops",
      helpText: "Si escribís una que no existe todavía, se crea un tab nuevo.",
      datalistOptions: categories.map((c) => c.id),
    },
    { key: "unit", label: "Unidad", type: "text", placeholder: "USD, %, x, meses…" },
    { key: "description", label: "Descripción", type: "textarea", placeholder: "Qué es esta métrica" },
  ];

  const typeFields: PropertyFieldDef[] = [
    {
      key: "metric_type",
      label: "Tipo",
      type: "select",
      options: [
        { value: "calculated", label: "Calculada (fórmula)" },
        { value: "input", label: "Dato crudo existente" },
      ],
    },
    ...(draft.metric_type === "input"
      ? ([
          {
            key: "input_key",
            label: "Campo",
            type: "text",
            placeholder: "Ej: new_customers",
            helpText: "El dato crudo que se carga cada mes. Podés reusar uno existente o escribir uno nuevo.",
            datalistOptions: inputKeySuggestions,
          },
          {
            key: "value_type",
            label: "Tipo de valor",
            type: "select",
            options: [
              { value: "money", label: "Moneda" },
              { value: "count", label: "Entero" },
              { value: "percentage", label: "Porcentaje" },
            ],
            helpText: "Define el formulario de carga que se ve todos los meses.",
          },
        ] as PropertyFieldDef[])
      : []),
  ];

  const syncedFrom = metric ? sourceLabel(metric.source) : null;
  const settingsPath = metric ? sourceSettingsPath(metric.source, metric.source_connection_id) : null;
  const isPublic = metric ? (privacy[metric.id] ?? true) : true;

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copiado");
  };

  const handleSave = async () => {
    if (!companyId) return;
    const category = draft.category.trim();
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

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 text-left">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle>{creating ? "Agregar métrica" : metric?.name}</SheetTitle>
              {metric && (
                <Button variant="ghost" size="sm" onClick={copyLink} aria-label="Copiar link a esta métrica">
                  <Link2 size={13} className="mr-1.5" /> Copiar link
                </Button>
              )}
            </div>
            <SheetDescription>
              {creating
                ? "Se agrega solo para tu startup, no afecta a las demás."
                : readOnly
                  ? "Solo lectura."
                  : "Los cambios aplican solo para tu startup."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6">
            <Accordion type="multiple" defaultValue={["general", "tipo", "fuente", "formula", "config"]}>
              <AccordionItem value="general">
                <AccordionTrigger>General</AccordionTrigger>
                <AccordionContent className="space-y-4">
                  {generalFields.map((f) => (
                    <PropertyField
                      key={f.key}
                      field={f}
                      value={draft[f.key as keyof Draft] as string}
                      onChange={setField}
                      readOnly={readOnly}
                    />
                  ))}
                </AccordionContent>
              </AccordionItem>

              <AccordionItem value="tipo">
                <AccordionTrigger>Tipo</AccordionTrigger>
                <AccordionContent className="space-y-4">
                  {typeFields.map((f) => (
                    <PropertyField
                      key={f.key}
                      field={f}
                      value={draft[f.key as keyof Draft] as string}
                      onChange={setField}
                      readOnly={readOnly}
                    />
                  ))}
                </AccordionContent>
              </AccordionItem>

              {draft.metric_type === "input" && (
                <AccordionItem value="fuente">
                  <AccordionTrigger>Fuente de datos</AccordionTrigger>
                  <AccordionContent>
                    {/* Siempre de solo lectura acá — una integración conecta datos,
                        nunca se configura desde la métrica (ver el plan). */}
                    <FormField label="Origen">
                      {!syncedFrom ? (
                        <p className="text-sm">Se carga a mano.</p>
                      ) : settingsPath ? (
                        <a href={settingsPath} className="text-sm text-primary hover:underline">
                          Se sincroniza desde {syncedFrom} → ver conexión
                        </a>
                      ) : (
                        <p className="text-sm">Se sincroniza desde {syncedFrom}.</p>
                      )}
                    </FormField>
                  </AccordionContent>
                </AccordionItem>
              )}

              {draft.metric_type === "calculated" && (
                <AccordionItem value="formula">
                  <AccordionTrigger>Fórmula</AccordionTrigger>
                  <AccordionContent>
                    {readOnly ? (
                      <pre className="text-sm font-mono bg-surface border border-border rounded-md p-3 whitespace-pre-wrap">
                        {draft.formula || "—"}
                      </pre>
                    ) : (
                      <FormulaField
                        value={draft.formula}
                        onChange={(v) => setField("formula", v)}
                        unit={draft.unit.trim() || null}
                        inputDefs={allInputDefs}
                        calcDefs={reusableCalcDefs}
                        currentInputs={currentInputs}
                        formulaHistory={formulaHistory}
                      />
                    )}
                  </AccordionContent>
                </AccordionItem>
              )}

              {metric && (
                <AccordionItem value="config">
                  <AccordionTrigger>Configuración</AccordionTrigger>
                  <AccordionContent>
                    {readOnly ? (
                      <FormField label="Visible para inversores conectados">
                        <p className="text-sm">{isPublic ? "Sí" : "No"}</p>
                      </FormField>
                    ) : (
                      <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={isPublic}
                          onCheckedChange={(c) => onTogglePrivacy(metric.id, c === true)}
                          className="mt-0.5"
                        />
                        <span>Visible para inversores conectados</span>
                      </label>
                    )}
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          </div>

          {!readOnly && (
            <div className="px-6 py-4 border-t border-border shrink-0">
              <FormActions
                onCancel={onClose}
                onSubmit={handleSave}
                submitLabel={creating ? "Agregar" : "Guardar"}
                busy={saving}
                extra={
                  metric && (
                    <Button
                      variant="ghost"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        setDeleteRecordsToo(false);
                        setConfirmDelete(true);
                      }}
                    >
                      <Trash2 size={13} className="mr-1.5" /> Eliminar
                    </Button>
                  )
                }
              />
            </div>
          )}
        </SheetContent>
      </Sheet>

      <ConfirmationDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`Eliminar ${metric?.name ?? "métrica"}`}
        description={
          <div className="space-y-3">
            <p>
              Se elimina esta métrica para tu startup.{" "}
              {metric?.metric_type === "input"
                ? "Los valores que ya cargaste quedan guardados pero dejan de mostrarse, salvo que elijas borrarlos también abajo."
                : "Como es una métrica calculada, no tiene valores propios que borrar."}
            </p>
            {metric?.metric_type === "input" && (
              <label className="flex items-start gap-2 text-sm cursor-pointer">
                <Checkbox
                  checked={deleteRecordsToo}
                  onCheckedChange={(c) => setDeleteRecordsToo(c === true)}
                  className="mt-0.5"
                />
                <span>Eliminar también los valores ya cargados para este campo. Esta acción no se puede deshacer.</span>
              </label>
            )}
          </div>
        }
        confirmLabel="Eliminar"
        variant="destructive"
        busy={deleting}
        onConfirm={confirmDeleteMetric}
      />
    </>
  );
}
