import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { documentAccess } from "./documentAccess";
import type { RecordItem } from "./model";

export function ResourceAccess({ item, records, onSave }: { item: RecordItem; records: RecordItem[]; onSave: (item: RecordItem) => void }) {
  const [fields, setFields] = useState<Record<string, string | boolean>>(() => ({ ...(item.id === "doc2" ? { share_fund1: true } : {}), ...item.fields }));
  const [error, setError] = useState("");
  const connected = records.filter(r => r.area === "connections" && r.status === "Conectado");
  const set = (key: string, value: string | boolean) => { setFields(current => ({ ...current, [key]: value })); setError(""); };
  const inherited = documentAccess(item, records).filter(access => access.folders.length);
  return <div className="rd-mapped-form"><h3>Accesos del documento</h3>
    {inherited.map(access => <p className="rd-info-note" key={access.fund.id}>{access.fund.name} tiene acceso por la carpeta {access.folders.map(f => f.name).join(", ")}. Para revocarlo, cambiá los permisos de esa carpeta o mové el documento.</p>)}
    <label className="rd-checkbox-row"><input type="checkbox" checked={!!fields.is_public} onChange={e => set("is_public", e.target.checked)} /><span>Todos los fondos conectados</span></label>
    {fields.is_public && <p className="rd-info-note">Incluye también a los fondos que se conecten después. Revocar un acceso individual no bloquea este acceso general.</p>}
    {connected.map(fund => <div key={fund.id} className="rd-mapped-form"><label className="rd-checkbox-row"><input type="checkbox" checked={!!fields[`share_${fund.id}`]} onChange={e => set(`share_${fund.id}`, e.target.checked)} /><span>{fund.name}</span></label>{fields[`share_${fund.id}`] && <div className="rd-mapped-field"><label htmlFor={`expiry-${fund.id}`}>Vencimiento del acceso de {fund.name}</label><Input id={`expiry-${fund.id}`} type="date" value={String(fields[`expiry_${fund.id}`] || "")} onChange={e => set(`expiry_${fund.id}`, e.target.value)} /><p className="rd-muted">Vacío: sin vencimiento.</p></div>}</div>)}
    {!connected.length && <p className="rd-muted">No hay fondos conectados para compartir este documento.</p>}
    {error && <p className="rd-field-error" role="alert">{error}</p>}
    <Button onClick={() => { const invalid = connected.some(fund => fields[`share_${fund.id}`] && fields[`expiry_${fund.id}`] && new Date(`${fields[`expiry_${fund.id}`]}T23:59:59`).getTime() < Date.now()); if (invalid) { setError("Elegí un vencimiento vigente o dejalo vacío."); return; } const shared = connected.filter(fund => fields[`share_${fund.id}`]); onSave({ ...item, fields, status: fields.is_public ? "Visible para conectados" : shared.length ? "Compartido" : "Privado" }); }}>Guardar accesos en la demo</Button>
  </div>;
}
