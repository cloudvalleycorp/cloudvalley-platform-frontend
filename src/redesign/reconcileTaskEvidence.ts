import type { RecordItem } from "./model";

// Production resolves either required evidence server-side (see lib/roadmap.ts).
// In the isolated demo the same transition is derived from local records.
export function reconcileTaskEvidence(records: RecordItem[]): RecordItem[] {
  let changed = false;
  const next = records.map(task => {
    if (task.area !== "roadmap" || (!task.fields?.requires_doc && !task.fields?.requires_report)) return task;
    const document = task.fields.requires_doc && records.find(r => r.area === "documents" && r.fields?.task_id === task.id);
    const report = task.fields.requires_report && records.find(r => r.area === "reports" && records.some(fund => fund.area === "connections" && fund.status === "Conectado" && r.fields?.[`share_${fund.id}`]));
    const documentId = document ? document.id : "";
    const reportId = report ? report.id : "";
    const status = document || report ? "Completado" : "Pendiente";
    if (task.status === status && (task.fields.related_document_id || "") === documentId && (task.fields.related_report_id || "") === reportId) return task;
    changed = true;
    return { ...task, status, fields: { ...task.fields, related_document_id: documentId, related_report_id: reportId } };
  });
  return changed ? next : records;
}
