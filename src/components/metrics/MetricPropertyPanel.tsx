import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Link2, Sparkles, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { FormField } from "@/components/FormField";
import { FormActions } from "@/components/FormActions";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Checkbox } from "@/components/ui/checkbox";
import { PropertyField, type PropertyFieldDef } from "@/components/metrics/PropertyField";
import { QueryBuilder } from "@/components/metrics/query-builder/QueryBuilder";
import { PlatformAgentPanel } from "@/components/ai/PlatformAgentPanel";
import { type MetricDef, type RawField, sourceLabel, sourceSettingsPath } from "@/lib/metrics";
import { blankAggregationNode } from "@/lib/querySpec";
import { resolveMetricSources } from "@/lib/metricLineage";
import { cn } from "@/lib/utils";
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
  // Campos crudos de integraciones disponibles, para los pickers del query
  // builder ("Campo" en un nodo de agregación).
  rawFields?: RawField[];
  privacy: Record<string, boolean>;
  onTogglePrivacy: (metricId: string, next: boolean) => Promise<void>;
  onClose: () => void;
  onSaved: (id: string, isNew: boolean) => void;
  onDeleted: () => void;
  // El Asistente puede escribir una métrica server-side (confirm_write) sin
  // pasar por handleSave de este panel — sin esto el catálogo en pantalla
  // queda desactualizado hasta refrescar a mano.
  onAgentWrote?: () => void;
  // "Crear métrica para cumplir esto" (ver FundRequiredMetricsSection): el
  // panel se abre en modo creación con el pedido del fondo ya cargado, y al
  // guardar crea y vincula en un solo paso (fulfills_requirement_id).
  fulfillsRequirementId?: string | null;
  prefill?: Partial<Draft>;
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
  rawFields = [],
  privacy,
  onTogglePrivacy,
  onClose,
  onSaved,
  onDeleted,
  onAgentWrote,
  fulfillsRequirementId = null,
  prefill,
}: Props) {
  const [assistantOpen, setAssistantOpen] = useState(false);

  const {
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
    pendingDuplicate,
    dismissPendingDuplicate,
    confirmCreateDuplicate,
  } = useMetricPropertyForm({
    metric,
    creating,
    companyId,
    allMetrics,
    categories,
    defaultCategory,
    onSaved,
    onDeleted,
    fulfillsRequirementId,
    prefill,
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
  // metric_ref referencia cualquier métrica (input o calculada) por su
  // metric_id — a diferencia del viejo formula_expression, donde un campo
  // input se usaba por su input_key suelto en el texto.
  const metricOptions = useMemo(
    () => [...reusableCalcDefs, ...allInputDefs].map((m) => ({ id: m.id, name: m.name, unit: m.unit })),
    [reusableCalcDefs, allInputDefs]
  );

  // Mismo cálculo que ya usa MetricLineagePanel (solo lectura) — acá también
  // en el panel de edición/creación, para que "combina varias fuentes" sea
  // visible sin tener que salir a otro panel a verlo (ver plan, sección 8/10).
  const currentSources = useMemo(
    () => (draft.query ? resolveMetricSources({ query: draft.query } as MetricDef, allMetrics, rawFields) : []),
    [draft.query, allMetrics, rawFields]
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
        ] as PropertyFieldDef[])
      : []),
    // Antes solo se pedía para "Dato crudo" (define el formulario de carga
    // mensual) — ahora se pide siempre: una calculada también lo necesita
    // para poder vincularse a un requisito de fondo (el backend valida que
    // coincida, ver useMetricPropertyForm.handleSave).
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
      helpText:
        draft.metric_type === "input"
          ? "Define el formulario de carga que se ve todos los meses."
          : "Necesario para que esta métrica pueda vincularse a un requisito de un fondo.",
    },
    // Contrato ampliado 2026-08-30 (Metrics AI-native) — metadata pura, no
    // cambia cómo se evalúa la métrica. currency solo tiene sentido para
    // value_type="money" (backend rechaza mezclar monedas distintas en una
    // misma calculada, ver useMetricPropertyForm.ts).
    ...(draft.value_type === "money"
      ? ([
          {
            key: "currency",
            label: "Moneda",
            type: "text",
            placeholder: "USD, ARS, EUR…",
            helpText: "Código ISO de 3 letras. Dejalo vacío si no aplica.",
          },
        ] as PropertyFieldDef[])
      : []),
  ];

  // Fuera del array genérico de typeFields a propósito: a diferencia de un
  // <select> simple (categoría, moneda), estas opciones son jerga que no se
  // entiende sola por el nombre — cada una necesita su propia descripción
  // visible sin tener que abrir nada (mismo criterio que el resto del
  // rediseño de esta pasada).
  const SOURCE_ROLE_OPTIONS: { value: Draft["source_role"]; label: string; description: string }[] = [
    { value: "", label: "Sin asignar", description: "No hace falta elegir nada si esta es tu única métrica para este concepto." },
    { value: "primary", label: "Primaria (fuente de verdad)", description: "Es la que se va a mostrar en Overview. Elegí esta para tu número más confiable." },
    { value: "secondary", label: "Secundaria", description: "Existe y la podés consultar, pero no se muestra en Overview mientras haya una Primaria." },
    { value: "derived", label: "Derivada", description: "Se calcula a partir de otras métricas tuyas, no a partir de una fuente conectada." },
    { value: "reporting", label: "De reporte", description: "Solo se usa para armar reportes a inversores, no aparece en el día a día de Overview." },
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
              <div className="flex items-center gap-1">
                <Button variant="ghost" size="sm" onClick={() => setAssistantOpen(true)}>
                  <Sparkles size={13} className="mr-1.5" aria-hidden="true" /> Asistente
                </Button>
                {metric && (
                  <Button variant="ghost" size="sm" onClick={copyLink} aria-label="Copiar link a esta métrica">
                    <Link2 size={13} className="mr-1.5" aria-hidden="true" /> Copiar link
                  </Button>
                )}
              </div>
            </div>
            <SheetDescription>
              {fulfillsRequirementId
                ? "Al guardar, esta métrica queda vinculada automáticamente al pedido del fondo — el fondo solo va a ver el valor, nunca esta fórmula."
                : creating
                  ? "Se agrega solo para tu startup, no afecta a las demás."
                  : "Los cambios aplican solo para tu startup."}
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
                  <div>
                    <p className="text-sm font-medium mb-1">Rol de esta métrica</p>
                    <p className="text-xs text-muted-foreground mb-2">
                      Usalo solo si tenés más de una métrica midiendo lo mismo y no coinciden. Si es tu única métrica
                      de este tipo, dejalo en "Sin asignar".
                    </p>
                    <div className="space-y-1.5">
                      {SOURCE_ROLE_OPTIONS.map((opt) => (
                        <button
                          type="button"
                          key={opt.value || "none"}
                          onClick={() => setField("source_role", opt.value)}
                          className={cn(
                            "w-full flex items-start gap-2.5 text-left border rounded-md px-3 py-2 transition-colors",
                            draft.source_role === opt.value ? "border-primary ring-1 ring-primary bg-primary/5" : "border-border hover:border-muted-foreground"
                          )}
                        >
                          <span
                            className={cn(
                              "mt-0.5 shrink-0 w-3.5 h-3.5 rounded-full border flex items-center justify-center",
                              draft.source_role === opt.value ? "border-primary" : "border-muted-foreground"
                            )}
                          >
                            {draft.source_role === opt.value && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                          </span>
                          <span>
                            <span className="block text-sm font-medium">{opt.label}</span>
                            <span className="block text-xs text-muted-foreground mt-0.5">{opt.description}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
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
                  <AccordionTrigger>Consulta</AccordionTrigger>
                  <AccordionContent>
                    {draft.query && (
                      <div className="mb-4 rounded-md border border-border bg-surface p-3">
                        <p className="text-xs font-medium mb-1">
                          {currentSources.length === 0
                            ? "Esta métrica todavía no combina ninguna fuente."
                            : currentSources.length === 1
                              ? "Esta métrica combina valores de:"
                              : `Esta métrica combina valores de ${currentSources.length} fuentes:`}
                        </p>
                        {currentSources.length > 0 && (
                          <ul className="space-y-0.5">
                            {currentSources.map((s) => (
                              <li key={s.connectionId} className="text-xs text-muted-foreground">
                                {s.connectionLabel}
                              </li>
                            ))}
                          </ul>
                        )}
                        <p className="text-[11px] text-tertiary mt-1.5">
                          Para sumar otra fuente más, usá "Combinar con…" abajo — cada una se suma tal cual, nunca en
                          silencio.
                        </p>
                      </div>
                    )}
                    {!draft.query && draft.legacyFormulaExpression ? (
                      <div className="space-y-3">
                        <div className="rounded-md border border-border bg-surface p-3">
                          <p className="text-xs text-muted-foreground mb-1">
                            Fórmula anterior, de solo lectura: ya no se puede seguir editando en este formato.
                          </p>
                          <code className="block font-mono text-xs break-all">{draft.legacyFormulaExpression}</code>
                        </div>
                        <Button type="button" variant="outline" size="sm" onClick={() => setQuery(blankAggregationNode())}>
                          Editar con el nuevo builder
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          No se convierte automáticamente: hay que reconstruirla desde cero.
                        </p>
                      </div>
                    ) : (
                      <QueryBuilder value={draft.query} onChange={setQuery} rawFields={rawFields} metricOptions={metricOptions} />
                    )}
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

      <ConfirmationDialog
        open={!!pendingDuplicate}
        onOpenChange={(o) => !o && dismissPendingDuplicate()}
        title="Ya existe una métrica parecida"
        description={
          pendingDuplicate && (
            <div className="space-y-2">
              <p>{pendingDuplicate.message}</p>
              <a
                href={`/metrics/${pendingDuplicate.existingMetricId}`}
                className="text-sm text-primary hover:underline inline-block"
              >
                Ver la métrica existente
              </a>
            </div>
          )
        }
        confirmLabel="Crear de todas formas"
        busy={saving}
        onConfirm={confirmCreateDuplicate}
      />

      <PlatformAgentPanel
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        companyId={companyId}
        surface="metric_property_panel"
        uiContext={{
          selectedMetricId: metric?.id ?? null,
          selectedCategoryId: draft.category || null,
          selectedReportId: null,
          currentPeriodId: null,
        }}
        metricFields={{
          metric_id: metric?.id,
          name: draft.name,
          category: draft.category,
          metric_type: draft.metric_type,
          input_key: draft.input_key,
          value_type: draft.value_type,
          ...(draft.query ? { query: draft.query } : {}),
          unit: draft.unit,
          description: draft.description,
          why_it_matters: draft.why_it_matters,
        }}
        onAgentWrote={onAgentWrote}
      />
    </>
  );
}
