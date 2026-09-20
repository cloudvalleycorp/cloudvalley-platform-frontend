import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import type { DemoFolder } from "./localDocuments";
import type { RecordItem } from "./model";
import { AssistantEntry } from "./DemoAssistantContext";

export function FolderAccess({ folder, records, onSave, close }: { folder: DemoFolder; records: RecordItem[]; onSave: (folder: DemoFolder) => boolean; close: () => void }) {
  const [fields, setFields] = useState<Record<string, string | boolean>>(folder.fields || {});
  const [error, setError] = useState("");
  const connected = records.filter(r => r.area === "connections" && r.status === "Conectado");
  const set = (key: string, value: string | boolean) => { setFields(current => ({ ...current, [key]: value })); setError(""); };
  return <Dialog open onOpenChange={open => !open && close()}><DialogContent className="rd-root rd-dialog"><DialogTitle>Compartir carpeta: {folder.name}</DialogTitle><DialogDescription>Incluye sus documentos y subcarpetas, también los que agregues después. Los permisos individuales de cada documento se conservan.</DialogDescription><div className="rd-mapped-form">{connected.length ? connected.map(fund => <div className="rd-mapped-form" key={fund.id}><label className="rd-checkbox-row"><input type="checkbox" checked={!!fields[`share_${fund.id}`]} onChange={e => set(`share_${fund.id}`, e.target.checked)} />{fund.name}</label>{fields[`share_${fund.id}`] && <div className="rd-mapped-field"><label htmlFor={`folder-expiry-${fund.id}`}>Vencimiento del acceso de {fund.name}</label><Input id={`folder-expiry-${fund.id}`} type="date" value={String(fields[`expiry_${fund.id}`] || "")} onChange={e => set(`expiry_${fund.id}`, e.target.value)} /><small>Vacío: sin vencimiento.</small></div>}</div>) : <p>No hay fondos conectados para compartir esta carpeta.</p>}{error && <p role="alert" className="rd-field-error">{error}</p>}<AssistantEntry context={{ area: "documents", draft: { area: "documents", name: folder.name, category: "Carpeta", detail: "Accesos heredados por documentos y subcarpetas", step: 0, fields: { ...fields, folder_operation: "share", folder_id: folder.id } } }} /><Button onClick={() => { if (connected.some(fund => fields[`share_${fund.id}`] && fields[`expiry_${fund.id}`] && !(new Date(`${fields[`expiry_${fund.id}`]}T23:59:59`).getTime() >= Date.now()))) { setError("Elegí un vencimiento vigente o dejalo vacío."); return; } if (onSave({ ...folder, fields })) close(); else setError("No se pudieron guardar los accesos. Volvé a intentarlo."); }}>Guardar accesos de carpeta</Button></div></DialogContent></Dialog>;
}
