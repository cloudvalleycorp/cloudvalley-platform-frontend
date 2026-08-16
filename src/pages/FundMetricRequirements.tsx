import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CoverageRing, coverageTone } from "@/components/investor/CoverageRing";
import { useMetricRequirements, useMetricRequirementMutations } from "@/hooks/useMetricRequirements";
import { useMetricRequirementCoverage } from "@/hooks/useMetricRequirementCoverage";
import {
  VALUE_TYPE_LABELS,
  PERIODICITY_LABELS,
  type MetricRequirement,
  type MetricValueType,
  type MetricPeriodicity,
  type MetricRequirementCoverage,
} from "@/lib/metricRequirements";
import { SlidersHorizontal, Plus, MoreVertical, Pencil, Trash2, Building2 } from "lucide-react";

function currentPeriodString() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type Draft = {
  requirement_id?: string;
  name: string;
  description: string;
  why_it_matters: string;
  unit: string;
  value_type: MetricValueType;
  periodicity: MetricPeriodicity;
};
function emptyDraft(): Draft {
  return { name: "", description: "", why_it_matters: "", unit: "", value_type: "money", periodicity: "monthly" };
}
function draftFromRequirement(r: MetricRequirement): Draft {
  return {
    requirement_id: r.requirement_id,
    name: r.name,
    description: r.description ?? "",
    why_it_matters: r.why_it_matters ?? "",
    unit: r.unit,
    value_type: r.value_type,
    periodicity: r.periodicity,
  };
}

export default function FundMetricRequirements() {
  const { user, loading, isOrgViewer, fund_id, portfolio_company_ids, portfolio_company_names, email } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [reopen, setReopen] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isOrgViewer) return <Navigate to="/dashboard" replace />;

  if (!fund_id) {
    if (!dismissed || reopen) {
      return (
        <AppLayout>
          <NoMembershipScreen role="investor" email={email} onDismiss={() => { setDismissed(true); setReopen(false); }} />
        </AppLayout>
      );
    }
    return (
      <AppLayout>
        <div className="max-w-5xl mx-auto px-8 py-12">
          <NoMembershipBanner role="investor" onOpen={() => setReopen(true)} />
          <EmptyState
            icon={SlidersHorizontal}
            title="No hay nada para configurar todavía."
            description="Vas a poder pedirle métricas a tus startups apenas te unas a un fondo."
          />
        </div>
      </AppLayout>
    );
  }

  const companies = portfolio_company_ids.map((id, i) => ({ id, name: portfolio_company_names[i] ?? "—" }));
  return <FundMetricRequirementsContent companies={companies} />;
}

function FundMetricRequirementsContent({ companies }: { companies: { id: string; name: string }[] }) {
  const { requirements, loading } = useMetricRequirements();
  const { coverage } = useMetricRequirementCoverage();
  const { upsertRequirement, setMandatory, deleteRequirement, saving } = useMetricRequirementMutations();

  const coverageById = useMemo(() => {
    const map = new Map<string, MetricRequirementCoverage>();
    for (const c of coverage) map.set(c.requirement_id, c);
    return map;
  }, [coverage]);

  const [editing, setEditing] = useState<Draft | null>(null);
  const [mandatoryTarget, setMandatoryTarget] = useState<MetricRequirement | null>(null);
  const [mandatoryTargetIds, setMandatoryTargetIds] = useState<string[]>([]);
  const [effectiveFrom, setEffectiveFrom] = useState(currentPeriodString());
  const [unmarking, setUnmarking] = useState<MetricRequirement | null>(null);
  const [deleting, setDeleting] = useState<MetricRequirement | null>(null);

  const openCreate = () => setEditing(emptyDraft());
  const openEdit = (r: MetricRequirement) => setEditing(draftFromRequirement(r));

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim() || !editing.unit.trim()) return;
    const id = await upsertRequirement({
      requirement_id: editing.requirement_id,
      name: editing.name.trim(),
      description: editing.description.trim() || undefined,
      why_it_matters: editing.why_it_matters.trim() || undefined,
      unit: editing.unit.trim(),
      value_type: editing.value_type,
      periodicity: editing.periodicity,
    });
    if (id) setEditing(null);
  };

  const openMandatoryDialog = (r: MetricRequirement) => {
    setMandatoryTargetIds(r.target_startup_ids ?? []);
    setEffectiveFrom(r.effective_from ?? currentPeriodString());
    setMandatoryTarget(r);
  };

  const confirmMandatory = async () => {
    if (!mandatoryTarget) return;
    const ok = await setMandatory({
      requirement_id: mandatoryTarget.requirement_id,
      mandatory: true,
      target_startup_ids: mandatoryTargetIds.length > 0 ? mandatoryTargetIds : undefined,
      effective_from: effectiveFrom,
    });
    if (ok) setMandatoryTarget(null);
  };

  const confirmUnmark = async () => {
    if (!unmarking) return;
    const ok = await setMandatory({ requirement_id: unmarking.requirement_id, mandatory: false });
    if (ok) setUnmarking(null);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const ok = await deleteRequirement(deleting.requirement_id);
    if (ok) setDeleting(null);
  };

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-8 py-12 space-y-8">
        <PageHeader
          title="Gestión"
          subtitle="Lo que le pedís a las startups de tu portfolio"
        />

        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <h2 className="text-sm font-medium text-foreground">Métricas</h2>
          <Button onClick={openCreate} size="sm">
            <Plus size={14} strokeWidth={1.5} className="mr-2" /> Nuevo requisito
          </Button>
        </div>

        {loading ? (
          <div className="border border-border rounded-lg divide-y divide-border animate-pulse">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 bg-surface" />
            ))}
          </div>
        ) : requirements.length === 0 ? (
          <EmptyState
            icon={SlidersHorizontal}
            title="Todavía no le pediste nada a tu portfolio."
            description="Un requisito define qué querés medir (nombre, unidad, periodicidad) — cada startup decide después cómo lo calcula con sus propios datos."
            action={{ label: "Crear el primero", onClick: openCreate }}
          />
        ) : (
          <div className="border border-border rounded-lg bg-card divide-y divide-border overflow-hidden">
            {requirements.map((r) => {
              const cov = coverageById.get(r.requirement_id);
              const target = cov?.target_count ?? companies.length;
              const percent = target > 0 ? ((cov?.ok_count ?? 0) / target) * 100 : 0;
              return (
                <div key={r.requirement_id} className="flex flex-col sm:flex-row sm:items-center gap-4 px-5 py-4">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <CoverageRing
                      percent={percent}
                      label={target > 0 ? `${cov?.ok_count ?? 0}/${target}` : "—"}
                      tone={r.mandatory ? coverageTone(percent, target) : "muted"}
                      size={44}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-foreground truncate">{r.name}</span>
                        {r.mandatory && (
                          <Badge variant="default" className="text-[10px]">
                            Obligatorio
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {r.unit} · {PERIODICITY_LABELS[r.periodicity]}
                        {r.description ? ` · ${r.description}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 shrink-0 sm:pl-4">
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={r.mandatory}
                        onCheckedChange={(checked) => (checked ? openMandatoryDialog(r) : setUnmarking(r))}
                        aria-label={r.mandatory ? "Desmarcar como obligatorio" : "Marcar como obligatorio"}
                      />
                      <span className="text-xs text-muted-foreground hidden sm:inline">Obligatorio</span>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" aria-label={`Más acciones para ${r.name}`}>
                          <MoreVertical size={16} strokeWidth={1.5} />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => openEdit(r)}>
                          <Pencil size={14} strokeWidth={1.5} className="mr-2" /> Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setDeleting(r)} className="text-destructive focus:text-destructive">
                          <Trash2 size={14} strokeWidth={1.5} className="mr-2" /> Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Crear / editar definición — nunca pide fórmula, el fondo no calcula */}
      <FormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title={editing?.requirement_id ? "Editar requisito" : "Nuevo requisito"}
        description="Definí qué necesitás medir. Cada startup decide cómo lo calcula con sus propios datos — vos solo vas a ver el valor final."
        onSubmit={save}
        submitLabel={editing?.requirement_id ? "Guardar" : "Crear"}
        busy={saving}
      >
        {editing && (
          <>
            <FormField label="Nombre">
              <Input
                autoFocus
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                placeholder="Ej: Net Revenue Retention"
              />
            </FormField>
            <FormField label="Descripción" helpText="Le sirve al founder para entender qué le pedís, y al asistente para ayudarlo a construir el cálculo.">
              <Textarea
                value={editing.description}
                onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                placeholder="Qué es y cómo se espera que se mida"
                rows={2}
              />
            </FormField>
            <FormField label="Por qué importa" helpText="Opcional">
              <Textarea
                value={editing.why_it_matters}
                onChange={(e) => setEditing({ ...editing, why_it_matters: e.target.value })}
                rows={2}
              />
            </FormField>
            <div className="grid grid-cols-3 gap-3">
              <FormField label="Unidad">
                <Input
                  value={editing.unit}
                  onChange={(e) => setEditing({ ...editing, unit: e.target.value })}
                  placeholder="%, USD..."
                />
              </FormField>
              <FormField label="Tipo de valor">
                <Select
                  value={editing.value_type}
                  onValueChange={(v: MetricValueType) => setEditing({ ...editing, value_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(VALUE_TYPE_LABELS) as MetricValueType[]).map((v) => (
                      <SelectItem key={v} value={v}>{VALUE_TYPE_LABELS[v]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="Periodicidad">
                <Select
                  value={editing.periodicity}
                  onValueChange={(v: MetricPeriodicity) => setEditing({ ...editing, periodicity: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PERIODICITY_LABELS) as MetricPeriodicity[]).map((p) => (
                      <SelectItem key={p} value={p}>{PERIODICITY_LABELS[p]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </div>
          </>
        )}
      </FormDialog>

      {/* Marcar como obligatorio — a quién aplica y desde cuándo */}
      <FormDialog
        open={!!mandatoryTarget}
        onOpenChange={(o) => !o && setMandatoryTarget(null)}
        title={`Marcar "${mandatoryTarget?.name ?? ""}" como obligatorio`}
        description="Se va a exigir a las startups elegidas desde el período que indiques. Los períodos anteriores nunca cuentan como incumplimiento."
        onSubmit={confirmMandatory}
        submitLabel="Marcar como obligatorio"
        busy={saving}
      >
        <FormField label="Vigente desde">
          <Input
            type="month"
            value={effectiveFrom}
            onChange={(e) => setEffectiveFrom(e.target.value)}
          />
        </FormField>
        <FormField label="Startups a las que aplica">
          <p className="text-xs text-muted-foreground mb-2">Sin seleccionar ninguna = aplica a todas tus startups conectadas, incluidas las que se conecten después.</p>
          {companies.length === 0 ? (
            <p className="text-xs text-muted-foreground">Todavía no tenés startups conectadas.</p>
          ) : (
            <div className="max-h-40 overflow-y-auto border border-border rounded-md divide-y divide-border">
              {companies.map((c) => (
                <label key={c.id} className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer">
                  <Checkbox
                    checked={mandatoryTargetIds.includes(c.id)}
                    onCheckedChange={() =>
                      setMandatoryTargetIds((prev) =>
                        prev.includes(c.id) ? prev.filter((x) => x !== c.id) : [...prev, c.id]
                      )
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          )}
        </FormField>
      </FormDialog>

      <ConfirmationDialog
        open={!!unmarking}
        onOpenChange={(o) => !o && setUnmarking(null)}
        title={`¿Dejar de exigir "${unmarking?.name ?? ""}"?`}
        description="Deja de ser obligatorio para tus startups y sale del dashboard comparativo. Las métricas que ya vincularon las startups no se tocan — siguen siendo suyas."
        confirmLabel="Dejar de exigir"
        onConfirm={confirmUnmark}
        busy={saving}
      />

      <ConfirmationDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`¿Eliminar "${deleting?.name ?? ""}"?`}
        description="Se elimina el requisito y se limpian los links de las startups que lo habían vinculado — sus métricas propias no se tocan."
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={confirmDelete}
        busy={saving}
      />
    </AppLayout>
  );
}
