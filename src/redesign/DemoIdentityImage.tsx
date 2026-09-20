import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { readFile, removeFile, storeFile } from "./localDocuments";

const eventName = "cloudvalley-demo-image";
type Kind = "avatar" | "logo";

export function DemoIdentityImage({ kind, fallback, className = "rd-avatar" }: { kind: Kind; fallback: string; className?: string }) {
  const [url, setUrl] = useState("");
  const [revision, setRevision] = useState(0);
  useEffect(() => { const refresh = () => setRevision(n => n + 1); window.addEventListener(eventName, refresh); return () => window.removeEventListener(eventName, refresh); }, []);
  useEffect(() => {
    let active = true; let objectUrl = "";
    readFile(`identity-${kind}`).then(file => { if (!active) return; objectUrl = file ? URL.createObjectURL(file) : ""; setUrl(objectUrl); }).catch(() => { if (active) setUrl(""); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [kind, revision]);
  return <span className={className}>{url ? <img src={url} alt={kind === "avatar" ? "Foto de perfil" : "Logo de la startup"} /> : fallback}</span>;
}

export function DemoImageUpload({ kind, disabled = false }: { kind: Kind; disabled?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const label = kind === "avatar" ? "Foto de perfil" : "Logo de la startup";
  async function select(file?: File) {
    if (!file) return;
    setMessage(""); setError("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type) || file.size > 5 * 1024 * 1024) { setError("Elegí una imagen PNG, JPG o WEBP de hasta 5 MB."); return; }
    setBusy(true);
    try { const bitmap = await createImageBitmap(file); bitmap.close(); await storeFile(`identity-${kind}`, file); window.dispatchEvent(new Event(eventName)); setMessage("Imagen guardada en este navegador."); }
    catch { setError("No se pudo guardar la imagen. Comprobá que el archivo sea válido y volvé a intentarlo."); }
    finally { setBusy(false); }
  }
  return <div className="rd-mapped-form"><div className="rd-value-actions"><DemoIdentityImage kind={kind} fallback={kind === "avatar" ? "FM" : "m"} className="rd-identity-preview" /><div className="rd-mapped-field"><label htmlFor={`image-${kind}`}>{label}</label><Input id={`image-${kind}`} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || disabled} onChange={e => { void select(e.target.files?.[0]); e.target.value = ""; }} /><small>PNG, JPG o WEBP · Hasta 5 MB</small></div></div><Button type="button" variant="ghost" disabled={busy || disabled} onClick={async () => { setBusy(true); setError(""); setMessage(""); try { await removeFile(`identity-${kind}`); window.dispatchEvent(new Event(eventName)); setMessage("Imagen quitada de la demo."); } catch { setError("No se pudo quitar la imagen. Volvé a intentarlo."); } finally { setBusy(false); } }}>Quitar {kind === "avatar" ? "foto" : "logo"}</Button>{busy && <p role="status">Guardando imagen…</p>}{message && <p className="rd-muted" role="status">{message}</p>}{error && <p className="rd-field-error" role="alert">{error}</p>}</div>;
}
