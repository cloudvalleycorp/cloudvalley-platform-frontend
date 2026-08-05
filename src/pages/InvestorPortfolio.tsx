import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRoadmapCatalogMutations } from "@/hooks/useRoadmapCatalogMutations";
import { LIST_ROADMAP_PILLARS_URL, CRITICALITY_LABELS, type Criticality, type RoadmapPillar } from "@/lib/roadmap";
import { Building2, Plus } from "lucide-react";

type RequirementDraft = {
  pillar_id: string;
  title: string;
  criticality: Criticality;
  requires_doc: boolean;
  requires_report: boolean;
  targetIds: string[];
};
function emptyRequirementDraft(pillarId: string): RequirementDraft {
  return { pillar_id: pillarId, title: "", criticality: "recommended", requires_doc: false, requires_report: false, targetIds: [] };
}

export default function InvestorPortfolio() {
  const {
    user,
    loading,
    isOrgViewer,
    fund_id,
    portfolio_company_ids,
    portfolio_company_names,
    email,
  } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [reopen, setReopen] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isOrgViewer) return <Navigate to="/dashboard" replace />;

  if (!fund_id) {
    if (!dismissed || reopen) {
      return (
        <AppLayout>
          <NoMembershipScreen
            role="investor"
            email={email}
            onDismiss={() => {
              setDismissed(true);
              setReopen(false);
            }}
          />
        </AppLayout>
      );
    }
    return (
      <AppLayout>
        <div className="max-w-6xl mx-auto px-8 py-12">
          <NoMembershipBanner role="investor" onOpen={() => setReopen(true)} />
          <EmptyState
            icon={Building2}
            title="No hay portfolio para mostrar."
            description="Vas a ver acá las empresas de tu fondo apenas te unas a uno."
          />
        </div>
      </AppLayout>
    );
  }

  const companies = portfolio_company_ids.map((id, i) => ({
    id,
    name: portfolio_company_names[i] ?? "—",
  }));

  return (
    <InvestorPortfolioContent companies={companies} />
  );
}

function InvestorPortfolioContent({ companies }: { companies: { id: string; name: string }[] }) {
  const { upsertTask } = useRoadmapCatalogMutations();

  const { data: pillars = [] } = useQuery({
    queryKey: ["roadmap-pillars"],
    queryFn: async () => {
      const res = await fetch(LIST_ROADMAP_PILLARS_URL, { credentials: "include" });
      if (!res.ok) return [] as RoadmapPillar[];
      const data = await res.json();
      return Array.isArray(data?.pillars) ? (data.pillars as RoadmapPillar[]) : [];
    },
  });

  const [draft, setDraft] = useState<RequirementDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!draft) return;
    if (!draft.title.trim() || !draft.pillar_id) {
      toast.error("Título y pilar son obligatorios");
      return;
    }
    setSaving(true);
    const ok = await upsertTask({
      pillar_id: draft.pillar_id,
      title: draft.title.trim(),
      criticality: draft.criticality,
      requires_doc: draft.requires_doc,
      requires_report: draft.requires_report,
      order_index: 0,
      target_startup_ids: draft.targetIds.length > 0 ? draft.targetIds : undefined,
    });
    setSaving(false);
    if (ok) setDraft(null);
  };

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-8">
        <PageHeader
          title="Portfolio"
          subtitle={`${companies.length} empresa${companies.length === 1 ? "" : "s"}`}
          action={
            pillars.length > 0 && (
              <Button variant="outline" onClick={() => setDraft(emptyRequirementDraft(pillars[0].id))}>
                <Plus size={14} strokeWidth={1.5} className="mr-2" /> Agregar requisito
              </Button>
            )
          }
        />

        {companies.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Tu fondo todavía no tiene empresas conectadas."
            description="Las conexiones con startups se gestionan desde Conexiones. Cuando tu fondo conecte con una, va a aparecer acá."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map((c) => (
              <Link
                key={c.id}
                to={`/portfolio/${c.id}`}
                className="border border-border rounded-lg p-5 bg-card hover:border-foreground/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="text-base font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground mt-1">Ver detalle</div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <FormDialog
        open={!!draft}
        onOpenChange={(o) => !o && setDraft(null)}
        title="Agregar requisito para el portfolio"
        description="Se suma al roadmap de las startups elegidas — no cuenta para su readiness score, que se calcula solo con el catálogo estándar."
        onSubmit={save}
        submitLabel="Agregar"
        busy={saving}
        contentClassName="sm:max-w-lg"
      >
        {draft && (
          <>
            <FormField label="Pilar">
              <Select value={draft.pillar_id} onValueChange={(v) => setDraft({ ...draft, pillar_id: v })}>
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
                value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                placeholder="Ej: Subir cap table actualizada"
              />
            </FormField>
            <FormField label="Criticidad">
              <Select value={draft.criticality} onValueChange={(v: Criticality) => setDraft({ ...draft, criticality: v })}>
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
            <FormField label="Startups a las que aplica">
              <p className="text-xs text-muted-foreground mb-2">
                Sin seleccionar ninguna = aplica a todo tu portfolio conectado.
              </p>
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
          </>
        )}
      </FormDialog>
    </AppLayout>
  );
}