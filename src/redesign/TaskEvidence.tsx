import { Button } from "@/components/ui/button";
import type { Area, RecordItem } from "./model";

export function TaskEvidence({ task, records, open, navigate }: { task: RecordItem; records: RecordItem[]; open: (item: RecordItem) => void; navigate: (area: Area) => void }) {
  const evidence = records.filter(r => r.id === task.fields?.related_document_id || r.id === task.fields?.related_report_id);
  return <div className="rd-mapped-form"><p className="rd-info-note">{evidence.length ? "Tarea completada con la evidencia vinculada." : task.fields?.requires_doc && task.fields?.requires_report ? "Vinculá un documento o compartí un reporte para completar esta tarea." : task.fields?.requires_doc ? "Agregá un documento y elegí esta tarea en el campo Tarea del Roadmap." : "Compartí un reporte con un fondo conectado para completar esta tarea."}</p>{evidence.map(r => <Button key={r.id} variant="outline" onClick={() => open(r)}>Abrir evidencia: {r.name}</Button>)}{!evidence.length && <div className="rd-value-actions">{task.fields?.requires_doc && <Button variant="outline" onClick={() => navigate("documents")}>Ver Data Room</Button>}{task.fields?.requires_report && <Button variant="outline" onClick={() => navigate("reports")}>Ver reportes</Button>}</div>}</div>;
}
