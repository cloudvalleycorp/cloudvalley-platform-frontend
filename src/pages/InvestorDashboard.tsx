import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { PeriodSelect } from "@/components/metrics/PeriodSelect";
import { PortfolioMetricBarChart } from "@/components/investor/PortfolioMetricBarChart";
import { useMetricRequirements } from "@/hooks/useMetricRequirements";
import { useMetricRequirementCoverage } from "@/hooks/useMetricRequirementCoverage";
import { usePortfolioMetricsDashboard } from "@/hooks/usePortfolioMetricsDashboard";
import {
  formatRequirementValue,
  PERIODICITY_LABELS,
  type MetricRequirement,
  type MetricRequirementCoverage,
  type PortfolioAggregateEntry,
} from "@/lib/metricRequirements";
import { toPeriodString } from "@/lib/metricPeriod";
import { BarChart3, SlidersHorizontal } from "lucide-react";

export default function InvestorDashboard() {
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
        <div className="max-w-6xl mx-auto px-8 py-12">
          <NoMembershipBanner role="investor" onOpen={() => setReopen(true)} />
          <EmptyState icon={BarChart3} title="Todavía no hay nada para mostrar." description="Vas a ver el dashboard de tu portfolio apenas te unas a un fondo." />
        </div>
      </AppLayout>
    );
  }

  const companies = portfolio_company_ids.map((id, i) => ({ id, name: portfolio_company_names[i] ?? "—" }));
  return <InvestorDashboardContent companies={companies} />;
}

function InvestorDashboardContent({ companies }: { companies: { id: string; name: string }[] }) {
  const now = new Date();
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const periodString = toPeriodString(period.month, period.year);

  const { requirements } = useMetricRequirements();
  const mandatory = useMemo(() => requirements.filter((r) => r.mandatory), [requirements]);
  const { coverage } = useMetricRequirementCoverage();
  const coverageById = useMemo(() => {
    const map = new Map<string, MetricRequirementCoverage>();
    for (const c of coverage) map.set(c.requirement_id, c);
    return map;
  }, [coverage]);

  const { rows, portfolioAggregates, forbidden, rateLimited } = usePortfolioMetricsDashboard(
    periodString,
    mandatory.map((r) => r.requirement_id)
  );
  const rowByKey = useMemo(() => {
    const map = new Map<string, (typeof rows)[number]>();
    for (const row of rows) map.set(`${row.company_id}|${row.requirement_id}`, row);
    return map;
  }, [rows]);

  // Solo métricas numéricas se pueden graficar — value_type="text" no tiene
  // magnitud que comparar en un gráfico de barras. Un gráfico por métrica
  // obligatoria, todos visibles a la vez (no un selector que muestra una).
  const chartable = useMemo(() => mandatory.filter((r) => r.value_type !== "text"), [mandatory]);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-6">
        <PageHeader
          title="Dashboard"
          subtitle="Comparación visual del portfolio, a partir de tus métricas obligatorias"
          action={chartable.length > 0 ? <PeriodSelect period={period} onChange={setPeriod} /> : undefined}
        />

        {companies.length === 0 ? (
          <EmptyState
            icon={BarChart3}
            title="Tu fondo todavía no tiene empresas conectadas."
            description="Las conexiones con startups se gestionan desde Conexiones."
          />
        ) : chartable.length === 0 ? (
          <EmptyState
            icon={SlidersHorizontal}
            title="Todavía no hay métricas obligatorias para comparar."
            description="Creá un requisito y marcalo como obligatorio desde Gestión — ahí vas a poder elegir cuáles startups lo tienen que reportar."
          />
        ) : rateLimited ? (
          <EmptyState icon={BarChart3} title="Esperá un momento." description="Se alcanzó el límite de consultas para tu fondo — reintentá en unos minutos." />
        ) : forbidden ? (
          <EmptyState icon={BarChart3} title="No se pudo cargar el dashboard." description="Reintentá en unos minutos." />
        ) : (
          <div className="space-y-6">
            {chartable.map((metric) => (
              <MetricChartCard
                key={metric.requirement_id}
                metric={metric}
                coverage={coverageById.get(metric.requirement_id)}
                average={portfolioAggregates[metric.requirement_id]?.[periodString]?.avg}
                rows={companies.map((c) => {
                  const row = rowByKey.get(`${c.id}|${metric.requirement_id}`);
                  return {
                    name: c.name,
                    value: row?.values[periodString] ?? null,
                    status: row?.compliance_status[periodString] ?? "unfulfilled",
                  };
                })}
              />
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function MetricChartCard({
  metric,
  coverage,
  average,
  rows,
}: {
  metric: MetricRequirement;
  coverage: MetricRequirementCoverage | undefined;
  average: PortfolioAggregateEntry["avg"] | undefined;
  rows: { name: string; value: number | null; status: string }[];
}) {
  return (
    <div className="border border-border rounded-lg bg-card p-5">
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-4">
        <h2 className="text-sm font-medium text-foreground">{metric.name}</h2>
        <p className="text-xs text-muted-foreground tabular-nums">
          {coverage ? `${coverage.ok_count}/${coverage.target_count} al día` : "—"}
          {" · "}
          {PERIODICITY_LABELS[metric.periodicity]}
          {average !== undefined && ` · promedio ${formatRequirementValue(average, metric)}`}
          {coverage?.last_updated_period && ` · último dato ${coverage.last_updated_period}`}
        </p>
      </div>
      <PortfolioMetricBarChart requirement={metric} rows={rows} />
    </div>
  );
}
