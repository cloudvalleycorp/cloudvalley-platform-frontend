import { useState } from "react";
import { toast } from "sonner";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRoadmapCatalogMutations } from "@/hooks/useRoadmapCatalogMutations";
import { CRITICALITY_LABELS, type Criticality, type RoadmapPillar } from "@/lib/roadmap";

type Draft = {
  pillar_id: string;
  title: string;
  criticality: Criticality;
  requires_doc: boolean;
  requires_report: boolean;
  targetIds: string[];
};
function emptyDraft(pillarId: string): Draft {
  return { pillar_id: pillarId, title: "", criticality: "recommended", requires_doc: false, requires_report: false, targetIds: [] };
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
};

// Compartido entre "Agregar tarea propia" (Roadmap.tsx, founder) y "Agregar
// requisito" (InvestorPortfolio.tsx / InvestorCompany.tsx, inversor) — misma
// mecánica de guardado (upsertTask, ya funciona para ambos roles), difiere
// solo en si hay selector de empresas destino y en la copy.
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
}: Props) {
  const { upsertTask } = useRoadmapCatalogMutations();
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(defaultPillarId));
  const [saving, setSaving] = useState(false);

  const resetAndOpenChange = (o: boolean) => {
    if (o) setDraft(emptyDraft(defaultPillarId));
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
      pillar_id: draft.pillar_id,
      title: draft.title.trim(),
      criticality: draft.criticality,
      requires_doc: draft.requires_doc,
      requires_report: draft.requires_report,
      order_index: 0,
      target_startup_ids,
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
      submitLabel="Agregar"
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
