import { useState } from "react";
import { toast } from "sonner";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRoadmapCatalogMutations } from "@/hooks/useRoadmapCatalogMutations";
import { CRITICALITY_LABELS, type Criticality, type RoadmapPillar } from "@/lib/roadmap";

type Draft = {
  pillar_id: string;
  title: string;
  description: string;
  why_it_matters: string;
  how_to_do_it: string;
  criticality: Criticality;
  requires_doc: boolean;
  requires_report: boolean;
  due_date: string; // "YYYY-MM-DD", "" = sin fecha
  targetIds: string[];
};
function emptyDraft(pillarId: string): Draft {
  return {
    pillar_id: pillarId,
    title: "",
    description: "",
    why_it_matters: "",
    how_to_do_it: "",
    criticality: "recommended",
    requires_doc: false,
    requires_report: false,
    due_date: "",
    targetIds: [],
  };
}

// Tarea existente a editar — solo aplica a scope="fund" del propio fondo
// (upsert-roadmap-task da 403 en cualquier otro caso). Un subset mínimo,
// no el RoadmapTask/PortfolioTask completo, para no acoplar este dialog a
// esos tipos. description/why_it_matters/how_to_do_it/pillar_id vienen
// null/"" cuando se edita desde /tasks (list-portfolio-tasks no los trae,
// a diferencia de list-shared-roadmap) — el usuario los completa de nuevo
// si hace falta, no se pierde nada que no estuviera ya vacío.
export type EditableTask = {
  task_id: string;
  pillar_id: string;
  title: string;
  description: string | null;
  why_it_matters: string | null;
  how_to_do_it: string | null;
  criticality: Criticality;
  requires_doc: boolean;
  requires_report: boolean;
  due_date: string | null;
};

function draftFromTask(task: EditableTask): Draft {
  return {
    pillar_id: task.pillar_id,
    title: task.title,
    description: task.description ?? "",
    why_it_matters: task.why_it_matters ?? "",
    how_to_do_it: task.how_to_do_it ?? "",
    criticality: task.criticality,
    requires_doc: task.requires_doc,
    requires_report: task.requires_report,
    due_date: task.due_date ?? "",
    targetIds: [],
  };
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pillars: RoadmapPillar[];
  defaultPillarId: string;
  title: string;
  description: string;
  onSaved: () => void;
  // Ausente (founder): la tarea es implícitamente para la propia startup, no
  // se muestra selector de destinatarios. Presente (inversor): lista para
  // elegir a quién aplica — si hideTargetPicker es true, se asume que
  // companies tiene un solo elemento (la empresa de la página actual) y ni
  // siquiera se muestra el checklist, se manda directo.
  companies?: { id: string; name: string }[];
  hideTargetPicker?: boolean;
  // Presente = modo edición (Tasks, /companies/:id?tab=tasks) — precarga el
  // draft y manda task_id al guardar en vez de crear una nueva.
  task?: EditableTask | null;
};

// Compartido entre "Agregar tarea propia" (Roadmap.tsx, founder), "Agregar
// requisito" (InvestorPortfolio.tsx / InvestorCompany.tsx, inversor, modo
// creación) y edición de una tarea de fondo ya creada (Tasks,
// /companies/:id?tab=tasks) — misma mecánica de guardado (upsertTask, ya
// funciona para ambos roles), difiere en si hay selector de empresas
// destino y en la copy.
export function AddRoadmapTaskDialog({
  open,
  onOpenChange,
  pillars,
  defaultPillarId,
  title,
  description,
  onSaved,
  companies,
  hideTargetPicker,
  task,
}: Props) {
  const { upsertTask } = useRoadmapCatalogMutations();
  const [draft, setDraft] = useState<Draft>(() => (task ? draftFromTask(task) : emptyDraft(defaultPillarId)));
  const [saving, setSaving] = useState(false);

  const resetAndOpenChange = (o: boolean) => {
    if (o) setDraft(task ? draftFromTask(task) : emptyDraft(defaultPillarId));
    onOpenChange(o);
  };

  const save = async () => {
    if (!draft.title.trim() || !draft.pillar_id) {
      toast.error("Título y pilar son obligatorios");
      return;
    }
    setSaving(true);
    const target_startup_ids =
      companies && hideTargetPicker
        ? companies.map((c) => c.id)
        : companies && draft.targetIds.length > 0
          ? draft.targetIds
          : undefined;
    const ok = await upsertTask({
      task_id: task?.task_id,
      pillar_id: draft.pillar_id,
      title: draft.title.trim(),
      description: draft.description.trim() || undefined,
      why_it_matters: draft.why_it_matters.trim() || undefined,
      how_to_do_it: draft.how_to_do_it.trim() || undefined,
      criticality: draft.criticality,
      requires_doc: draft.requires_doc,
      requires_report: draft.requires_report,
      order_index: 0,
      target_startup_ids,
      due_date: draft.due_date || undefined,
    });
    setSaving(false);
    if (ok) {
      onOpenChange(false);
      onSaved();
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={resetAndOpenChange}
      title={title}
      description={description}
      onSubmit={save}
      submitLabel={task ? "Guardar" : "Agregar"}
      busy={saving}
      contentClassName="sm:max-w-lg"
    >
      <FormField label="Pilar">
        <Select value={draft.pillar_id} onValueChange={(v) => setDraft({ ...draft, pillar_id: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pillars.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="Título">
        <Input
          autoFocus
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="Ej: Subir cap table actualizada"
        />
      </FormField>
      <FormField label="Descripción" helpText="Opcional — se ve al abrir el detalle de la tarea.">
        <Textarea
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          placeholder="Qué tiene que hacer la startup"
          rows={2}
        />
      </FormField>
      <FormField label="Por qué importa" helpText="Opcional">
        <Textarea
          value={draft.why_it_matters}
          onChange={(e) => setDraft({ ...draft, why_it_matters: e.target.value })}
          rows={2}
        />
      </FormField>
      <FormField label="Cómo hacerlo" helpText="Opcional">
        <Textarea
          value={draft.how_to_do_it}
          onChange={(e) => setDraft({ ...draft, how_to_do_it: e.target.value })}
          rows={2}
        />
      </FormField>
      <FormField label="Vence" helpText="Opcional">
        <Input
          type="date"
          value={draft.due_date}
          onChange={(e) => setDraft({ ...draft, due_date: e.target.value })}
        />
      </FormField>
      <FormField label="Criticidad">
        <Select value={draft.criticality} onValueChange={(v: Criticality) => setDraft({ ...draft, criticality: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(CRITICALITY_LABELS) as Criticality[]).map((c) => (
              <SelectItem key={c} value={c}>
                {CRITICALITY_LABELS[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>
      <FormField label="Se completa con">
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={draft.requires_doc}
              onCheckedChange={(c) => setDraft({ ...draft, requires_doc: c === true })}
            />
            Un documento en el Data Room de la startup
          </label>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <Checkbox
              checked={draft.requires_report}
              onCheckedChange={(c) => setDraft({ ...draft, requires_report: c === true })}
            />
            Un reporte creado y compartido con tu fondo
          </label>
        </div>
      </FormField>
      {companies && !hideTargetPicker && (
        <FormField label="Startups a las que aplica">
          <p className="text-xs text-muted-foreground mb-2">Sin seleccionar ninguna = aplica a todo tu portfolio conectado.</p>
          <div className="max-h-40 overflow-y-auto border border-border rounded-md divide-y divide-border">
            {companies.map((c) => (
              <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                <Checkbox
                  checked={draft.targetIds.includes(c.id)}
                  onCheckedChange={() =>
                    setDraft({
                      ...draft,
                      targetIds: draft.targetIds.includes(c.id)
                        ? draft.targetIds.filter((x) => x !== c.id)
                        : [...draft.targetIds, c.id],
                    })
                  }
                />
                {c.name}
              </label>
            ))}
          </div>
        </FormField>
      )}
    </FormDialog>
  );
}
