import { useMemo } from "react";
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
  type RawField,
  sourceLabel,
  sourceSettingsPath,
} from "@/lib/metrics";
import { useMetricPropertyForm, type Draft } from "@/hooks/useMetricPropertyForm";

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
  // Campos crudos de integraciones disponibles, para el autocomplete de
  // FormulaField ("Campos crudos" en el picker) — ver useRawFieldValues.
  // Los VALORES resueltos (para la preview en vivo) el panel los pide él
  // mismo más abajo, a partir de la fórmula que se está tipeando ahora
  // mismo (draft.formula), no de las fórmulas ya guardadas — si no, la
  // preview de un FIELDSUM/FIELDCOUNT recién escrito siempre da "sin datos"
  // hasta guardar y volver a abrir el panel.
  rawFields?: RawField[];
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
// Form state, draft-formula preview data, and save/delete mutations all live
// in useMetricPropertyForm — this component only renders.
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
  rawFields = [],
  privacy,
  onTogglePrivacy,
  onClose,
  onSaved,
  onDeleted,
}: Props) {
  const {
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
  } = useMetricPropertyForm({
    metric,
    creating,
    companyId,
    allMetrics,
    categories,
    defaultCategory,
    formulaHistory,
    onSaved,
    onDeleted,
  });

  // Crear/editar/eliminar métricas es para todo el equipo (cualquiera que
  // llega a esta pantalla ya es miembro de la startup) — solo la visibilidad
  // ante inversores (Configuración, más abajo) queda exclusiva de owners,
  // ver conversación sobre SEC-1.
  const allInputDefs = useMemo(() => allMetrics.filter((m) => m.metric_type === "input"), [allMetrics]);
  const allCalcDefs = useMemo(() => allMetrics.filter((m) => m.metric_type === "calculated"), [allMetrics]);
  const reusableCalcDefs = useMemo(
    () => allCalcDefs.filter((m) => m.id !== metric?.id),
    [allCalcDefs, metric?.id]
  );

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
    { key: "why_it_matters", label: "Por qué importa", type: "textarea", placeholder: "Opcional: por qué vale la pena mirar esta métrica" },
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
              { value: "text", label: "Texto" },
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

  return (
    <>
      <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
        <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col gap-0">
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border shrink-0 text-left">
            <div className="flex items-center justify-between gap-2">
              <SheetTitle>{creating ? "Agregar métrica" : metric?.name}</SheetTitle>
              {metric && (
                <Button variant="ghost" size="sm" onClick={copyLink} aria-label="Copiar link a esta métrica">
                  <Link2 size={13} className="mr-1.5" aria-hidden="true" /> Copiar link
                </Button>
              )}
            </div>
            <SheetDescription>
              {creating ? "Se agrega solo para tu startup, no afecta a las demás." : "Los cambios aplican solo para tu startup."}
            </SheetDescription>
          </SheetHeader>

          <div className="flex-1 overflow-y-auto px-6">
            <Accordion type="multiple" defaultValue={["general"]}>
              <AccordionItem value="general">
                <AccordionTrigger>General</AccordionTrigger>
                <AccordionContent className="space-y-4">
                  {generalFields.map((f) => (
                    <PropertyField
                      key={f.key}
                      field={f}
                      value={draft[f.key as keyof Draft] as string}
                      onChange={setField}
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
                        <>
                          <p className="text-sm">Se carga a mano.</p>
                          <p className="text-xs text-muted-foreground mt-1.5">
                            No se puede reasignar esta carga a una integración desde acá. Para traer este dato
                            automáticamente: cambiá el Tipo (arriba) a "Calculada" y escribí una fórmula que use{" "}
                            <code className="font-mono">FIELDSUM</code>/<code className="font-mono">FIELDCOUNT</code>{" "}
                            sobre un campo ya mapeado en{" "}
                            <a href="/growth-tracker/sheets" className="text-primary hover:underline">
                              Integraciones → Google Sheets
                            </a>
                            .
                          </p>
                        </>
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
                    <FormulaField
                      value={draft.formula}
                      onChange={(v) => setField("formula", v)}
                      unit={draft.unit.trim() || null}
                      inputDefs={allInputDefs}
                      calcDefs={reusableCalcDefs}
                      currentInputs={currentInputs}
                      formulaHistory={formulaHistory}
                      rawFields={rawFields}
                      rawFieldValues={draftRawFieldValues}
                      rawFieldValuesLoading={draftRawFieldValuesLoading}
                      companyId={companyId}
                      onGenerated={creating ? applyGeneratedDraft : undefined}
                    />
                  </AccordionContent>
                </AccordionItem>
              )}

              {metric && (
                <AccordionItem value="config">
                  <AccordionTrigger>Configuración</AccordionTrigger>
                  <AccordionContent>
                    {isOwner ? (
                      <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <Checkbox
                          checked={isPublic}
                          onCheckedChange={(c) => onTogglePrivacy(metric.id, c === true)}
                          className="mt-0.5"
                        />
                        <span>Visible para inversores conectados</span>
                      </label>
                    ) : (
                      <FormField label="Visible para inversores conectados">
                        <p className="text-sm">{isPublic ? "Sí" : "No"}</p>
                        <p className="text-xs text-muted-foreground mt-1">Solo un owner puede cambiar esto.</p>
                      </FormField>
                    )}
                  </AccordionContent>
                </AccordionItem>
              )}
            </Accordion>
          </div>

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
                    <Trash2 size={13} className="mr-1.5" aria-hidden="true" /> Eliminar
                  </Button>
                )
              }
            />
          </div>
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
