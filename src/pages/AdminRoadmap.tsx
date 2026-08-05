import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { SkeletonSection } from "@/components/SkeletonSection";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useRoadmapCatalog } from "@/hooks/useRoadmapCatalog";
import { useRoadmapCatalogMutations } from "@/hooks/useRoadmapCatalogMutations";
import {
  CRITICALITY_LABELS,
  type CatalogPillar,
  type CatalogTask,
  type Criticality,
} from "@/lib/roadmap";
import { API_BASE_URL } from "@/lib/apiConfig";
import { Plus, Pencil, Trash2, Map as MapIcon } from "lucide-react";

const LIST_COMPANIES_URL = `${API_BASE_URL}/list-companies`;

type Company = { company_id: string; name: string };

function scopeLabel(item: { scope: string; target_startup_ids: string[] | null }): string {
  const base = item.scope === "admin" ? "Global" : item.scope === "startup" ? "Propia de startup" : "De un fondo";
  if (!item.target_startup_ids || item.target_startup_ids.length === 0) return base;
  return `${base} · ${item.target_startup_ids.length} startup${item.target_startup_ids.length === 1 ? "" : "s"}`;
}

type PillarDraft = { name: string; weight: string; order_index: string; targetIds: string[] };
function emptyPillarDraft(nextOrder: number): PillarDraft {
  return { name: "", weight: "10", order_index: String(nextOrder), targetIds: [] };
}

type TaskDraft = {
  pillar_id: string;
  title: string;
  description: string;
  why_it_matters: string;
  how_to_do_it: string;
  criticality: Criticality;
  requires_doc: boolean;
  requires_report: boolean;
  stage_required: string;
  order_index: string;
  targetIds: string[];
};
function emptyTaskDraft(pillarId: string, nextOrder: number): TaskDraft {
  return {
    pillar_id: pillarId,
    title: "",
    description: "",
    why_it_matters: "",
    how_to_do_it: "",
    criticality: "recommended",
    requires_doc: false,
    requires_report: false,
    stage_required: "",
    order_index: String(nextOrder),
    targetIds: [],
  };
}

function TargetStartupPicker({
  companies,
  value,
  onChange,
}: {
  companies: Company[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(value.includes(id) ? value.filter((x) => x !== id) : [...value, id]);
  };
  return (
    <div>
      <p className="text-xs text-muted-foreground mb-2">
        Sin seleccionar ninguna = aplica a todas. Seleccionando algunas, solo aplica a esas.
      </p>
      <div className="max-h-40 overflow-y-auto border border-border rounded-md divide-y divide-border">
        {companies.map((c) => (
          <label key={c.company_id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
            <Checkbox checked={value.includes(c.company_id)} onCheckedChange={() => toggle(c.company_id)} />
            {c.name}
          </label>
        ))}
      </div>
    </div>
  );
}

export default function AdminRoadmap() {
  const { isAdmin, loading } = useAuth();
  const { pillars, tasks, loading: loadingCatalog, reload } = useRoadmapCatalog(isAdmin);
  const { upsertPillar, deletePillar, upsertTask, deleteTask } = useRoadmapCatalogMutations();

  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies-for-roadmap"],
    queryFn: async () => {
      const res = await fetch(LIST_COMPANIES_URL, { credentials: "include" });
      if (!res.ok) return [] as Company[];
      const data = await res.json();
      return (data.companies ?? []) as Company[];
    },
    enabled: isAdmin,
  });

  const [pillarFilter, setPillarFilter] = useState<string>("all");
  const filteredTasks = pillarFilter === "all" ? tasks : tasks.filter((t) => t.pillar_id === pillarFilter);
  const taskCountByPillar = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) map.set(t.pillar_id, (map.get(t.pillar_id) ?? 0) + 1);
    return map;
  }, [tasks]);

  const [pillarDialog, setPillarDialog] = useState<{ editing: CatalogPillar | null; draft: PillarDraft } | null>(null);
  const [deletingPillar, setDeletingPillar] = useState<CatalogPillar | null>(null);
  const [taskDialog, setTaskDialog] = useState<{ editing: CatalogTask | null; draft: TaskDraft } | null>(null);
  const [deletingTask, setDeletingTask] = useState<CatalogTask | null>(null);
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const openNewPillar = () => setPillarDialog({ editing: null, draft: emptyPillarDraft(pillars.length) });
  const openEditPillar = (p: CatalogPillar) =>
    setPillarDialog({
      editing: p,
      draft: { name: p.name, weight: String(p.weight), order_index: String(p.order_index), targetIds: p.target_startup_ids ?? [] },
    });

  const savePillar = async () => {
    if (!pillarDialog) return;
    const { editing, draft } = pillarDialog;
    if (!draft.name.trim()) {
      toast.error("El nombre es obligatorio");
      return;
    }
    setBusy(true);
    const ok = await upsertPillar({
      pillar_id: editing?.id,
      name: draft.name.trim(),
      weight: Number(draft.weight) || 0,
      order_index: Number(draft.order_index) || 0,
      target_startup_ids: draft.targetIds.length > 0 ? draft.targetIds : undefined,
    });
    setBusy(false);
    if (ok) {
      setPillarDialog(null);
      reload();
    }
  };

  const confirmDeletePillar = async () => {
    if (!deletingPillar) return;
    setBusy(true);
    const ok = await deletePillar(deletingPillar.id);
    setBusy(false);
    if (ok) {
      setDeletingPillar(null);
      reload();
    }
  };

  const openNewTask = (pillarId: string) => {
    const count = taskCountByPillar.get(pillarId) ?? 0;
    setTaskDialog({ editing: null, draft: emptyTaskDraft(pillarId || pillars[0]?.id || "", count) });
  };
  const openEditTask = (t: CatalogTask) =>
    setTaskDialog({
      editing: t,
      draft: {
        pillar_id: t.pillar_id,
        title: t.title,
        description: t.description ?? "",
        why_it_matters: t.why_it_matters ?? "",
        how_to_do_it: t.how_to_do_it ?? "",
        criticality: t.criticality,
        requires_doc: t.requires_doc,
        requires_report: t.requires_report,
        stage_required: t.stage_required ?? "",
        order_index: String(t.order_index),
        targetIds: t.target_startup_ids ?? [],
      },
    });

  const saveTask = async () => {
    if (!taskDialog) return;
    const { editing, draft } = taskDialog;
    if (!draft.title.trim() || !draft.pillar_id) {
      toast.error("Título y pilar son obligatorios");
      return;
    }
    setBusy(true);
    const ok = await upsertTask({
      task_id: editing?.id,
      pillar_id: draft.pillar_id,
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      why_it_matters: draft.why_it_matters.trim() || undefined,
      how_to_do_it: draft.how_to_do_it.trim() || undefined,
      criticality: draft.criticality,
      requires_doc: draft.requires_doc,
      requires_report: draft.requires_report,
      stage_required: draft.stage_required.trim() || undefined,
      order_index: Number(draft.order_index) || 0,
      target_startup_ids: draft.targetIds.length > 0 ? draft.targetIds : undefined,
    });
    setBusy(false);
    if (ok) {
      setTaskDialog(null);
      reload();
    }
  };

  const confirmDeleteTask = async () => {
    if (!deletingTask) return;
    setBusy(true);
    const ok = await deleteTask(deletingTask.id);
    setBusy(false);
    if (ok) {
      setDeletingTask(null);
      reload();
    }
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-10">
        <PageHeader
          title="Catálogo de Roadmap"
          subtitle="Pilares y tareas que arman el roadmap de cada startup. Solo lo marcado como Global pesa en el readiness score."
        />

        {loadingCatalog ? (
          <SkeletonSection rows={4} columns={4} />
        ) : (
          <>
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-medium">Pilares</h2>
                <Button size="sm" onClick={openNewPillar}>
                  <Plus size={14} className="mr-1" /> Nuevo pilar
                </Button>
              </div>
              <DataTable
                columns={[
                  { header: "Nombre", cell: (p: CatalogPillar) => <span className="font-medium">{p.name}</span> },
                  { header: "Peso", cell: (p: CatalogPillar) => p.weight },
                  { header: "Orden", cell: (p: CatalogPillar) => p.order_index },
                  { header: "Alcance", cell: (p: CatalogPillar) => <Badge variant="outline">{scopeLabel(p)}</Badge> },
                  { header: "Tareas", cell: (p: CatalogPillar) => taskCountByPillar.get(p.id) ?? 0 },
                  {
                    header: "Acciones",
                    align: "right",
                    cell: (p: CatalogPillar) => (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditPillar(p)}>
                          <Pencil size={12} className="mr-1" /> Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeletingPillar(p)}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    ),
                  },
                ]}
                rows={pillars}
                rowKey={(p) => p.id}
                emptyLabel={
                  <EmptyState
                    bordered={false}
                    icon={MapIcon}
                    title="No hay pilares todavía."
                    action={{ label: "Nuevo pilar", onClick: openNewPillar }}
                  />
                }
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-4 gap-2">
                <h2 className="text-sm font-medium">Tareas</h2>
                <div className="flex items-center gap-2">
                  <Select value={pillarFilter} onValueChange={setPillarFilter}>
                    <SelectTrigger className="w-56 h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos los pilares</SelectItem>
                      {pillars.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" onClick={() => openNewTask(pillarFilter !== "all" ? pillarFilter : "")} disabled={pillars.length === 0}>
                    <Plus size={14} className="mr-1" /> Nueva tarea
                  </Button>
                </div>
              </div>
              <DataTable
                columns={[
                  { header: "Título", cell: (t: CatalogTask) => <span className="font-medium">{t.title}</span> },
                  {
                    header: "Pilar",
                    cell: (t: CatalogTask) => pillars.find((p) => p.id === t.pillar_id)?.name ?? "—",
                  },
                  { header: "Criticidad", cell: (t: CatalogTask) => CRITICALITY_LABELS[t.criticality] },
                  {
                    header: "Evidencia",
                    cell: (t: CatalogTask) => (
                      <span className="text-xs text-muted-foreground">
                        {[t.requires_doc && "Documento", t.requires_report && "Reporte"].filter(Boolean).join(" o ") || "—"}
                      </span>
                    ),
                  },
                  { header: "Alcance", cell: (t: CatalogTask) => <Badge variant="outline">{scopeLabel(t)}</Badge> },
                  {
                    header: "Acciones",
                    align: "right",
                    cell: (t: CatalogTask) => (
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEditTask(t)}>
                          <Pencil size={12} className="mr-1" /> Editar
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-muted-foreground hover:text-destructive"
                          onClick={() => setDeletingTask(t)}
                        >
                          <Trash2 size={12} />
                        </Button>
                      </div>
                    ),
                  },
                ]}
                rows={filteredTasks}
                rowKey={(t) => t.id}
                emptyLabel={
                  <EmptyState
                    bordered={false}
                    icon={MapIcon}
                    title="No hay tareas todavía."
                    action={pillars.length > 0 ? { label: "Nueva tarea", onClick: () => openNewTask(pillars[0].id) } : undefined}
                  />
                }
              />
            </div>
          </>
        )}
      </div>

      <FormDialog
        open={!!pillarDialog}
        onOpenChange={(o) => !o && setPillarDialog(null)}
        title={pillarDialog?.editing ? "Editar pilar" : "Nuevo pilar"}
        onSubmit={savePillar}
        submitLabel="Guardar"
        busy={busy}
      >
        {pillarDialog && (
          <>
            <FormField label="Nombre">
              <Input
                value={pillarDialog.draft.name}
                onChange={(e) => setPillarDialog({ ...pillarDialog, draft: { ...pillarDialog.draft, name: e.target.value } })}
              />
            </FormField>
            <FormField label="Peso">
              <Input
                type="number"
                value={pillarDialog.draft.weight}
                onChange={(e) => setPillarDialog({ ...pillarDialog, draft: { ...pillarDialog.draft, weight: e.target.value } })}
              />
            </FormField>
            <FormField label="Orden">
              <Input
                type="number"
                value={pillarDialog.draft.order_index}
                onChange={(e) => setPillarDialog({ ...pillarDialog, draft: { ...pillarDialog.draft, order_index: e.target.value } })}
              />
            </FormField>
            <FormField label="Startups a las que aplica">
              <TargetStartupPicker
                companies={companies}
                value={pillarDialog.draft.targetIds}
                onChange={(ids) => setPillarDialog({ ...pillarDialog, draft: { ...pillarDialog.draft, targetIds: ids } })}
              />
            </FormField>
          </>
        )}
      </FormDialog>

      <ConfirmationDialog
        open={!!deletingPillar}
        onOpenChange={(open) => !open && setDeletingPillar(null)}
        title="Eliminar pilar"
        description={
          <>
            Se eliminará <strong>{deletingPillar?.name}</strong> del catálogo, junto con sus tareas. Esta acción no se
            puede deshacer.
          </>
        }
        confirmLabel="Eliminar pilar"
        variant="destructive"
        busy={busy}
        onConfirm={confirmDeletePillar}
      />

      <FormDialog
        open={!!taskDialog}
        onOpenChange={(o) => !o && setTaskDialog(null)}
        title={taskDialog?.editing ? "Editar tarea" : "Nueva tarea"}
        onSubmit={saveTask}
        submitLabel="Guardar"
        busy={busy}
        contentClassName="sm:max-w-lg"
      >
        {taskDialog && (
          <>
            <FormField label="Pilar">
              <Select
                value={taskDialog.draft.pillar_id}
                onValueChange={(v) => setTaskDialog({ ...taskDialog, draft: { ...taskDialog.draft, pillar_id: v } })}
              >
                <SelectTrigger><SelectValue placeholder="Elegí un pilar" /></SelectTrigger>
                <SelectContent>
                  {pillars.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Título">
              <Input
                value={taskDialog.draft.title}
                onChange={(e) => setTaskDialog({ ...taskDialog, draft: { ...taskDialog.draft, title: e.target.value } })}
              />
            </FormField>
            <FormField label="Descripción">
              <Textarea
                rows={2}
                value={taskDialog.draft.description}
                onChange={(e) => setTaskDialog({ ...taskDialog, draft: { ...taskDialog.draft, description: e.target.value } })}
              />
            </FormField>
            <FormField label="Por qué importa">
              <Textarea
                rows={2}
                value={taskDialog.draft.why_it_matters}
                onChange={(e) => setTaskDialog({ ...taskDialog, draft: { ...taskDialog.draft, why_it_matters: e.target.value } })}
              />
            </FormField>
            <FormField label="Cómo hacerlo">
              <Textarea
                rows={2}
                value={taskDialog.draft.how_to_do_it}
                onChange={(e) => setTaskDialog({ ...taskDialog, draft: { ...taskDialog.draft, how_to_do_it: e.target.value } })}
              />
            </FormField>
            <FormField label="Criticidad">
              <Select
                value={taskDialog.draft.criticality}
                onValueChange={(v: Criticality) => setTaskDialog({ ...taskDialog, draft: { ...taskDialog.draft, criticality: v } })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(CRITICALITY_LABELS) as Criticality[]).map((c) => (
                    <SelectItem key={c} value={c}>{CRITICALITY_LABELS[c]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormField>
            <FormField label="Etapa requerida (opcional, texto libre)">
              <Input
                value={taskDialog.draft.stage_required}
                onChange={(e) => setTaskDialog({ ...taskDialog, draft: { ...taskDialog.draft, stage_required: e.target.value } })}
                placeholder="Ej: seed"
              />
            </FormField>
            <FormField label="Evidencia que la completa">
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={taskDialog.draft.requires_doc}
                    onCheckedChange={(c) => setTaskDialog({ ...taskDialog, draft: { ...taskDialog.draft, requires_doc: c === true } })}
                  />
                  Requiere documento (Data Room)
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={taskDialog.draft.requires_report}
                    onCheckedChange={(c) => setTaskDialog({ ...taskDialog, draft: { ...taskDialog.draft, requires_report: c === true } })}
                  />
                  Requiere reporte compartido (Reporting)
                </label>
              </div>
            </FormField>
            <FormField label="Startups a las que aplica">
              <TargetStartupPicker
                companies={companies}
                value={taskDialog.draft.targetIds}
                onChange={(ids) => setTaskDialog({ ...taskDialog, draft: { ...taskDialog.draft, targetIds: ids } })}
              />
            </FormField>
          </>
        )}
      </FormDialog>

      <ConfirmationDialog
        open={!!deletingTask}
        onOpenChange={(open) => !open && setDeletingTask(null)}
        title="Eliminar tarea"
        description={
          <>
            Se eliminará <strong>{deletingTask?.title}</strong> del catálogo. Esta acción no se puede deshacer.
          </>
        }
        confirmLabel="Eliminar tarea"
        variant="destructive"
        busy={busy}
        onConfirm={confirmDeleteTask}
      />
    </AppLayout>
  );
}
