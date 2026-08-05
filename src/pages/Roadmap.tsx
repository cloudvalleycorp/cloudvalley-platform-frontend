import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Info, Upload, RefreshCw, ChevronDown, Map, FileBarChart, Plus } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { SkeletonSection } from "@/components/SkeletonSection";
import { EmptyState } from "@/components/EmptyState";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useStartup } from "@/hooks/useStartup";
import { useRoadmap } from "@/hooks/useRoadmap";
import { useDocuments } from "@/hooks/useDocuments";
import { useRoadmapCatalogMutations } from "@/hooks/useRoadmapCatalogMutations";
import { categoryForPillarName } from "@/lib/dataRoom";
import { CRITICALITY_LABELS, type Criticality, type RoadmapTask } from "@/lib/roadmap";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { StageBadge } from "@/components/StageBadge";
import { cn } from "@/lib/utils";

type OwnTaskDraft = { pillar_id: string; title: string; criticality: Criticality; requires_doc: boolean; requires_report: boolean };
function emptyOwnTaskDraft(pillarId: string): OwnTaskDraft {
  return { pillar_id: pillarId, title: "", criticality: "recommended", requires_doc: false, requires_report: false };
}

export default function Roadmap() {
  const { company_id } = useAuth();
  const { startup } = useStartup();
  const { pillars, tasks, readinessScore, loading: loadingRoadmap, toggleStatus, reload } = useRoadmap(company_id);
  const { createAndUpload, uploadFile } = useDocuments(company_id);
  const { upsertTask } = useRoadmapCatalogMutations();

  const [activePillar, setActivePillar] = useState<string>("all");
  const [openTask, setOpenTask] = useState<RoadmapTask | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [ownTaskDraft, setOwnTaskDraft] = useState<OwnTaskDraft | null>(null);
  const [savingOwnTask, setSavingOwnTask] = useState(false);

  const saveOwnTask = async () => {
    if (!ownTaskDraft) return;
    if (!ownTaskDraft.title.trim() || !ownTaskDraft.pillar_id) {
      toast.error("Título y pilar son obligatorios");
      return;
    }
    setSavingOwnTask(true);
    const ok = await upsertTask({
      pillar_id: ownTaskDraft.pillar_id,
      title: ownTaskDraft.title.trim(),
      criticality: ownTaskDraft.criticality,
      requires_doc: ownTaskDraft.requires_doc,
      requires_report: ownTaskDraft.requires_report,
      order_index: tasks.filter((t) => t.pillar_id === ownTaskDraft.pillar_id).length,
    });
    setSavingOwnTask(false);
    if (ok) {
      setOwnTaskDraft(null);
      reload();
    }
  };

  const handleUpload = async (task: RoadmapTask, file: File) => {
    let ok: boolean;
    if (task.document_id) {
      ok = await uploadFile(task.document_id, file);
    } else {
      const pillarName = pillars.find((p) => p.id === task.pillar_id)?.name ?? "";
      const category = categoryForPillarName(pillarName);
      if (!category) {
        toast.error("No se pudo determinar la categoría del documento para esta tarea");
        return;
      }
      ok = await createAndUpload(category, task.title, file, task.task_id, true);
    }
    if (ok) reload();
  };

  const grouped = useMemo(() => {
    const filtered = activePillar === "all" ? tasks : tasks.filter((t) => t.pillar_id === activePillar);
    return pillars
      .map((p) => ({
        ...p,
        items: filtered.filter((t) => t.pillar_id === p.id),
      }))
      .filter((p) => p.items.length > 0);
  }, [tasks, pillars, activePillar]);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <PageHeader
          title="Fundraising Roadmap"
          subtitle={
            <span className="inline-flex items-center gap-2">
              <StageBadge stage={startup?.stage} />
              <span>Readiness {readinessScore}/100</span>
            </span>
          }
          action={
            pillars.length > 0 && (
              <Button variant="outline" onClick={() => setOwnTaskDraft(emptyOwnTaskDraft(activePillar !== "all" ? activePillar : pillars[0].id))}>
                <Plus size={14} strokeWidth={1.5} className="mr-2" /> Agregar tarea propia
              </Button>
            )
          }
        />

        {loadingRoadmap ? (
          <SkeletonSection rows={4} columns={2} />
        ) : grouped.length === 0 ? (
          <EmptyState
            icon={Map}
            title="Todavía no hay tareas en tu roadmap."
            description="Cuando se generen las tareas de tu etapa, van a aparecer acá agrupadas por pilar."
          />
        ) : (
          <>
        {/* Pillar tabs */}
        <div className="flex gap-1 border-b border-border mb-8 overflow-x-auto">
          <button
            onClick={() => setActivePillar("all")}
            className={cn(
              "px-3 py-2 text-sm transition-all duration-150 border-b-2 -mb-px whitespace-nowrap",
              activePillar === "all" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Todos
          </button>
          {pillars.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePillar(p.id)}
              className={cn(
                "px-3 py-2 text-sm transition-all duration-150 border-b-2 -mb-px whitespace-nowrap",
                activePillar === p.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {grouped.map((p) => {
            const done = p.items.filter((t) => t.status === "done").length;
            const isCollapsed = collapsed.has(p.id);
            return (
              <section key={p.id} className="border border-border rounded-lg bg-card">
                <button
                  className="w-full px-6 py-4 flex items-center justify-between text-left"
                  onClick={() => {
                    setCollapsed((prev) => {
                      const next = new Set(prev);
                      if (next.has(p.id)) next.delete(p.id);
                      else next.add(p.id);
                      return next;
                    });
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h2 className="text-base font-medium">{p.name}</h2>
                      <span className="text-xs text-tertiary">peso {p.weight}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="text-xs text-muted-foreground">{done}/{p.items.length}</div>
                      <div className="h-0.5 flex-1 max-w-xs bg-surface rounded-full overflow-hidden">
                        <div className="h-full bg-foreground transition-all duration-150" style={{ width: `${(done / p.items.length) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                  <ChevronDown size={16} strokeWidth={1.5} className={cn("text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
                </button>
                {!isCollapsed && (
                  <ul className="border-t border-border">
                    {p.items.map((t) => (
                      <li key={t.startup_task_id} className="flex items-center gap-3 px-6 py-3 border-b border-border/50 last:border-0 group">
                        <Checkbox
                          checked={t.status === "done"}
                          onCheckedChange={() => toggleStatus(t.startup_task_id, t.status === "done" ? "pending" : "done")}
                        />
                        <span className={cn("flex-1 text-sm", t.status === "done" && "text-tertiary line-through")}>{t.title}</span>
                        <span className={cn(
                          "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border",
                          t.criticality === "critical" ? "border-foreground text-foreground" : "border-border text-muted-foreground"
                        )}>{t.criticality}</span>
                        {t.requires_report && (
                          <Link
                            to="/reporting"
                            title="Se completa creando y compartiendo un reporte"
                            className="text-muted-foreground hover:text-foreground transition-all"
                          >
                            <FileBarChart size={14} strokeWidth={1.5} />
                          </Link>
                        )}
                        {t.requires_doc && (
                          <label
                            className="cursor-pointer text-muted-foreground hover:text-foreground transition-all"
                            title={t.document_id ? "Reemplazar documento" : "Subir documento"}
                          >
                            {t.document_id ? <RefreshCw size={14} strokeWidth={1.5} /> : <Upload size={14} strokeWidth={1.5} />}
                            <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(t, e.target.files[0])} />
                          </label>
                        )}
                        <button
                          onClick={() => setOpenTask(t)}
                          className="p-1.5 -m-1.5 text-muted-foreground hover:text-foreground transition-all"
                          aria-label={`Info sobre ${t.title}`}
                        >
                          <Info size={14} strokeWidth={1.5} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
        </>
        )}
      </div>

      <Sheet open={!!openTask} onOpenChange={(o) => !o && setOpenTask(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{openTask?.title}</SheetTitle>
            <SheetDescription>{openTask?.description}</SheetDescription>
          </SheetHeader>
          {openTask && (
            <div className="mt-6 space-y-6">
              {openTask.why_it_matters && (
                <div>
                  <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Por qué importa</h4>
                  <p className="text-sm">{openTask.why_it_matters}</p>
                </div>
              )}
              {openTask.how_to_do_it && (
                <div>
                  <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Cómo hacerlo</h4>
                  <p className="text-sm">{openTask.how_to_do_it}</p>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      <FormDialog
        open={!!ownTaskDraft}
        onOpenChange={(o) => !o && setOwnTaskDraft(null)}
        title="Agregar tarea propia"
        description="Solo la ves vos (y CloudValley) — no cuenta para el readiness score, que se calcula solo con el catálogo estándar."
        onSubmit={saveOwnTask}
        submitLabel="Agregar"
        busy={savingOwnTask}
      >
        {ownTaskDraft && (
          <>
            <FormField label="Pilar">
              <Select
                value={ownTaskDraft.pillar_id}
                onValueChange={(v) => setOwnTaskDraft({ ...ownTaskDraft, pillar_id: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {pillars.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Título">
              <Input
                autoFocus
                value={ownTaskDraft.title}
                onChange={(e) => setOwnTaskDraft({ ...ownTaskDraft, title: e.target.value })}
                placeholder="Ej: Firmar acuerdo de confidencialidad con proveedor X"
              />
            </FormField>
            <FormField label="Criticidad">
              <Select
                value={ownTaskDraft.criticality}
                onValueChange={(v: Criticality) => setOwnTaskDraft({ ...ownTaskDraft, criticality: v })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CRITICALITY_LABELS) as Criticality[]).map((c) => (
                    <SelectItem key={c} value={c}>{CRITICALITY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Se completa con">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={ownTaskDraft.requires_doc}
                    onCheckedChange={(c) => setOwnTaskDraft({ ...ownTaskDraft, requires_doc: c === true })}
                  />
                  Subir un documento (Data Room)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={ownTaskDraft.requires_report}
                    onCheckedChange={(c) => setOwnTaskDraft({ ...ownTaskDraft, requires_report: c === true })}
                  />
                  Crear y compartir un reporte (Reporting)
                </label>
                <p className="text-xs text-muted-foreground">Si no marcás ninguna, se completa solo con el checkbox manual.</p>
              </div>
            </FormField>
          </>
        )}
      </FormDialog>
    </AppLayout>
  );
}
