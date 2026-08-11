import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { AddRoadmapTaskDialog } from "@/components/roadmap/AddRoadmapTaskDialog";
import { PortfolioMetricsRow, PORTFOLIO_COMPARISON_METRICS } from "@/components/investor/PortfolioMetricsRow";
import { LIST_ROADMAP_PILLARS_URL, type RoadmapPillar } from "@/lib/roadmap";
import { Building2, Plus } from "lucide-react";

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
  const { data: pillars = [] } = useQuery({
    queryKey: ["roadmap-pillars"],
    queryFn: async () => {
      const res = await fetch(LIST_ROADMAP_PILLARS_URL, { credentials: "include" });
      if (!res.ok) return [] as RoadmapPillar[];
      const data = await res.json();
      return Array.isArray(data?.pillars) ? (data.pillars as RoadmapPillar[]) : [];
    },
  });

  const [addingRequirement, setAddingRequirement] = useState(false);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-8">
        <PageHeader
          title="Portfolio"
          subtitle={`${companies.length} empresa${companies.length === 1 ? "" : "s"}`}
          action={
            pillars.length > 0 && (
              <Button variant="outline" onClick={() => setAddingRequirement(true)}>
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
          <div className="border border-border rounded-lg bg-card overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left font-normal px-4 py-3">Empresa</th>
                  {PORTFOLIO_COMPARISON_METRICS.map((m) => (
                    <th key={m.id} className="text-right font-normal px-4 py-3">
                      {m.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => (
                  <PortfolioMetricsRow key={c.id} companyId={c.id} companyName={c.name} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AddRoadmapTaskDialog
        open={addingRequirement}
        onOpenChange={setAddingRequirement}
        pillars={pillars}
        defaultPillarId={pillars[0]?.id ?? ""}
        title="Agregar requisito para el portfolio"
        description="Se suma al roadmap de las startups elegidas — no cuenta para su readiness score, que se calcula solo con el catálogo estándar."
        onSaved={() => {}}
        companies={companies}
      />
    </AppLayout>
  );
}