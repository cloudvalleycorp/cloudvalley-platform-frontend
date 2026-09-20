import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { readFile } from "./localDocuments";

export function DocumentFile({ id }: { id: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [url, setUrl] = useState("");
  const [preview, setPreview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true; let objectUrl = ""; setLoading(true); setError("");
    readFile(id).then(value => { if (!active) return; if (value) { objectUrl = URL.createObjectURL(value); setFile(value); setUrl(objectUrl); } else { setFile(null); setUrl(""); } }).catch(() => { if (active) setError("No se pudo leer el archivo guardado en este navegador."); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, attempt]);
  if (loading) return <p role="status" className="rd-muted">Preparando archivo…</p>;
  if (error) return <div role="alert"><p>{error}</p><Button variant="outline" onClick={() => setAttempt(n => n + 1)}>Reintentar archivo</Button></div>;
  if (!file) return <p className="rd-muted">Este registro de ejemplo no tiene archivo local. Podés adjuntarlo desde Editar configuración.</p>;
  const canPreview = ["application/pdf", "image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type);
  return <div className="rd-mapped-form"><div className="rd-value-actions"><a className="rd-download-link" href={url} download={file.name}>Descargar {file.name}</a>{canPreview && <Button variant="outline" onClick={() => setPreview(v => !v)}>{preview ? "Cerrar vista previa" : "Ver archivo"}</Button>}</div>{preview && (file.type === "application/pdf" ? <iframe title={`Vista previa de ${file.name}`} src={url} sandbox="" className="rd-file-preview" /> : <img alt={file.name} src={url} className="rd-file-image" />)}</div>;
}
