import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { AssistantEntry } from "./DemoAssistantContext";
import { SectionCard } from "@/components/SectionCard";
import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { useDemoIntegrations, type DemoProvider } from "./demoIntegrationStore";

const providers: { id: DemoProvider; name: string; keyLabel: string; secret?: string }[] = [{ id: "stripe", name: "Stripe", keyLabel: "Restricted API key" }, { id: "mercury", name: "Mercury", keyLabel: "API token" }, { id: "amplitude", name: "Amplitude", keyLabel: "API Key", secret: "Secret Key" }];
export function DemoIntegrations() {
  const { state, save, error: storageError } = useDemoIntegrations();
  const navigate = useNavigate();
  const [dialog, setDialog] = useState<DemoProvider | "google" | null>(null);
  const [key, setKey] = useState("");
  const [secret, setSecret] = useState("");
  const [google, setGoogle] = useState("founder@example.com");
  const [disconnect, setDisconnect] = useState<{ id: string; google: boolean; name: string } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [outcome, setOutcome] = useState<Partial<Record<DemoProvider, string>>>({});
  const config = providers.find(p => p.id === dialog);
  const open = (provider: typeof dialog) => { setDialog(provider); setKey(""); setSecret(""); setError(""); };
  function connect(event: FormEvent) {
    event.preventDefault();
    if (dialog === "google") {
      const existing = state.accounts.find(a => a.email === google);
      const account = { id: existing?.id || crypto.randomUUID(), email: google, connected: true, reconnect: false };
      if (save({ ...state, accounts: existing ? state.accounts.map(a => a.id === account.id ? account : a) : [...state.accounts, account] })) { setNotice("Cuenta de ejemplo conectada. Ya podés seleccionarla al mapear una hoja."); setDialog(null); }
      return;
    }
    if (!config) return;
    if (!key.trim() || (config.secret && !secret.trim())) { setError("Completá las credenciales de ejemplo."); return; }
    if (save({ ...state, providers: { ...state.providers, [config.id]: { status: "connected", syncedAt: new Date().toISOString(), error: "" } } })) { setKey(""); setSecret(""); setDialog(null); setNotice(`${config.name} conectado en la demo. Las credenciales ingresadas no se guardan.`); }
  }
  function sync(id: DemoProvider) {
    const fail = outcome[id] === "error";
    if (save({ ...state, providers: { ...state.providers, [id]: { status: fail ? "error" : "connected", syncedAt: fail ? state.providers[id]?.syncedAt || "" : new Date().toISOString(), error: fail ? "La credencial de ejemplo fue rechazada. Revisá la conexión y reintentá." : "" } } })) setNotice(fail ? "La sincronización simulada falló. Los datos anteriores se conservaron." : "Sincronización de ejemplo terminada. Este proveedor todavía no actualiza las métricas del módulo financiero.");
  }
  return <SectionCard title="Integraciones"><div className="rd-mapped-form">
    <div className="rd-integration-card"><h3>Google Sheets</h3>{state.paused ? <p className="rd-info-note">Fuente pausada por el administrador. Las cuentas siguen vinculadas, pero la sincronización está deshabilitada.</p> : <>{state.accounts.filter(a => a.connected).map(account => <div className="rd-team-row" key={account.id}><span>{account.email}<small>{account.reconnect ? "Requiere reconexión" : "Conectada · demo"}</small></span><div className="rd-value-actions">{account.reconnect && <Button variant="outline" onClick={() => { setGoogle(account.email); open("google"); }}>Reconectar {account.email}</Button>}<Button variant="ghost" onClick={() => setDisconnect({ id: account.id, google: true, name: account.email })}>Desconectar {account.email}</Button></div></div>)}<Button variant="outline" onClick={() => open("google")}>Conectar cuenta de Google</Button></>}
    <Button variant="ghost" onClick={() => navigate("/redesign/sources")}>Gestionar hojas y mapeos</Button><details><summary>Probar estados de Google Sheets</summary><label className="rd-checkbox-row"><input type="checkbox" checked={state.paused} onChange={e => save({ ...state, paused: e.target.checked })} />Simular pausa del administrador</label>{state.accounts.filter(a => a.connected).map(account => <Button key={account.id} variant="outline" onClick={() => save({ ...state, accounts: state.accounts.map(a => a.id === account.id ? { ...a, reconnect: true } : a) })}>Simular permiso vencido: {account.email}</Button>)}</details></div>
    {providers.map(provider => { const item = state.providers[provider.id]; const connected = item && item.status !== "disconnected"; return <div className="rd-integration-card rd-mapped-form" key={provider.id}><h3>{provider.name}</h3><p className="rd-muted">{connected ? item.status === "error" ? "Error de sincronización" : "Conectado · demo" : "Sin conectar"}. Esta integración aún no actualiza las métricas del módulo financiero en producción.</p>{item?.syncedAt && <p className="rd-muted">Última ejecución de ejemplo: {new Date(item.syncedAt).toLocaleString("es-AR")}</p>}{item?.error && <p role="alert" className="rd-field-error">{item.error}</p>}<div className="rd-value-actions">{!connected ? <Button variant="outline" onClick={() => open(provider.id)}>Conectar {provider.name}</Button> : <><Button variant="outline" onClick={() => sync(provider.id)}>{item.status === "error" ? "Reintentar" : "Sincronizar"} {provider.name}</Button><Button variant="ghost" onClick={() => setDisconnect({ id: provider.id, google: false, name: provider.name })}>Desconectar {provider.name}</Button></>}</div>{connected && <details><summary>Probar resultado de {provider.name}</summary><FormField label={`Resultado simulado de ${provider.name}`} htmlFor={`outcome-${provider.id}`}><select id={`outcome-${provider.id}`} value={outcome[provider.id] || "success"} onChange={e => setOutcome(current => ({ ...current, [provider.id]: e.target.value }))}><option value="success">Éxito</option><option value="error">Credencial rechazada</option></select></FormField></details>}</div>; })}
    {notice && <p role="status" className="rd-muted">{notice}</p>}{storageError && <p role="alert" className="rd-field-error">{storageError}</p>}
    <Dialog open={!!dialog} onOpenChange={value => { if (!value) { setDialog(null); setKey(""); setSecret(""); } }}><DialogContent className="rd-root rd-dialog"><DialogTitle>{dialog === "google" ? "Conectar cuenta de Google" : `Conectar ${config?.name}`}</DialogTitle><DialogDescription>{dialog === "google" ? "Elegí una cuenta de ejemplo. La autorización se simula dentro de la demo." : "Usá valores de ejemplo. Los campos reproducen producción, pero no se envían ni se guardan las credenciales."}</DialogDescription><form className="rd-mapped-form" onSubmit={connect}>{dialog === "google" ? <FormField label="Cuenta de ejemplo" htmlFor="google-account"><select id="google-account" value={google} onChange={e => setGoogle(e.target.value)}>{["founder@example.com", "finanzas@example.com", "operaciones@example.com"].map(email => <option key={email} value={email}>{email}</option>)}</select></FormField> : <><FormField label={config?.keyLabel || "API key"} htmlFor="integration-key"><Input id="integration-key" type="password" autoComplete="off" value={key} onChange={e => setKey(e.target.value)} /></FormField>{config?.secret && <FormField label={config.secret} htmlFor="integration-secret"><Input id="integration-secret" type="password" autoComplete="off" value={secret} onChange={e => setSecret(e.target.value)} /></FormField>}<Button type="button" variant="ghost" onClick={() => { setKey("demo-key"); setSecret("demo-secret"); }}>Usar credenciales de ejemplo</Button></>}{error && <p role="alert" className="rd-field-error">{error}</p>}<AssistantEntry context={{ area: "settings", draft: { area: "settings", name: dialog === "google" ? "Google Sheets" : config?.name || "", category: "Integraciones", detail: "", step: 0, fields: { provider: dialog || "", account: google, has_api_key: !!key.trim(), has_api_secret: !!secret.trim(), needs_secret: !!config?.secret } } }} /><Button type="submit">{dialog === "google" ? "Simular autorización" : "Conectar en la demo"}</Button></form></DialogContent></Dialog>
    <ConfirmationDialog open={!!disconnect} onOpenChange={open => !open && setDisconnect(null)} title={`Desconectar ${disconnect?.name || ""}`} description={disconnect?.google ? "Las hojas conservan su mapeo y sus datos. Necesitarás reconectar esta cuenta para volver a sincronizarlas." : "Se desconecta el proveedor en la demo. Los datos anteriores se conservan."} confirmLabel="Desconectar" onConfirm={() => { if (!disconnect) return; const next = disconnect.google ? { ...state, accounts: state.accounts.map(a => a.id === disconnect.id ? { ...a, connected: false } : a) } : { ...state, providers: { ...state.providers, [disconnect.id]: { ...state.providers[disconnect.id as DemoProvider], status: "disconnected" as const, error: "", syncedAt: state.providers[disconnect.id as DemoProvider]?.syncedAt || "" } } }; if (save(next)) { setDisconnect(null); setNotice("Desconectado en la demo."); } }} />
  </div></SectionCard>;
}
