import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { AddRoadmapTaskDialog } from "@/components/roadmap/AddRoadmapTaskDialog";
import { PeriodSelect } from "@/components/metrics/PeriodSelect";
import { ComplianceStatusPill } from "@/components/investor/ComplianceStatusPill";
import { LIST_ROADMAP_PILLARS_URL, type RoadmapPillar } from "@/lib/roadmap";
import { useMetricRequirements } from "@/hooks/useMetricRequirements";
import { useMetricRequirementCoverage } from "@/hooks/useMetricRequirementCoverage";
import { usePortfolioMetricsDashboard } from "@/hooks/usePortfolioMetricsDashboard";
import { formatRequirementValue, PERIODICITY_LABELS } from "@/lib/metricRequirements";
import { toPeriodString } from "@/lib/metricPeriod";
import { Building2, Plus, SlidersHorizontal, ArrowRight } from "lucide-react";

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

  return <InvestorPortfolioContent companies={companies} />;
}

function InvestorPortfolioContent({ companies }: { companies: { id: string; name: string }[] }) {
  const navigate = useNavigate();
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
  const now = new Date();
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const periodString = toPeriodString(period.month, period.year);

  const { requirements } = useMetricRequirements();
  const mandatory = useMemo(() => requirements.filter((r) => r.mandatory), [requirements]);
  const { coverage } = useMetricRequirementCoverage();
  const coverageById = useMemo(() => {
    const map = new Map<string, { ok_count: number; target_count: number }>();
    for (const c of coverage) map.set(c.requirement_id, c);
    return map;
  }, [coverage]);

  const { rows, loading: dashLoading, forbidden } = usePortfolioMetricsDashboard(
    periodString,
    mandatory.map((r) => r.requirement_id)
  );
  const rowByKey = useMemo(() => {
    const map = new Map<string, (typeof rows)[number]>();
    for (const row of rows) map.set(`${row.company_id}|${row.requirement_id}`, row);
    return map;
  }, [rows]);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-8">
        <PageHeader
          title="Portfolio"
          subtitle={`${companies.length} empresa${companies.length === 1 ? "" : "s"}`}
          action={
            pillars.length > 0 && (
              <Button variant="outline" onClick={() => setAddingRequirement(true)}>
                <Plus size={14} strokeWidth={1.5} className="mr-2" /> Agregar requisito de roadmap
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
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <h2 className="text-sm font-medium text-foreground">Métricas obligatorias</h2>
              <div className="flex items-center gap-2">
                {mandatory.length > 0 && <PeriodSelect period={period} onChange={setPeriod} />}
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/requisitos">
                    Gestionar requisitos <ArrowRight size={13} strokeWidth={1.5} className="ml-1.5" />
                  </Link>
                </Button>
              </div>
            </div>

            {mandatory.length === 0 ? (
              <EmptyState
                icon={SlidersHorizontal}
                title="Todavía no marcaste ninguna métrica como obligatoria."
                description="Definí qué necesitás medir de tu portfolio — cada startup decide después cómo lo calcula con sus propios datos."
                action={{ label: "Crear un requisito", onClick: () => navigate("/requisitos") }}
              />
            ) : forbidden ? (
              <EmptyState icon={Building2} title="No se pudo cargar el dashboard." description="Reintentá en unos minutos." />
            ) : (
              <div className="border border-border rounded-lg bg-card overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs text-muted-foreground border-b border-border">
                      <th className="text-left font-normal px-4 py-3">Empresa</th>
                      {mandatory.map((r) => {
                        const cov = coverageById.get(r.requirement_id);
                        return (
                          <th key={r.requirement_id} className="text-right font-normal px-4 py-3">
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-foreground font-medium">{r.name}</span>
                              <span className="text-[10px] text-tertiary">
                                {PERIODICITY_LABELS[r.periodicity]}
                                {cov ? ` · ${cov.ok_count}/${cov.target_count}` : ""}
                              </span>
                            </div>
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody>
                    {dashLoading
                      ? companies.map((c) => (
                          <tr key={c.id} className="border-t border-border/50">
                            <td className="px-4 py-3 text-sm font-medium">{c.name}</td>
                            <td colSpan={mandatory.length} className="px-4 py-3 text-xs text-muted-foreground">
                              Cargando…
                            </td>
                          </tr>
                        ))
                      : companies.map((c) => (
                          <tr key={c.id} className="border-t border-border/50">
                            <td className="px-4 py-3 text-sm font-medium">
                              <Link to={`/portfolio/${c.id}`} className="hover:underline">
                                {c.name}
                              </Link>
                            </td>
                            {mandatory.map((r) => {
                              const row = rowByKey.get(`${c.id}|${r.requirement_id}`);
                              const value = row?.values[periodString] ?? null;
                              const status = row?.compliance_status[periodString] ?? "unfulfilled";
                              return (
                                <td key={r.requirement_id} className="px-4 py-3 text-right">
                                  <div className="flex flex-col items-end gap-1">
                                    <span className="tabular-nums text-foreground">
                                      {formatRequirementValue(value, r)}
                                    </span>
                                    <ComplianceStatusPill status={status} />
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>

      <AddRoadmapTaskDialog
        open={addingRequirement}
        onOpenChange={setAddingRequirement}
        pillars={pillars}
        defaultPillarId={pillars[0]?.id ?? ""}
        title="Agregar requisito para el portfolio"
        description="Se suma al roadmap de las startups elegidas, no cuenta para su readiness score, que se calcula solo con el catálogo estándar."
        onSaved={() => {}}
        companies={companies}
      />
    </AppLayout>
  );
}
