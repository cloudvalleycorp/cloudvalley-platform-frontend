import { useEffect, useState } from "react";
import { Upload, Link2, ChevronDown, Plus, RefreshCw, FileText, ExternalLink, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useStartup } from "@/hooks/useStartup";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PrivacyToggle } from "@/components/privacy/PrivacyToggle";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { calculateReadinessScore } from "@/lib/score";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

const categories = [
  { id: "corporate", label: "Corporate" },
  { id: "equity_cap_table", label: "Cap Table & Equity" },
  { id: "ip_legal", label: "IP & Legal" },
  { id: "financials", label: "Financials" },
  { id: "contracts_hr", label: "Contracts & HR" },
  { id: "pitch", label: "Pitch" },
];

// Map data room category -> roadmap pillar names that belong to it
const categoryToPillars: Record<string, string[]> = {
  corporate: ["Estructura Corporativa"],
  equity_cap_table: ["Cap Table & Equity"],
  ip_legal: ["IP & Legal"],
  financials: ["Financials"],
  contracts_hr: ["Data Room"],
  pitch: ["Pitch & Narrativa"],
};

type Doc = {
  id: string;
  name: string;
  category: string;
  status: string;
  is_critical: boolean;
  file_url: string | null;
  task_id: string | null;
};

type RoadmapTask = {
  id: string;
  title: string;
  pillar_name: string;
  done: boolean;
  startup_task_id: string;
};

export default function DataRoom() {
  const { startup } = useStartup();
  const [docs, setDocs] = useState<Doc[]>([]);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newTaskId, setNewTaskId] = useState<string>("none");
  const [privacy, setPrivacy] = useState<Record<string, boolean>>({}); // doc_id -> is_public
  const [tasks, setTasks] = useState<RoadmapTask[]>([]);
  const [uploading, setUploading] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<Doc | null>(null);

  const load = async () => {
    if (!startup) return;
    // TODO: migrar a backend propio
    const { data } = await supabase.from("documents").select("*").eq("startup_id", startup.id);
    setDocs((data ?? []) as Doc[]);
    const { data: priv } = await supabase
      .from("document_privacy")
      .select("document_id, is_public")
      .eq("startup_id", startup.id);
    const map: Record<string, boolean> = {};
    for (const p of priv ?? []) map[p.document_id] = p.is_public;
    setPrivacy(map);

    const { data: st } = await supabase
      .from("startup_tasks")
      .select("id, status, task_id, roadmap_tasks(id, title, requires_doc, pillar_id, roadmap_pillars(name))")
      .eq("startup_id", startup.id);
    const t: RoadmapTask[] = (st ?? [])
      .filter((r: any) => r.roadmap_tasks?.requires_doc)
      .map((r: any) => ({
        id: r.roadmap_tasks.id,
        title: r.roadmap_tasks.title,
        pillar_name: r.roadmap_tasks.roadmap_pillars?.name ?? "",
        done: r.status === "done",
        startup_task_id: r.id,
      }));
    setTasks(t);
  };

  useEffect(() => { load(); }, [startup?.id]);

  const togglePrivacy = async (docId: string, next: boolean) => {
    if (!startup) return;
    setPrivacy((p) => ({ ...p, [docId]: next }));
    const { error } = await supabase
      .from("document_privacy")
      .upsert(
        { startup_id: startup.id, document_id: docId, is_public: next },
        { onConflict: "startup_id,document_id" }
      );
    if (error) {
      toast.error("No se pudo actualizar la privacidad");
      setPrivacy((p) => ({ ...p, [docId]: !next }));
    }
  };

  const addAndUpload = async (cat: string, file: File) => {
    if (!startup) return;
    const taskId = newTaskId !== "none" ? newTaskId : null;
    const selected = taskId ? tasks.find((t) => t.id === taskId) : null;
    const name = selected ? selected.title : (newName || file.name);
    setUploading(true);
    const { data: inserted, error: insErr } = await supabase
      .from("documents")
      .insert({
        startup_id: startup.id,
        category: cat as any,
        name,
        status: "missing",
        task_id: taskId,
      })
      .select()
      .single();
    if (insErr || !inserted) {
      setUploading(false);
      toast.error(insErr?.message ?? "No se pudo crear el documento");
      return;
    }
    await handleUpload(inserted as Doc, file);
    setNewName(""); setNewTaskId("none"); setAdding(null); setUploading(false);
  };

  const handleUpload = async (doc: Doc, file: File) => {
    if (!startup) return;
    const path = `${startup.id}/${doc.category}/${doc.id}-${file.name}`;
    const { error } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    // TODO: migrar a backend propio
    await supabase.from("documents").update({
      file_url: path, status: "uploaded", uploaded_at: new Date().toISOString(),
    }).eq("id", doc.id);

    if (doc.task_id) {
      const t = tasks.find((x) => x.id === doc.task_id);
      if (t) {
        // TODO: migrar a backend propio
        await supabase.from("startup_tasks").update({
          status: "done",
          doc_url: path,
          completed_at: new Date().toISOString(),
        }).eq("id", t.startup_task_id);
        await calculateReadinessScore(startup.id);
      }
    }
    toast.success("Documento cargado");
    load();
  };

  const openDoc = async (doc: Doc) => {
    if (!doc.file_url) return;
    const { data, error } = await supabase.storage
      .from("documents")
      .createSignedUrl(doc.file_url, 60 * 60);
    if (error || !data) { toast.error("No se pudo abrir el archivo"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const assignTask = async (doc: Doc, taskId: string) => {
    const tid = taskId === "none" ? null : taskId;
    // TODO: migrar a backend propio
    await supabase.from("documents").update({ task_id: tid }).eq("id", doc.id);
    if (tid && doc.status !== "missing" && doc.file_url && startup) {
      const t = tasks.find((x) => x.id === tid);
      if (t) {
        // TODO: migrar a backend propio
        await supabase.from("startup_tasks").update({
          status: "done",
          doc_url: doc.file_url,
          completed_at: new Date().toISOString(),
        }).eq("id", t.startup_task_id);
        await calculateReadinessScore(startup.id);
      }
    }
    load();
  };

  const deleteDoc = async (doc: Doc) => {
    if (!startup) return;
    setDeletingDoc(null);
    if (doc.file_url) {
      await supabase.storage.from("documents").remove([doc.file_url]);
    }
    // TODO: migrar a backend propio
    await supabase.from("documents").delete().eq("id", doc.id);
    if (doc.task_id) {
      const t = tasks.find((x) => x.id === doc.task_id);
      if (t) {
        // TODO: migrar a backend propio
        await supabase.from("startup_tasks").update({
          status: "pending",
          doc_url: null,
          completed_at: null,
        }).eq("id", t.startup_task_id);
        await calculateReadinessScore(startup.id);
      }
    }
    toast.success("Documento eliminado");
    load();
  };

  const totalUploaded = docs.filter((d) => d.status !== "missing").length;

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copiado");
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-8 py-12">
        <header className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-medium tracking-tight">Data Room</h1>
            <p className="text-sm text-muted-foreground mt-2">{totalUploaded} de {docs.length} documentos cargados</p>
          </div>
          <Button variant="outline" onClick={copyLink}>
            <Link2 size={14} strokeWidth={1.5} className="mr-2" /> Compartir link
          </Button>
        </header>

        <div className="space-y-4">
          {categories.map((cat) => {
            const items = docs.filter((d) => d.category === cat.id);
            const uploaded = items.filter((d) => d.status !== "missing").length;
            const isCollapsed = collapsed.has(cat.id);
            return (
              <section key={cat.id} className="border border-border rounded-lg bg-card">
                <button
                  className="w-full px-6 py-4 flex items-center justify-between"
                  onClick={() => {
                    const next = new Set(collapsed);
                    next.has(cat.id) ? next.delete(cat.id) : next.add(cat.id);
                    setCollapsed(next);
                  }}
                >
                  <div className="text-left">
                    <h2 className="text-base font-medium">{cat.label}</h2>
                    <p className="text-xs text-muted-foreground mt-0.5">{uploaded}/{items.length} cargados</p>
                  </div>
                  <ChevronDown size={16} strokeWidth={1.5} className={cn("text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
                </button>

                {!isCollapsed && (
                  <div className="border-t border-border">
                    {items.map((d) => (
                      <div key={d.id} className="flex items-center gap-3 px-6 py-3 border-b border-border/50 last:border-0">
                        <div className={cn(
                          "h-2 w-2 rounded-full",
                          d.status === "verified" ? "bg-foreground" :
                          d.status === "uploaded" ? "bg-muted-foreground" : "bg-tertiary"
                        )} />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">{d.name}</div>
                          {d.task_id && (
                            <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
                              <FileText size={10} strokeWidth={1.5} />
                              Roadmap: {tasks.find((t) => t.id === d.task_id)?.title ?? "—"}
                            </div>
                          )}
                        </div>
                        <span className="text-xs text-tertiary capitalize">{d.status}</span>
                        {d.file_url && (
                          <button
                            onClick={() => openDoc(d)}
                            className="text-muted-foreground hover:text-foreground transition-all"
                            title="Abrir"
                          >
                            <ExternalLink size={14} strokeWidth={1.5} />
                          </button>
                        )}
                        <Select
                          value={d.task_id ?? "none"}
                          onValueChange={(v) => assignTask(d, v)}
                        >
                          <SelectTrigger className="h-7 w-[160px] text-xs">
                            <SelectValue placeholder="Vincular a roadmap" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin vincular</SelectItem>
                            {tasks.map((t) => (
                              <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <label
                          className="cursor-pointer text-muted-foreground hover:text-foreground transition-all"
                          title={d.status === "missing" ? "Subir documento" : "Reemplazar documento"}
                        >
                          {d.status === "missing"
                            ? <Upload size={14} strokeWidth={1.5} />
                            : <RefreshCw size={14} strokeWidth={1.5} />}
                          <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(d, e.target.files[0])} />
                        </label>
                        <button
                          onClick={() => setDeletingDoc(d)}
                          className="text-muted-foreground hover:text-destructive transition-all"
                          title="Eliminar documento"
                        >
                          <Trash2 size={14} strokeWidth={1.5} />
                        </button>
                        <PrivacyToggle
                          isPublic={privacy[d.id] ?? true}
                          onChange={(next) => togglePrivacy(d.id, next)}
                          publicLabel="Visible para tu organización"
                          privateLabel="Privado · solo vos"
                        />
                      </div>
                    ))}

                    {adding === cat.id ? (
                      (() => {
                        const allowedPillars = categoryToPillars[cat.id] ?? [];
                        const catTasks = tasks.filter((t) => allowedPillars.includes(t.pillar_name));
                        const isOther = newTaskId === "none";
                        return (
                          <div className="flex flex-col gap-2 px-6 py-3 border-t border-border/50">
                            <div className="flex items-center gap-2">
                              <Select
                                value={newTaskId}
                                onValueChange={(v) => {
                                  setNewTaskId(v);
                                  const t = tasks.find((x) => x.id === v);
                                  setNewName(t ? t.title : "");
                                }}
                              >
                                <SelectTrigger className="w-[280px] h-9">
                                  <SelectValue placeholder="Elegí qué documento estás cargando" />
                                </SelectTrigger>
                                <SelectContent>
                                  {catTasks.map((t) => (
                                    <SelectItem key={t.id} value={t.id}>
                                      {t.title}{t.done ? " · ya cargado" : ""}
                                    </SelectItem>
                                  ))}
                                  <SelectItem value="none">Otro documento (sin vincular)</SelectItem>
                                </SelectContent>
                              </Select>
                              {isOther && (
                                <Input
                                  autoFocus value={newName}
                                  onChange={(e) => setNewName(e.target.value)}
                                  placeholder="Nombre del documento"
                                  className="flex-1 h-9"
                                />
                              )}
                              <label className={cn(
                                "inline-flex items-center gap-2 h-9 px-3 rounded-md border border-border text-sm cursor-pointer hover:bg-muted transition-all",
                                (uploading || (isOther && !newName)) && "opacity-50 pointer-events-none"
                              )}>
                                <Upload size={14} strokeWidth={1.5} />
                                {uploading ? "Cargando..." : "Elegir archivo"}
                                <input
                                  type="file" className="hidden"
                                  onChange={(e) => e.target.files?.[0] && addAndUpload(cat.id, e.target.files[0])}
                                />
                              </label>
                              <Button size="sm" variant="ghost" onClick={() => { setAdding(null); setNewTaskId("none"); setNewName(""); }}>Cancelar</Button>
                            </div>
                          </div>
                        );
                      })()
                    ) : (
                      <button
                        onClick={() => { setAdding(cat.id); setNewTaskId("none"); setNewName(""); }}
                        className="w-full flex items-center gap-2 px-6 py-3 text-sm text-muted-foreground hover:text-foreground transition-all border-t border-border/50"
                      >
                        <Plus size={14} strokeWidth={1.5} /> Agregar documento
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      </div>

      <AlertDialog open={!!deletingDoc} onOpenChange={(open) => !open && setDeletingDoc(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar documento?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará <strong>{deletingDoc?.name}</strong> del Data Room. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeletingDoc(null)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingDoc && deleteDoc(deletingDoc)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
