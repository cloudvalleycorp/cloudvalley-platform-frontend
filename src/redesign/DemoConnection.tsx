import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import type { RecordItem } from "./model";
import { documentAccess } from "./documentAccess";
import { useDemoTeam } from "./demoTeamStore";

export function DemoConnection({ item, records, onChange, onOpen }: { item: RecordItem; records: RecordItem[]; onChange: (items: RecordItem[], selected: RecordItem) => void; onOpen: (item: RecordItem) => void }) {
  const { self } = useDemoTeam();
  const [action, setAction] = useState<"approve" | "reject" | "cancel" | "disconnect" | null>(null);
  const connected = item.status === "Conectado";
  const incoming = item.fields?.direction === "received";
  const resources = records.filter(r => r.area === "documents" ? documentAccess(r, records).some(access => access.fund.id === item.id) : r.area === "reports" && r.fields?.[`share_${item.id}`]);
  const labels = { approve: "Aprobar conexión", reject: "Rechazar solicitud", cancel: "Cancelar solicitud", disconnect: "Eliminar conexión" };
  function decide() {
    if (!action || !self?.owner) return;
    const next = { ...item, status: action === "approve" ? "Conectado" : action === "reject" ? "Rechazada" : action === "cancel" ? "Cancelada" : "Desconectado", value: action === "approve" ? "Acceso habilitado" : "Sin acceso" };
    const updated = records.map(r => {
      if (r.id === item.id) return next;
      if (action !== "disconnect" || !r.fields?.[`share_${item.id}`]) return r;
      const fields = { ...r.fields, [`share_${item.id}`]: false, [`expiry_${item.id}`]: "" };
      const shared = records.some(f => f.area === "connections" && f.id !== item.id && f.status === "Conectado" && fields[`share_${f.id}`]);
      return { ...r, fields, status: fields.is_public ? "Visible para conectados" : shared ? "Compartido" : r.area === "reports" ? "Borrador" : "Privado" };
    });
    onChange(updated, next); setAction(null);
  }
  if (!self?.owner) return <div className="rd-mapped-form"><p className="rd-muted">Solo un owner puede administrar conexiones.</p>{connected && resources.map(r => <Button key={r.id} variant="outline" onClick={() => onOpen(r)}>Abrir {r.area === "reports" ? "reporte" : "documento"}: {r.name}</Button>)}</div>;
  return <div className="rd-mapped-form">
    {connected ? <><h3>Recursos compartidos con {item.name}</h3><p className="rd-muted">También puede consultar las métricas que marcaste como públicas.</p>{resources.length ? resources.map(r => <Button key={r.id} variant="outline" onClick={() => onOpen(r)}>Abrir {r.area === "reports" ? "reporte" : "documento"}: {r.name}</Button>) : <p className="rd-muted">No hay documentos ni reportes compartidos con este fondo.</p>}<Button variant="outline" onClick={() => setAction("disconnect")}>Eliminar conexión</Button></> : item.status === "Pendiente" ? <><p>{incoming ? "Solicitud recibida. Al aprobar, el fondo podrá consultar tus recursos públicos." : "Solicitud enviada. El fondo todavía no tiene acceso a tus recursos."}</p><div className="rd-value-actions">{incoming ? <><Button onClick={() => setAction("approve")}>Aprobar conexión</Button><Button variant="outline" onClick={() => setAction("reject")}>Rechazar solicitud</Button></> : <Button variant="outline" onClick={() => setAction("cancel")}>Cancelar solicitud</Button>}</div></> : <p className="rd-muted">Este fondo no tiene acceso. Para reconectar, creá una nueva solicitud.</p>}
    <ConfirmationDialog open={!!action} onOpenChange={open => !open && setAction(null)} title={action ? labels[action] : ""} confirmLabel={action ? labels[action] : "Confirmar"} variant={action === "disconnect" ? "destructive" : "default"} description={action === "disconnect" ? `${item.name} perderá el acceso a tus recursos. Se quitarán sus permisos individuales; una nueva conexión requerirá volver a compartirlos. Este cambio solo afecta la demo.` : action === "approve" ? `${item.name} podrá consultar los recursos visibles para todos los fondos conectados en la demo.` : "La solicitud quedará cerrada. Podés crear otra desde Nueva solicitud."} onConfirm={decide} />
  </div>;
}
