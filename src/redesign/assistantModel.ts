import { readReportActivity, reportAnalytics } from "./reportActivity";
import { evaluateMetric, metricDisplay } from "./metricEvaluation";
import { documentAccess } from "./documentAccess";
import { validateQuery } from "@/lib/querySpec";
import type { Draft } from "./ProductionForms";
import { meta, type Area, type RecordItem } from "./model";

export type AssistantContext = { area: Area; company: string; record?: RecordItem; draft?: Draft; period?: string; scenario?: string; pendingValue?: string };
export type AssistantAction = { label: string; kind: "open"; id: string } | { label: string; kind: "navigate" | "create"; area: Area; anchor?: string };
export type AssistantProposal = { item: RecordItem; original?: RecordItem; summary: string; state?: "applied" | "discarded" };
export type AssistantAnswer = { text: string; actions: AssistantAction[]; sources: { id: string; name: string }[]; proposal?: AssistantProposal };
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
const open = (r: RecordItem): AssistantAction => ({ kind: "open", id: r.id, label: `Abrir ${r.name}` });
const route = (area: Area, label?: string, anchor?: string): AssistantAction => ({ kind: "navigate", area, label: label || `Ir a ${meta[area].title}`, anchor });
export const assistantSuggestions: Record<Area, string[]> = {
  overview: ["¿Qué necesita mi atención?", "Proponé un reporte con mis métricas"],
  metrics: ["Explicá la métrica abierta", "Proponé una métrica de ingresos"],
  sources: ["¿Cómo reviso el mapeo?", "¿Dónde reconecto mi cuenta?"],
  roadmap: ["¿Qué tareas siguen pendientes?", "¿Cómo completo esta tarea?"],
  reports: ["Revisá el reporte abierto", "Proponé un reporte con mis métricas"],
  documents: ["¿Quién puede ver este documento?", "¿Cómo vinculo un documento a una tarea?"],
  connections: ["¿Qué fondos están conectados?", "¿Cómo cancelo una solicitud?"],
  settings: ["¿Cómo invito a mi equipo?", "¿Dónde gestiono mis integraciones?"],
};
export function contextLabel(context: AssistantContext) { return `${meta[context.area].title}${context.draft ? ` · Borrador: ${context.draft.name || "sin nombre"}` : context.record ? ` · ${context.record.name}` : ""}${context.period ? ` · ${context.period}` : ""}`; }

export function answerDemoQuestion(question: string, context: AssistantContext, records: RecordItem[]): AssistantAnswer {
  const q = normalize(question); const selected = context.record; const area = context.draft?.area || selected?.area || context.area;
  const answer = (text: string, actions: AssistantAction[] = [], rows: RecordItem[] = []): AssistantAnswer => ({ text, actions, sources: rows.map(r => ({ id: r.id, name: r.name })) });
  const matched = records.filter(r => q.includes(normalize(r.name)) || (r.area === "metrics" && ["mrr", "arr", "runway", "nrr"].includes(r.id) && new RegExp(`\\b${r.id}\\b`).test(q)));
  if (/agrega|inclui|incorpora/.test(q) && selected?.area === "reports") {
    const metric = matched.find(r => r.area === "metrics");
    if (!metric) return answer("Indicá qué métrica querés agregar al reporte. Podés usar el nombre que aparece en Métricas.", records.filter(r => r.area === "metrics").slice(0, 4).map(open));
    if (selected.sections?.some(s => s.blocks.some(b => b.metric_id === metric.id))) return answer(`${metric.name} ya está en este reporte. No hace falta duplicarla.`, [open(selected)], [selected, metric]);
    const original = records.find(r => r.id === selected.id);
    const sections = selected.sections?.length ? selected.sections : [{ title: "Resultados", subtitle: null, blocks: [] }];
    return { ...answer(`Preparé la incorporación de ${metric.name} a ${selected.name}. Revisá la propuesta antes de guardarla.`, [], [metric]), proposal: { original, item: { ...selected, sections: sections.map((s, i) => i === 0 ? { ...s, blocks: [...s.blocks, { metric_id: metric.id }] } : s) }, summary: `Agregar ${metric.name} a la primera sección. Conserva el resto del borrador y los destinatarios.` } };
  }
  if (/propon|prepara|crea|arma/.test(q) && /reporte|investor update/.test(q)) {
    const metrics = records.filter(r => r.area === "metrics").slice(0, 4);
    if (!metrics.length) return answer("Primero necesitás una métrica para incluir en el reporte.", [{ kind: "create", area: "metrics", label: "Definir una métrica" }]);
    return { ...answer("Preparé un reporte privado con las métricas disponibles. No incluye conclusiones ni cifras que no estén cargadas.", [], metrics), proposal: { summary: "Crear un reporte privado con una sección de resultados. No se comparte con fondos.", item: { id: crypto.randomUUID(), area: "reports", name: `Update de ${context.company} · ${context.period || "2026-08"}`, category: "Reporte", value: "Privado", status: "Borrador", detail: "", fields: {}, sections: [{ title: "Resultados", subtitle: null, blocks: metrics.map(r => ({ metric_id: r.id })) }] } } };
  }
  if (/propon/.test(q) && /metrica|ingreso/.test(q)) {
    const existing = records.find(r => normalize(r.name) === "ingresos totales");
    if (existing) return answer("Ya existe la métrica Ingresos totales. Podés revisar su definición antes de crear otra.", [open(existing)], [existing]);
    return { ...answer("Esta propuesta suma el campo de ejemplo ingresos en el período consultado. La demo conserva la definición; su resultado depende de los datos de la fuente.", []), proposal: { summary: "Crear Ingresos totales como métrica calculada en USD, privada, sumando el campo ingresos.", item: { id: crypto.randomUUID(), area: "metrics", name: "Ingresos totales", category: "Ingresos", value: "—", status: "Pendiente", detail: "Suma de ingresos del período.", fields: { metric_type: "calculated", value_type: "money", currency: "USD", unit: "USD", is_public: false }, query: { type: "aggregation", aggregation: "sum", field_key: "ingresos", distinct_field_key: null, filters: [] } } } };
  }
  if (context.draft) {
    const draft = context.draft; const fields = draft.fields || {}; const issues: string[] = [];
    if (!draft.name.trim()) issues.push("Falta el nombre.");
    if (draft.area === "metrics") { if (fields.metric_type === "calculated") issues.push(...validateQuery(draft.query || null).map(i => i.message)); else if (!fields.input_key) issues.push("Falta el campo de entrada."); }
    if (draft.area === "documents" && !fields.folder_operation && !fields.file_name) issues.push("Falta seleccionar el archivo.");
    if (draft.area === "sources" && fields.source === "sheet" && !fields.account_id) issues.push("Falta elegir una cuenta de Google conectada.");
    if (draft.area === "settings" && draft.category === "Email") {
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(fields.new_email || ""))) issues.push("Ingresá un email válido.");
      if (fields.new_email === fields.current_email) issues.push("El nuevo email coincide con el actual.");
    }
    if (draft.area === "settings" && draft.category === "Integraciones" && fields.provider !== "google") {
      if (!fields.has_api_key) issues.push("Falta la clave de ejemplo.");
      if (fields.needs_secret && !fields.has_api_secret) issues.push("Este proveedor también requiere la clave secreta de ejemplo.");
    }
    return answer(issues.length ? `Revisé el borrador ${draft.name || "sin nombre"}:\n${issues.map(i => `• ${i}`).join("\n")}\nVolvé al formulario para completarlo. Todavía no se guardó.` : `El borrador ${draft.name} tiene los datos básicos completos. Revisá los campos y el paso de confirmación del formulario antes de guardarlo.`, []);
  }
  if (/integracion|reconect|cuenta|permiso vencido/.test(q) && (area === "sources" || area === "settings")) return answer("Las cuentas se administran en Configuración > Integraciones. Si venció un permiso, reconectá la misma cuenta para conservar los mapeos; después volvé a la fuente.", [route("settings", "Abrir Integraciones", "integrations")]);
  if (matched.length && !selected) return answer(matched.map(r => `${r.name}: ${r.area === "metrics" ? metricDisplay(r, records, context.period, context.scenario) : r.value} · ${r.status}. ${r.detail}`).join("\n\n"), matched.map(open), matched);
  if (area === "metrics" && selected) {
    const period = context.period || "2026-08"; const scenario = context.scenario || "actual";
    const evaluated = evaluateMetric(selected, records, period, scenario);
    const value = metricDisplay(selected, records, period, scenario);
    const origins = evaluated.sources.map(id => records.find(record => record.id === id)).filter((record): record is RecordItem => !!record);
    return answer(`${selected.name}\nPeríodo: ${period} · Escenario: ${scenario === "actual" ? "Real" : scenario === "budget" ? "Presupuesto" : "Forecast"}\nValor guardado: ${value}.${evaluated.reason ? `\n${evaluated.reason}` : ""}${origins.length ? `\nFuentes utilizadas: ${origins.map(origin => origin.name).join(", ")}.` : ""}\n${context.pendingValue !== undefined ? `Edición sin guardar: ${context.pendingValue || "vacío"}.\n` : ""}${selected.detail}\n${selected.fields?.metric_type === "calculated" || ["arr", "runway", "margin"].includes(selected.id) ? "El resultado proviene de una consulta de cálculo; revisá su definición y las fuentes." : "Real, forecast y presupuesto se guardan por separado."}`, [open(selected), ...origins.map(open)], [selected, ...origins]);
  }
  if (area === "reports" && selected && /actividad|lectura|abrio|visto|leyo/.test(q)) {
    const rows = readReportActivity(selected.id); const data = reportAnalytics(selected.id, rows);
    return answer(rows.length ? `Actividad simulada de ${selected.name}: ${data.total_opens} aperturas y ${data.total_active_seconds} segundos activos.\n${data.by_fund.map(fund => `${rows.find(row => row.fundId === fund.fund_id)?.fundName}: ${fund.opens} aperturas, ${fund.active_seconds} segundos, ${fund.max_scroll_pct}% visto.`).join("\n")}\nSon eventos locales de demostración, no lecturas reales.` : `El reporte ${selected.name} todavía no tiene lecturas simuladas. Abrí Actividad de lectura en su detalle para probar una lectura de un fondo con acceso guardado.`, [open(selected)], [selected]);
  }
  if (area === "reports" && selected) return answer(`El reporte ${selected.name} tiene ${selected.sections?.length || 0} secciones y ${selected.sections?.reduce((sum, s) => sum + s.blocks.length, 0) || 0} bloques de métricas. Revisá el período en Vista previa y los destinatarios antes de compartir. Podés pedirme «Agregá MRR» para revisar una propuesta sobre este mismo reporte.`, [], [selected]);
  if (area === "documents") {
    if (/vincul|tarea/.test(q)) return answer("Al agregar o editar un documento, elegí Tarea del Roadmap. Al guardarlo, esa tarea se completa con el archivo vinculado; podés abrir la evidencia desde la tarea.", [{ kind: "create", area: "documents", label: "Agregar documento" }, route("roadmap")]);
    if (selected) { const access = documentAccess(selected, records); const funds = access.map(a => a.fund); return answer(`${selected.name}: ${selected.fields?.is_public ? "visible para todos los fondos conectados, incluidos los que se conecten después" : funds.length ? `compartido con ${funds.map(f => f.name).join(", ")}` : "privado para el equipo"}. Revisá Accesos del documento para cambiar destinatarios o vencimientos.${access.some(a => a.folders.length) ? ` Acceso heredado desde: ${[...new Set(access.flatMap(a => a.folders.map(f => f.name)))].join(", ")}. Para revocarlo, editá los permisos de esas carpetas.` : ""}`, [open(selected)], [selected, ...funds]); }
    return answer("Elegí un documento para revisar sus accesos. Podés navegar carpetas, buscar, descargar archivos y compartirlos con fondos conectados.", [route("documents")]);
  }
  if (area === "roadmap") {
    if (selected) { const evidence = records.filter(r => r.id === selected.fields?.related_document_id || r.id === selected.fields?.related_report_id); return answer(`${selected.name}: ${selected.status}. ${selected.fields?.requires_doc || selected.fields?.requires_report ? "Se completa con la evidencia requerida: documento vinculado o reporte compartido." : "Podés marcarla como completada desde su detalle."}${selected.fields?.how_to_do_it ? `\n${selected.fields.how_to_do_it}` : ""}`, evidence.length ? evidence.map(open) : [open(selected)], [selected, ...evidence]); }
    const tasks = records.filter(r => r.area === "roadmap" && r.status !== "Completado"); return answer(tasks.length ? `${tasks.length} tareas pendientes:\n${tasks.map(t => `• ${t.name} · ${t.value}`).join("\n")}` : "Todas las tareas de la demo están completas.", tasks.slice(0, 4).map(open), tasks);
  }
  if (area === "connections") { const funds = records.filter(r => r.area === "connections" && r.status === "Conectado"); return answer(/cancel/.test(q) ? "Abrí una solicitud enviada y elegí Cancelar solicitud. Solo un owner puede gestionarla; cancelar no concede accesos al fondo." : `${funds.length} fondos conectados: ${funds.map(r => r.name).join(", ") || "ninguno"}. Abrí un fondo para ver sus recursos compartidos.`, (/cancel/.test(q) ? records.filter(r => r.area === "connections" && r.status === "Pendiente" && r.fields?.direction !== "received") : funds).map(open), funds); }
  if (area === "sources" && selected?.sourceRuns?.length) {
    const run = selected.sourceRuns[0];
    return answer(`La última ejecución de ${selected.name} terminó ${run.result.status === "error" ? "con error" : run.result.rows_rejected ? "con filas rechazadas" : "correctamente"}: ${run.result.rows_processed} filas válidas y ${run.result.rows_rejected} rechazadas. Hay ${selected.sourceRows?.length || 0} períodos guardados.\n${run.result.row_errors.map(error => `${error.field}: ${error.reason}`).join("\n")}\nAbrí el detalle para revisar la muestra, el mapeo o el historial.`, [open(selected)], [selected]);
  }
  if (area === "sources") return answer("Revisá la cuenta, la planilla, la hoja y la estructura. Después verificá la columna de período, las claves únicas y el tipo de cada dato. Guardar el mapeo conserva la configuración; no modifica los valores por sí solo.", selected ? [open(selected)] : [route("sources")], selected ? [selected] : []);
  if (area === "settings") return answer("En Equipo, un owner puede invitar por email, aprobar solicitudes y administrar roles. La invitación de la demo no envía correos. En Mi perfil podés cambiar nombre, rol, foto y simular la confirmación de un nuevo email.", [route("settings", "Abrir Configuración")]);
  const pending = records.filter(r => r.status === "Revisar" || r.status === "Pendiente");
  return answer(`En ${context.company} hay ${pending.length} elementos pendientes de revisión. Puedo mostrarte el registro, revisar un borrador o proponer un reporte con las métricas disponibles.`, pending.slice(0, 4).map(open), pending.slice(0, 4));
}
