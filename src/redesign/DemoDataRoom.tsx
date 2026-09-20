import { useState } from "react";
import { ChevronRight, Folder, FolderPlus, MoreHorizontal, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssistantEntry } from "./DemoAssistantContext";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/FormField";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { folderKey, readFolders, removeFile, type DemoFolder } from "./localDocuments";
import { FolderAccess } from "./FolderAccess";
import { folderOf, documentAccessLabel } from "./documentAccess";
import type { RecordItem } from "./model";


export function DemoDataRoom({ records, current, setCurrent, open, create, updateRecords, notice }: { records: RecordItem[]; current: string; setCurrent: (id: string) => void; open: (item: RecordItem) => void; create: () => void; updateRecords: (items: RecordItem[]) => void; notice: (text: string) => void }) {
  const [folders, setFolders] = useState(readFolders);
  const [sharing, setSharing] = useState<DemoFolder | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");
  const [edit, setEdit] = useState<{ kind: "folder" | "document"; id?: string; mode: "name" | "move" } | null>(null);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState<RecordItem | DemoFolder | null>(null);
  const documents = records.filter(r => r.area === "documents");
  const path: DemoFolder[] = []; let cursor = current; const visited = new Set<string>();
  while (cursor && !visited.has(cursor)) { visited.add(cursor); const found = folders.find(f => f.id === cursor); if (!found) break; path.unshift(found); cursor = found.parentId || ""; }
  const descendants = (id: string) => { const found = new Set([id]); let size = 0; while (size !== found.size) { size = found.size; folders.forEach(f => { if (f.parentId && found.has(f.parentId)) found.add(f.id); }); } return found; };
  const setCatalog = (next: DemoFolder[]) => { try { localStorage.setItem(folderKey, JSON.stringify(next)); setFolders(next); return true; } catch { setError("No se pudo guardar la carpeta. Volvé a intentarlo."); return false; } };
  const configure = (kind: "folder" | "document", mode: "name" | "move", id?: string) => { const item = kind === "folder" ? folders.find(f => f.id === id) : documents.find(d => d.id === id); setName(item?.name || ""); setTarget(kind === "folder" ? (item as DemoFolder)?.parentId || "" : item ? folderOf(item as RecordItem) : current); setError(""); setEdit({ kind, mode, id }); };
  const save = () => {
    if (!edit) return;
    if (edit.mode === "name" && !name.trim()) { setError("Escribí un nombre."); return; }
    if (edit.kind === "folder") {
      if (edit.mode === "move" && edit.id && descendants(edit.id).has(target)) { setError("No podés mover una carpeta dentro de sí misma."); return; }
      const existing = folders.find(f => f.id === edit.id);
      const parentId = edit.mode === "move" ? target || null : existing ? existing.parentId : (current || null);
      const nextName = edit.mode === "name" ? name.trim() : existing?.name || "";
      if (folders.some(f => f.id !== edit.id && f.parentId === parentId && f.name.toLocaleLowerCase() === nextName.toLocaleLowerCase())) { setError("Ya existe una carpeta con ese nombre en este destino."); return; }
      const next = { ...existing, id: edit.id || crypto.randomUUID(), name: nextName, parentId };
      if (!setCatalog(existing ? folders.map(f => f.id === edit.id ? next : f) : [...folders, next])) return;
    } else {
      updateRecords(records.map(r => r.id !== edit.id ? r : edit.mode === "name" ? { ...r, name: name.trim() } : { ...r, category: folders.find(f => f.id === target)?.name || "Sin carpeta", fields: { ...r.fields, folder_id: target } }));
    }
    setEdit(null); notice("Cambios guardados en la demo.");
  };
  const visibleFolders = folders.filter(f => query ? f.name.toLocaleLowerCase().includes(query.toLocaleLowerCase()) : (f.parentId || "") === current);
  const visibleDocs = documents.filter(d => (!query ? folderOf(d) === current : `${d.name} ${d.category}`.toLocaleLowerCase().includes(query.toLocaleLowerCase())) && (filter === "all" || (filter === "private" ? documentAccessLabel(d, records, folders) === "Privado" : documentAccessLabel(d, records, folders) !== "Privado")));
  const menu = (kind: "folder" | "document", id: string, label: string) => <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Acciones de ${label}`}><MoreHorizontal size={17} /></Button></DropdownMenuTrigger><DropdownMenuContent>{kind === "folder" && <DropdownMenuItem onSelect={() => setSharing(folders.find(f => f.id === id) || null)}>Compartir carpeta</DropdownMenuItem>}<DropdownMenuItem onSelect={() => configure(kind, "name", id)}>Renombrar</DropdownMenuItem><DropdownMenuItem onSelect={() => configure(kind, "move", id)}>Mover</DropdownMenuItem><DropdownMenuItem onSelect={() => { const item = kind === "folder" ? folders.find(f => f.id === id) : documents.find(d => d.id === id); if (item) setDeleting(item); }}>Eliminar</DropdownMenuItem></DropdownMenuContent></DropdownMenu>;
  return <div className="rd-mapped-form">
    <div className="rd-value-actions"><nav aria-label="Carpetas" className="rd-folder-breadcrumb"><button onClick={() => setCurrent("")}>Data Room</button>{path.map(f => <span key={f.id}><ChevronRight size={14} /><button onClick={() => setCurrent(f.id)} aria-current={current === f.id ? "page" : undefined}>{f.name}</button></span>)}</nav><Button variant="outline" onClick={() => configure("folder", "name")}><FolderPlus size={16} />Nueva carpeta</Button></div>
    <div className="rd-toolbar"><div className="rd-search-field"><Search size={16} /><Input aria-label="Buscar documentos y carpetas" placeholder="Buscar documentos y carpetas" value={query} onChange={e => setQuery(e.target.value)} /></div><select aria-label="Filtrar acceso" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Todos los accesos</option><option value="private">Privados</option><option value="shared">Compartidos</option></select></div>
    <div className="rd-folder-grid">{visibleFolders.map(f => <div key={f.id} className="rd-folder-card"><button onClick={() => { setCurrent(f.id); setQuery(""); }}><Folder size={22} /><span>{f.name}<small>{documents.filter(d => descendants(f.id).has(folderOf(d))).length} documentos</small></span></button>{menu("folder", f.id, f.name)}</div>)}</div>
    <div className="rd-collection">{visibleDocs.map(d => <div className="rd-document-row" key={d.id}><button onClick={() => open(d)} aria-label={`Ver detalle: ${d.name}`}><strong>{d.name}</strong><small>{d.category} · {d.value} · {documentAccessLabel(d, records, folders)}</small></button>{menu("document", d.id, d.name)}</div>)}</div>
    {!visibleFolders.length && !visibleDocs.length && <EmptyState title={query ? "Sin coincidencias" : "Esta carpeta está vacía"} action={{ label: query ? "Limpiar búsqueda" : "Agregar documento", onClick: query ? () => setQuery("") : create }} />}
    {sharing && <FolderAccess folder={sharing} records={records} close={() => setSharing(null)} onSave={folder => { const saved = setCatalog(folders.map(f => f.id === folder.id ? folder : f)); if (saved) { updateRecords([...records]); notice("Accesos de carpeta guardados en la demo."); } return saved; }} />}
    <Dialog open={!!edit} onOpenChange={v => !v && setEdit(null)}><DialogContent className="rd-root rd-dialog"><DialogTitle>{edit?.mode === "move" ? "Mover a otra carpeta" : edit?.id ? "Renombrar" : "Nueva carpeta"}</DialogTitle><DialogDescription>{edit?.mode === "move" ? "Conserva sus permisos individuales y hereda los accesos de la carpeta de destino." : "El nombre cambia solo en la demo."}</DialogDescription>{edit?.mode === "move" ? <FormField label="Destino" htmlFor="move-destination"><select id="move-destination" value={target} onChange={e => setTarget(e.target.value)}><option value="">Data Room</option>{folders.filter(f => edit.kind !== "folder" || !edit.id || !descendants(edit.id).has(f.id)).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}</select></FormField> : <FormField label="Nombre" htmlFor="folder-name"><Input autoFocus id="folder-name" value={name} onChange={e => setName(e.target.value)} /></FormField>}{error && <p className="rd-field-error" role="alert">{error}</p>}<AssistantEntry context={{ area: "documents", draft: { area: "documents", name, category: edit?.kind === "folder" ? "Carpeta" : "Documento", detail: edit?.mode || "", step: 0, fields: { folder_operation: edit?.mode || "", folder_id: target } } }} /><Button onClick={save}>{edit?.mode === "move" ? "Mover" : "Guardar"}</Button></DialogContent></Dialog>
    <ConfirmationDialog open={!!deleting} onOpenChange={v => !v && setDeleting(null)} title={`Eliminar ${deleting?.name || ""}`} description={deleting && "area" in deleting ? "Se eliminará este documento y su archivo local de la demo." : "Solo se puede eliminar una carpeta vacía. Mové primero sus documentos y subcarpetas."} confirmLabel="Eliminar" onConfirm={async () => { if (!deleting) return; if ("area" in deleting) { try { await removeFile(deleting.id); updateRecords(records.filter(r => r.id !== deleting.id)); } catch { notice("No se pudo eliminar el archivo local. Reintentá."); return; } } else { if (folders.some(f => f.parentId === deleting.id) || documents.some(d => folderOf(d) === deleting.id)) { notice("La carpeta tiene contenido. Movelo antes de eliminarla."); setDeleting(null); return; } if (!setCatalog(folders.filter(f => f.id !== deleting.id))) return; } setDeleting(null); notice("Eliminado de la demo."); }} />
  </div>;
}
