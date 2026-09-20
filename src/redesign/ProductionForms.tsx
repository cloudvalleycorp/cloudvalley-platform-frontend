import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/FormField";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { QueryBuilder } from "@/components/metrics/query-builder/QueryBuilder";
import { QuerySummary } from "@/components/metrics/query-builder/QuerySummary";
import { findRangeConflicts, validateQuery, type QuerySpec } from "@/lib/querySpec";
import type { RawField } from "@/lib/metrics";
import { readFolders, storeFile } from "./localDocuments";
import { sourceRawFields } from "./sourceSimulation";
import { SourceLayoutFields, SourceLayoutSummary } from "./SourceLayoutFields";
import { meta, type Area, type RecordItem } from "./model";
import { readDemoIntegrations, useDemoIntegrations } from "./demoIntegrationStore";

export type Draft = { area: Area; name: string; category: string; detail: string; step: number; fields?: Record<string, string | boolean>; query?: QuerySpec | null; editingId?: string };
type Field = { key: string; label: string; type?: "text" | "date" | "number" | "textarea" | "checkbox" | "select"; options?: [string, string][]; help?: string; required?: boolean };
const metricFields: Field[] = [
  { key: "unit", label: "Unidad", help: "Por ejemplo: USD, %, meses o clientes." },
  { key: "value_type", label: "Tipo de valor", type: "select", options: [["money", "Moneda"], ["count", "Entero"], ["percentage", "Porcentaje"], ["text", "Texto"]] },
  { key: "currency", label: "Moneda", help: "Código de tres letras, por ejemplo USD o ARS. Opcional." },
  { key: "why_it_matters", label: "Por qué importa", type: "textarea" },
  { key: "metric_type", label: "Tipo de métrica", type: "select", options: [["calculated", "Calculada"], ["input", "Dato crudo existente"]] },
  { key: "input_key", label: "Campo de entrada", help: "Reutilizá un campo o escribí una clave, por ejemplo new_customers." },
  { key: "source_role", label: "Rol de la fuente", type: "select", options: [["", "Sin asignar"], ["primary", "Principal"], ["secondary", "Secundaria"], ["derived", "Derivada"], ["reporting", "Reporting"]] },
  { key: "is_public", label: "Visible para inversores conectados", type: "checkbox" },
];
const taskFields: Field[] = [
  { key: "why_it_matters", label: "Por qué importa", type: "textarea" },
  { key: "how_to_do_it", label: "Cómo hacerlo", type: "textarea" },
  { key: "due_date", label: "Vencimiento", type: "date" },
  { key: "criticality", label: "Criticidad", type: "select", options: [["critical", "Crítica"], ["recommended", "Recomendada"], ["optional", "Opcional"]] },
  { key: "requires_doc", label: "Se completa con un documento del Data Room", type: "checkbox" },
  { key: "requires_report", label: "Se completa con un reporte compartido", type: "checkbox" },
];
const sourceFields: Field[] = [
  { key: "account_id", label: "Cuenta de Google", type: "select", options: [["demo-account", "founder@example.com · cuenta de ejemplo"]] },
  { key: "spreadsheet_id", label: "Planilla", type: "select", options: [["demo-finance", "Finanzas 2026 · ejemplo"], ["demo-sales", "Ventas 2026 · ejemplo"]] },
  { key: "sheet_name", label: "Hoja", type: "select", options: [["Ingresos", "Ingresos"], ["Costos", "Costos"]] },
  { key: "period_column", label: "Columna de período", type: "select", options: [["Fecha", "Fecha · columna 1"], ["Mes", "Mes · columna 2"]] },
  { key: "data_role", label: "Uso de los datos", type: "select", options: [["source_of_truth", "Fuente principal"], ["operational_input", "Datos operativos"], ["financial_model", "Modelo financiero"], ["historical_snapshot", "Histórico"], ["report_export", "Reporte exportado"]] },
  { key: "sync_mode", label: "Modo de sincronización", type: "select", options: [["live", "En vivo"], ["scheduled", "Programada"], ["event_based", "Por evento"], ["manual", "Manual"], ["snapshot", "Instantánea"]] },
  { key: "sync_frequency", label: "Frecuencia", type: "select", options: [["every_15_min", "Cada 15 minutos"], ["hourly", "Cada hora"], ["every_6_hours", "Cada 6 horas"], ["daily", "Cada 24 horas"], ["weekly", "Semanal"], ["monthly", "Mensual"], ["daily_fixed_hour", "Diaria a una hora fija"], ["manual", "Manual"]] },
  { key: "sync_hour_utc", label: "Hora de sincronización (UTC, 0–23)", type: "number" },
];
const documentFields: Field[] = [
  { key: "folder_id", label: "Carpeta", type: "select", options: [["fundraising", "Fundraising"], ["finances", "Finanzas"], ["legal", "Legal"]] },
  { key: "is_public", label: "Visible para inversores conectados", type: "checkbox", help: "Desactivado: privado. Esta elección solo se simula en la demo." },
];
const rawFields: RawField[] = ["ingresos", "costos", "clientes"].map((key, i) => ({ field_key: key, value_type: "number", connection_id: "demo-finance", sample_column: ["Ingresos", "Costos", "Clientes"][i], description: "Campo de demostración", connection_label: "Finanzas 2026 · Ingresos" }));
function defaults(area: Area): Record<string, string | boolean> {
  if (area === "metrics") return { metric_type: "calculated", value_type: "count", unit: "", currency: "", input_key: "", source_role: "", is_public: false };
  if (area === "roadmap") return { pillar_id: "finances", criticality: "recommended", requires_doc: false, requires_report: false, due_date: "" };
  if (area === "documents") return { folder_id: "fundraising", task_id: "", is_public: true };
  if (area === "sources") return { source: "sheet", account_id: "demo-account", spreadsheet_id: "demo-finance", sheet_name: "Ingresos", period_column: "Fecha", data_role: "source_of_truth", sync_mode: "manual", sync_frequency: "manual", field_mappings: JSON.stringify([{ column: "Ingresos", column_index: 2, field_key: "ingresos", value_type: "number", description: "" }]) };
  return {};
}
const pillars: [string, string][] = [["finances", "Finanzas"], ["fundraising", "Fundraising"], ["legal", "Legal"], ["product", "Producto"]];
const funds: [string, string][] = [["demo-andes", "Andes Ventures"], ["demo-sur", "Sur Capital"], ["demo-pacific", "Pacific Ventures"]];
function fieldsFor(area: Area, values: Record<string, string | boolean>): Field[] {
  if (area === "metrics") return metricFields.filter(f => (f.key !== "currency" || values.value_type === "money") && (f.key !== "input_key" || values.metric_type === "input"));
  if (area === "roadmap") return taskFields;
  if (area === "documents") return documentFields.map(f => f.key === "folder_id" ? { ...f, options: readFolders().map(row => [row.id, row.name] as [string, string]) } : f);
  if (area === "sources") return sourceFields.filter(f => (f.key !== "period_column" || !values.structure || values.structure === "tabular") && (values.source === "sheet" || !["account_id", "spreadsheet_id", "sync_mode", "sync_frequency", "sync_hour_utc"].includes(f.key)) && (f.key !== "sync_hour_utc" || values.sync_frequency === "daily_fixed_hour"));
  return [];
}
function FormRow({ field, value, onChange, error }: { field: Field; value: string | boolean; onChange: (value: string | boolean) => void; error?: string }) {
  const id = `production-${field.key}`;
  let control: ReactNode;
  const accessible = { id, "aria-invalid": !!error, "aria-describedby": error ? `${id}-error` : field.help ? `${id}-help` : undefined };
  if (field.type === "checkbox") control = <label className="rd-checkbox-row"><input {...accessible} type="checkbox" checked={!!value} onChange={e => onChange(e.target.checked)} /><span>{field.label}</span></label>;
  else if (field.type === "select") control = <select {...accessible} value={String(value ?? "")} onChange={e => onChange(e.target.value)}>{field.options?.map(([v, label]) => <option value={v} key={v}>{label}</option>)}</select>;
  else if (field.type === "textarea") control = <textarea {...accessible} value={String(value ?? "")} onChange={e => onChange(e.target.value)} />;
  else control = <Input {...accessible} type={field.type || "text"} value={String(value ?? "")} onChange={e => onChange(e.target.value)} />;
  return <div className="rd-mapped-field">{field.type !== "checkbox" && <label htmlFor={id}>{field.label}{field.required ? " *" : ""}</label>}{control}{error ? <p className="rd-field-error" role="alert" id={`${id}-error`}>{error}</p> : field.help && <p className="rd-muted" id={`${id}-help`}>{field.help}</p>}</div>;
}
type Mapping = { column: string; column_index: number; field_key: string; value_type: string; description: string };
function mappingRows(fields: Record<string, string | boolean>): Mapping[] { try { const rows = JSON.parse(String(fields.field_mappings || "[]")); return Array.isArray(rows) ? rows : []; } catch { return []; } }
export function RecordFields({ item }: { item: RecordItem }) {
  const fields = item.fields || {};
  const specs = [...fieldsFor(item.area, fields).map(f => f.key === "account_id" ? { ...f, options: readDemoIntegrations().accounts.map(a => [a.id, a.email] as [string, string]) } : f), { key: "pillar_id", label: "Pilar", options: pillars }, { key: "task_name", label: "Tarea vinculada" }, { key: "file_name", label: "Archivo de referencia" }, { key: "message", label: "Mensaje" }, { key: "structure", label: "Estructura", options: [["tabular", "Una fila por período"], ["grid", "Cuadrícula"], ["eav", "Vertical (EAV)"]] }, { key: "period_orientation", label: "Períodos", options: [["columns", "En columnas"], ["rows", "En filas"]] }, { key: "eav_period_column", label: "Columna del período" }, { key: "eav_metric_name_column", label: "Columna de métrica" }, { key: "eav_value_column", label: "Columna de valor" }];
  return <>{item.area === "sources" && <SourceLayoutSummary fields={fields} />}<dl className="rd-review">{specs.filter(f => fields[f.key] !== undefined && fields[f.key] !== "").map(f => <div key={f.key}><dt>{f.label}</dt><dd>{typeof fields[f.key] === "boolean" ? fields[f.key] ? "Sí" : "No" : f.options?.find(([v]) => v === fields[f.key])?.[1] || String(fields[f.key])}</dd></div>)}</dl>{item.query && <QuerySummary query={item.query} rawFields={rawFields} metricOptions={[]} />}{item.area === "sources" && (!fields.structure || fields.structure === "tabular") && mappingRows(fields).map((r, i) => <p key={i} className="rd-muted">{r.column} → {r.field_key} · {r.value_type === "number" ? "Número" : "Texto"}</p>)}</>;
}

export function CreateWizard({ area, draft, editing, records, initialFolderId, close, save, saveDraft, onAsk }: { area: Area; draft: Draft | null; editing?: RecordItem | null; records: RecordItem[]; initialFolderId?: string; close: () => void; save: (r: RecordItem) => void; saveDraft: (d: Draft) => void; onAsk?: (d: Draft) => void }) {
  const navigate = useNavigate();
  const { state: integrations } = useDemoIntegrations();
  const [step, setStep] = useState(Math.min(draft?.step || 0, area === "reports" ? 1 : 2));
  const [name, setName] = useState(draft?.name ?? editing?.name ?? "");
  const [category, setCategory] = useState(draft?.category ?? editing?.category ?? (area === "sources" ? "Google Sheets" : area === "metrics" ? "Ingresos" : "General"));
  const [detail, setDetail] = useState(draft?.detail ?? editing?.detail ?? "");
  const [fields, setFields] = useState<Record<string, string | boolean>>(() => ({ ...defaults(area), ...(area === "sources" ? { account_id: readDemoIntegrations().accounts.find(a => a.connected && !a.reconnect)?.id || "" } : {}), ...(area === "documents" && initialFolderId ? { folder_id: initialFolderId } : {}), ...editing?.fields, ...draft?.fields }));
  const [query, setQuery] = useState<QuerySpec | null>(draft?.query ?? editing?.query ?? null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [file, setFile] = useState<File | null>(null);
  const [committing, setCommitting] = useState(false);
  const set = (key: string, value: string | boolean) => { setFields(current => ({ ...current, [key]: value })); setErrors(current => ({ ...current, [key]: "" })); };
  const steps = area === "reports" ? ["Nombre", "Revisar"] : area === "connections" ? ["Fondo", "Mensaje", "Revisar"] : ["Datos básicos", area === "sources" ? "Mapeo" : "Configuración", "Revisar"];
  const finalStep = steps.length - 1;
  const availableFunds: [string, string][] = editing?.area === "connections" ? [[String(editing.fields?.target_id || editing.id), editing.name], ...funds.filter(([, label]) => label !== editing.name)] : funds;
  const availableRawFields = sourceRawFields(records);
  const taskOptions = records.filter(r => r.area === "roadmap");
  function validate(at: number) {
    const next: Record<string, string> = {};
    if (at === 0 && !name.trim()) next.name = area === "connections" ? "Elegí un fondo para continuar." : "Escribí un nombre para identificar este elemento.";
    if (at === 0 && area === "metrics" && !category.trim()) next.category = "Escribí una categoría.";
    if (at === 0 && area === "connections" && records.some(r => r.area === "connections" && r.name === name && ["Conectado", "Pendiente"].includes(r.status) && r.id !== editing?.id)) next.name = "Ya existe una conexión o solicitud para este fondo.";
    if (at === 1 && area === "metrics") {
      if (fields.metric_type === "input" && !String(fields.input_key || "").trim()) next.input_key = "Indicá el campo que provee el dato.";
      if (fields.metric_type === "calculated") { const issues = validateQuery(query, { selfMetricId: editing?.id }); if (issues.length) next.query = issues.map(x => x.message).join(" "); else if (query && findRangeConflicts(query).length) next.query = "Usá un solo campo de rango por consulta."; }
      if (fields.value_type === "money" && fields.currency && !/^[A-Z]{3}$/.test(String(fields.currency))) next.currency = "Usá tres letras mayúsculas, por ejemplo USD.";
    }
    if (at === 1 && (area === "documents" || (area === "sources" && fields.source === "excel")) && !file && !editing?.fields?.file_name) next.file_name = "Elegí un archivo. Al retomar un borrador tenés que seleccionarlo nuevamente.";
    if (at === 1 && area === "sources") {
      if (fields.source === "sheet" && (integrations.paused || !integrations.accounts.some(a => a.id === fields.account_id && a.connected && !a.reconnect))) next.account_id = integrations.paused ? "Google Sheets está pausado. Revisá Integraciones en Configuración." : "Elegí una cuenta conectada. Podés conectar o recuperar una cuenta desde Configuración > Integraciones.";
      const structure = String(fields.structure || "tabular");
      const rows = structure === "tabular" ? mappingRows(fields) : JSON.parse(String(fields[structure === "grid" ? "concept_axis" : "eav_metric_mapping"] || "[]")).map((r: { field_key?: string; suggested_field_key?: string }, i: number) => ({ field_key: r.field_key || r.suggested_field_key || "", column_index: i }));
      if (structure === "eav" && new Set([fields.eav_period_column, fields.eav_metric_name_column, fields.eav_value_column]).size !== 3) next.field_mappings = "Elegí columnas diferentes para período, métrica y valor.";
      if (!rows.length || rows.some(r => !/^[a-z][a-z0-9_]*$/.test(r.field_key))) next.field_mappings = "Agregá al menos un campo. Usá letras minúsculas, números y guiones bajos.";
      if (new Set(rows.map(r => r.field_key)).size !== rows.length) next.field_mappings = "Cada campo debe tener una clave diferente.";
      if (new Set(rows.map(r => r.column_index)).size !== rows.length) next.field_mappings = "No asignes la misma columna dos veces.";
      if (fields.sync_frequency === "daily_fixed_hour" && (!/^\d+$/.test(String(fields.sync_hour_utc ?? "")) || Number(fields.sync_hour_utc) > 23)) next.sync_hour_utc = "Ingresá una hora entre 0 y 23 UTC.";
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }
  async function commit() {
    for (let i = 0; i < finalStep; i++) if (!validate(i)) { setStep(i); return; }
    setCommitting(true);
    const recordId = editing?.id || crypto.randomUUID();
    if (file && (area === "documents" || area === "sources")) { try { await storeFile(recordId, file); } catch { setErrors({ file_name: "No se pudo guardar el archivo local. Liberá espacio y reintentá." }); setStep(1); setCommitting(false); return; } }
    const mappedFields = { ...fields };
    if (area === "metrics") { if (fields.value_type !== "money") delete mappedFields.currency; if (fields.metric_type !== "input") delete mappedFields.input_key; }
    const label = area === "roadmap" ? pillars.find(([id]) => id === fields.pillar_id)?.[1] || category : area === "documents" ? readFolders().find(f => f.id === fields.folder_id)?.name || category : area === "sources" ? fields.source === "sheet" ? "Google Sheets" : "Excel / CSV" : category;
    const value = area === "documents" && file ? `${Math.max(1, Math.round(file.size / 1024))} KB` : editing?.value ?? (area === "roadmap" ? String(fields.due_date || "Sin fecha") : area === "documents" ? `${Math.max(1, Math.round((file?.size || 0) / 1024))} KB` : area === "reports" ? "Privado" : area === "sources" ? `${mappingRows(fields).length} campos` : area === "connections" ? "Sin acceso" : "—");
    save({ id: recordId, area, name: name.trim(), category: label, detail: area === "connections" ? String(fields.message || "Solicitud sin mensaje") : detail, value: area === "roadmap" ? String(fields.due_date || "Sin fecha") : value, status: area === "documents" ? fields.is_public ? "Visible para conectados" : "Privado" : editing?.status || (area === "reports" ? "Borrador" : area === "sources" ? "Configurada · demo" : "Pendiente"), fields: mappedFields, query: area === "metrics" && fields.metric_type === "calculated" ? query : null, entries: editing?.entries, sections: editing?.sections, sourceRows: editing?.sourceRows, sourceRuns: editing?.sourceRuns });
  }
  const fieldControl = (spec: Field) => <FormRow key={spec.key} field={spec.key === "account_id" ? { ...spec, options: [["", "Elegí una cuenta conectada"], ...integrations.accounts.filter(a => a.connected && !a.reconnect).map(a => [a.id, `${a.email} · cuenta de ejemplo`] as [string, string])] } : spec} value={fields[spec.key] ?? ""} error={errors[spec.key]} onChange={v => set(spec.key, v)} />;
  const fileControl = <FormField label="Archivo *" htmlFor="mapped-file" helpText={area === "documents" ? "El archivo queda en este navegador para previsualizarlo y descargarlo. No se sube a un servidor." : "El original se conserva en este navegador. La importación simulada usa una muestra de ejemplo, no el contenido del archivo."}><Input id="mapped-file" type="file" accept={area === "sources" ? ".xlsx,.csv" : undefined} aria-invalid={!!errors.file_name} aria-describedby={errors.file_name ? "mapped-file-error" : undefined} onChange={e => { const picked = e.target.files?.[0] || null; setFile(picked); set("file_name", picked?.name || ""); }} />{errors.file_name && <p id="mapped-file-error" role="alert" className="rd-field-error">{errors.file_name}</p>}{fields.file_name && <p className="rd-muted">Referencia: {fields.file_name}</p>}</FormField>;
  return <Dialog open onOpenChange={open => !open && !committing && close()}><DialogContent className="rd-root rd-dialog rd-wizard">
    <DialogTitle>{editing ? `Editar ${editing.name}` : meta[area].action}</DialogTitle>
    <DialogDescription>{area === "connections" ? "Solicitud de ejemplo. No se enviará ningún mensaje al fondo." : area === "sources" ? "Configuración de ejemplo. No conecta cuentas ni sincroniza archivos." : "Los cambios se guardan solo en esta demo."}</DialogDescription>
    {onAsk && <Button variant="ghost" onClick={() => onAsk({ area, name, category, detail, fields, query, step, editingId: editing?.id })}>Revisar borrador con el asistente</Button>}
    <ol className="rd-steps">{steps.map((label, i) => <li key={label} className={i === step ? "active" : i < step ? "complete" : ""} aria-current={i === step ? "step" : undefined}><button disabled={i > step || committing} onClick={() => setStep(i)}><span>{i < step ? <Check size={14} /> : i + 1}</span>{label}</button></li>)}</ol>
    <div className="rd-wizard-body rd-mapped-form">
      {step === finalStep ? <><h3>Revisar datos</h3><dl className="rd-review"><div><dt>Nombre</dt><dd>{name}</dd></div>{area !== "reports" && area !== "connections" && <div><dt>{area === "sources" ? "Fuente" : "Categoría"}</dt><dd>{category}</dd></div>}{detail && <div><dt>Descripción</dt><dd>{detail}</dd></div>}</dl><RecordFields item={{ id: "review", area, name, category, detail, value: "", status: "", fields, query: fields.metric_type === "calculated" ? query : null }} /></> : step === 0 ? <>
        {area === "connections" ? <FormRow field={{ key: "name", label: "Fondo", required: true, type: "select", options: [["", "Elegí un fondo"], ...availableFunds] }} value={availableFunds.find(([, label]) => label === name)?.[0] || ""} error={errors.name} onChange={v => { setName(availableFunds.find(([id]) => id === v)?.[1] || ""); set("target_id", v); }} /> : <FormRow field={{ key: "name", label: area === "roadmap" ? "Título" : "Nombre", required: true }} value={name} error={errors.name} onChange={v => { setName(String(v)); setErrors({}); }} />}
        {area === "metrics" && <FormRow field={{ key: "category", label: "Categoría", required: true }} value={category} error={errors.category} onChange={v => setCategory(String(v))} />}
        {area === "roadmap" && fieldControl({ key: "pillar_id", label: "Pilar", type: "select", options: pillars, required: true })}
        {area === "sources" && <FormRow field={{ key: "source", label: "Tipo de fuente", type: "select", options: [["sheet", "Google Sheets"], ["excel", "Excel / CSV"]] }} value={fields.source} onChange={v => { set("source", v); setCategory(v === "sheet" ? "Google Sheets" : "Excel / CSV"); }} />}
        {area === "documents" && <FormRow field={{ key: "task_id", label: "Tarea del Roadmap", type: "select", options: [["", "Sin vincular"], ...taskOptions.map(r => [r.id, r.name] as [string, string])] }} value={fields.task_id} onChange={v => { const task = taskOptions.find(t => t.id === v); setFields(current => ({ ...current, task_id: v, task_name: task?.name || "" })); if (task) setName(task.name); }} />}
        {(area === "metrics" || area === "roadmap") && <FormRow field={{ key: "description", label: "Descripción", type: "textarea" }} value={detail} onChange={v => setDetail(String(v))} />}
      </> : <>
        {(area === "documents" || (area === "sources" && fields.source === "excel")) && fileControl}
        {fieldsFor(area, fields).map(fieldControl)}
        {area === "metrics" && fields.metric_type === "calculated" && <div><h3>Consulta de cálculo</h3><QueryBuilder value={query} onChange={setQuery} rawFields={availableRawFields.length ? availableRawFields : rawFields} metricOptions={records.filter(r => r.area === "metrics" && r.id !== editing?.id).map(r => ({ id: r.id, name: r.name, unit: String(r.fields?.unit || "") }))} />{errors.query && <p role="alert" className="rd-field-error">{errors.query}</p>}</div>}
        {area === "connections" && fieldControl({ key: "message", label: "Mensaje (opcional)", type: "textarea" })}
        {area === "sources" && fields.source === "sheet" && <Button variant="ghost" onClick={() => { saveDraft({ area, name, category, detail, fields, query, step, editingId: editing?.id }); navigate("/redesign/settings#integrations"); }}>Guardar borrador y gestionar cuentas</Button>}
        {area === "sources" && <SourceLayoutFields fields={fields} onChange={setFields} />}
        {area === "sources" && fields.structure && fields.structure !== "tabular" && errors.field_mappings && <p className="rd-field-error" role="alert">{errors.field_mappings}</p>}
        {area === "sources" && (!fields.structure || fields.structure === "tabular") && <div className="rd-mapping"><h3>Columnas a importar</h3><p className="rd-muted">Columnas de una hoja de ejemplo. Indicá qué datos importar y cómo identificarlos.</p>{mappingRows(fields).map((row, i) => <div className="rd-mapping-row" key={i}>{[{ key: "column", label: "Columna", options: [["Ingresos", "Ingresos · columna 3"], ["Costos", "Costos · columna 4"], ["Clientes", "Clientes · columna 5"]] }, { key: "field_key", label: "Clave del campo" }, { key: "value_type", label: "Tipo de dato", options: [["number", "Número"], ["text", "Texto"]] }, { key: "description", label: "Descripción del campo" }].map(spec => <FormRow key={spec.key} field={{ key: `mapping-${i}-${spec.key}`, label: spec.label, type: spec.options ? "select" : "text", options: spec.options as [string, string][] }} value={row[spec.key as keyof Mapping] as string} onChange={v => { const rows = mappingRows(fields); rows[i] = { ...row, [spec.key]: v, ...(spec.key === "column" ? { column_index: ["Ingresos", "Costos", "Clientes"].indexOf(String(v)) + 2 } : {}) }; set("field_mappings", JSON.stringify(rows)); }} />)}<Button variant="ghost" aria-label={`Eliminar campo ${i + 1}`} onClick={() => set("field_mappings", JSON.stringify(mappingRows(fields).filter((_, index) => index !== i)))}><Trash2 size={15} /></Button></div>)}{errors.field_mappings && <p role="alert" className="rd-field-error">{errors.field_mappings}</p>}<Button variant="outline" onClick={() => set("field_mappings", JSON.stringify([...mappingRows(fields), { column: "Costos", column_index: 3, field_key: "", value_type: "number", description: "" }]))}><Plus size={14} />Agregar campo</Button></div>}
      </>}
    </div>
    <div className="rd-wizard-footer"><Button variant="ghost" disabled={committing} onClick={step ? () => setStep(s => s - 1) : close}>{step ? "Atrás" : "Cancelar"}</Button><div><Button variant="outline" disabled={committing || !name.trim()} onClick={() => saveDraft({ area, name, category, detail, step, fields, query, editingId: editing?.id })}>Guardar borrador</Button><Button disabled={committing} onClick={step === finalStep ? commit : () => { if (validate(step)) setStep(s => s + 1); }}>{committing ? "Guardando…" : step === finalStep ? "Guardar en la demo" : "Continuar"}<ArrowRight size={15} /></Button></div></div>
  </DialogContent></Dialog>;
}
