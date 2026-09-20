import { useState, type FormEvent } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { AssistantEntry } from "./DemoAssistantContext";
import { FormField } from "@/components/FormField";

const key = "cloudvalley-redesign-email";
function read() { try { const value = JSON.parse(localStorage.getItem(key) || "null"); if (value && typeof value.current === "string" && typeof value.pending === "string") return value as { current: string; pending: string }; } catch { /* Initial demo email. */ } return { current: "founder@example.com", pending: "" }; }
export function DemoEmailChange() {
  const [email, setEmail] = useState(read);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const save = (next: typeof email, message: string) => { try { localStorage.setItem(key, JSON.stringify(next)); setEmail(next); setError(""); setNotice(message); window.dispatchEvent(new Event("cloudvalley-demo-team")); return true; } catch { setError("No se pudo guardar el cambio en este navegador."); return false; } };
  const submit = (event: FormEvent) => {
    event.preventDefault(); const next = draft.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(next)) { setError("Ingresá un email válido."); return; }
    if (next === email.current.toLowerCase()) { setError("Ese es tu email actual. Ingresá otro."); return; }
    if (save({ ...email, pending: next }, "Solicitud guardada. Simulá la confirmación para completar el cambio.")) setOpen(false);
  };
  return <div className="rd-mapped-form"><div className="rd-value-actions"><span>Email: <strong>{email.current}</strong></span><Button type="button" variant="outline" onClick={() => { setDraft(""); setError(""); setOpen(true); }}>Cambiar email</Button></div>{email.pending && <div className="rd-mapped-form"><p>Confirmación pendiente para <strong>{email.pending}</strong>. Tu email actual se mantiene hasta confirmar.</p><div className="rd-value-actions"><Button type="button" onClick={() => save({ current: email.pending, pending: "" }, "Email actualizado en la demo.")}>Simular confirmación del email</Button><Button type="button" variant="ghost" onClick={() => save({ ...email, pending: "" }, "Cambio de email cancelado.")}>Cancelar cambio de email</Button></div></div>}{notice && <p role="status" className="rd-muted">{notice}</p>}{error && !open && <p role="alert" className="rd-field-error">{error}</p>}<Dialog open={open} onOpenChange={setOpen}><DialogContent className="rd-root rd-dialog"><DialogTitle>Cambiar email</DialogTitle><DialogDescription>La demo reproduce la confirmación sin enviar mensajes. El email actual se mantiene hasta confirmar el cambio.</DialogDescription><form className="rd-mapped-form" onSubmit={submit}><FormField label="Nuevo email" htmlFor="new-email"><Input id="new-email" type="email" required autoFocus value={draft} onChange={e => { setDraft(e.target.value); setError(""); }} /></FormField>{error && <p role="alert" className="rd-field-error">{error}</p>}<AssistantEntry context={{ area: "settings", draft: { area: "settings", name: "Cambio de email", category: "Email", detail: "", step: 0, fields: { current_email: email.current, new_email: draft } } }} /><Button type="submit">Solicitar cambio en la demo</Button></form></DialogContent></Dialog></div>;
}
