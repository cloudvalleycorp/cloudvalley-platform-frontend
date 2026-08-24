import { useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { AddRoadmapTaskDialog } from "@/components/roadmap/AddRoadmapTaskDialog";
import { RangeSelect } from "@/components/investor/RangeSelect";
import { PortfolioMetricBarChart } from "@/components/investor/PortfolioMetricBarChart";
import { ComplianceStatusPill } from "@/components/investor/ComplianceStatusPill";
import { LIST_ROADMAP_PILLARS_URL, type RoadmapPillar } from "@/lib/roadmap";
import { useMetricRequirements } from "@/hooks/useMetricRequirements";
import { useMetricRequirementCoverage } from "@/hooks/useMetricRequirementCoverage";
import { usePortfolioMetricsDashboard } from "@/hooks/usePortfolioMetricsDashboard";
import {
  formatRequirementValue,
  PERIODICITY_LABELS,
  type MetricRequirement,
  type MetricRequirementCoverage,
} from "@/lib/metricRequirements";
import type { RelativeRange } from "@/lib/portfolioIntelligence";
import { toPeriodString } from "@/lib/metricPeriod";
import { Building2, Plus, SlidersHorizontal, ArrowRight } from "lucide-react";

type ViewMode = "list" | "compare";
type CompareMode = "snapshot" | "trend" | "benchmark";

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
  const [searchParams, setSearchParams] = useSearchParams();
  const mode: ViewMode = searchParams.get("mode") === "compare" ? "compare" : "list";
  const setMode = (m: ViewMode) => setSearchParams(m === "list" ? {} : { mode: "compare" }, { replace: true });

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
  const { requirements } = useMetricRequirements();
  const mandatory = useMemo(() => requirements.filter((r) => r.mandatory), [requirements]);
  const { coverage } = useMetricRequirementCoverage();
  const coverageById = useMemo(() => {
    const map = new Map<string, MetricRequirementCoverage>();
    for (const c of coverage) map.set(c.requirement_id, c);
    return map;
  }, [coverage]);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-6">
        <PageHeader
          title="Portfolio"
          subtitle={`${companies.length} empresa${companies.length === 1 ? "" : "s"}`}
          action={
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" asChild>
                <Link to="/requisitos">
                  <SlidersHorizontal size={13} strokeWidth={1.5} className="mr-1.5" /> Gestionar métricas
                </Link>
              </Button>
              {pillars.length > 0 && (
                <Button variant="outline" onClick={() => setAddingRequirement(true)}>
                  <Plus size={14} strokeWidth={1.5} className="mr-2" /> Agregar requisito de roadmap
                </Button>
              )}
            </div>
          }
        />

        {companies.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Tu fondo todavía no tiene empresas conectadas."
            description="Las conexiones con startups se gestionan desde Conexiones. Cuando tu fondo conecte con una, va a aparecer acá."
          />
        ) : mandatory.length === 0 ? (
          <EmptyState
            icon={SlidersHorizontal}
            title="Todavía no marcaste ninguna métrica como obligatoria."
            description="Definí qué necesitás medir de tu portfolio — cada startup decide después cómo lo calcula con sus propios datos."
            action={{ label: "Crear un requisito", onClick: () => navigate("/requisitos") }}
          />
        ) : (
          <>
            <ToggleGroup type="single" value={mode} onValueChange={(v) => v && setMode(v as ViewMode)} className="justify-start">
              <ToggleGroupItem value="list" size="sm" className="text-xs px-3">Lista</ToggleGroupItem>
              <ToggleGroupItem value="compare" size="sm" className="text-xs px-3">Comparar</ToggleGroupItem>
            </ToggleGroup>

            {mode === "list" ? (
              <PortfolioListView companies={companies} mandatory={mandatory} coverageById={coverageById} />
            ) : (
              <PortfolioCompareView companies={companies} mandatory={mandatory} coverageById={coverageById} />
            )}
          </>
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

// Modo Lista — roster comparativo, período actual solamente (snapshot de
// "cómo estamos hoy"). Fusiona lo que antes era la única vista de /portfolio.
function PortfolioListView({
  companies,
  mandatory,
  coverageById,
}: {
  companies: { id: string; name: string }[];
  mandatory: MetricRequirement[];
  coverageById: Map<string, MetricRequirementCoverage>;
}) {
  const now = new Date();
  const periodString = toPeriodString(now.getMonth() + 1, now.getFullYear());
  const { rows, loading, forbidden } = usePortfolioMetricsDashboard(
    { period: periodString },
    { requirementIds: mandatory.map((r) => r.requirement_id) }
  );
  const rowByKey = useMemo(() => {
    const map = new Map<string, (typeof rows)[number]>();
    for (const row of rows) map.set(`${row.company_id}|${row.requirement_id}`, row);
    return map;
  }, [rows]);

  if (forbidden) {
    return <EmptyState icon={Building2} title="No se pudo cargar el dashboard." description="Reintentá en unos minutos." />;
  }

  return (
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
          {loading
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
                    <Link to={`/companies/${c.id}`} className="hover:underline">
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
                          <span className="tabular-nums text-foreground">{formatRequirementValue(value, r)}</span>
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
  );
}

// Modo Comparar — Snapshot/Trend/Benchmark como el mismo mecanismo (un
// toggle, no tres pantallas), sobre el rango relativo nuevo. Reemplaza lo
// que antes era /analiticas. Selección de empresas/métricas queda en "todas
// las obligatorias comparables" por ahora — el picker manual queda como
// mejora siguiente, no bloquea esta versión.
function PortfolioCompareView({
  companies,
  mandatory,
  coverageById,
}: {
  companies: { id: string; name: string }[];
  mandatory: MetricRequirement[];
  coverageById: Map<string, MetricRequirementCoverage>;
}) {
  const [range, setRange] = useState<RelativeRange>({ kind: "last_6_months" });
  const [compareMode, setCompareMode] = useState<CompareMode>("snapshot");
  // Vacío = ninguna deseleccionada = se grafican todas — evita tener que
  // resincronizar una lista de "incluidas" cada vez que cambia el catálogo
  // de requisitos obligatorios.
  const [excludedMetricIds, setExcludedMetricIds] = useState<Set<string>>(new Set());

  // Solo métricas numéricas se pueden graficar — value_type="text" no tiene
  // magnitud que comparar en un gráfico de barras.
  const chartable = useMemo(() => mandatory.filter((r) => r.value_type !== "text"), [mandatory]);
  const selectedMetrics = useMemo(
    () => chartable.filter((r) => !excludedMetricIds.has(r.requirement_id)),
    [chartable, excludedMetricIds]
  );
  const toggleMetric = (id: string) =>
    setExcludedMetricIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const { rows, periods, portfolioAggregates, forbidden, rateLimited } = usePortfolioMetricsDashboard(range.kind === "custom" ? { range: "custom", from: range.from ?? "", to: range.to ?? "" } : { range: range.kind }, {
    requirementIds: selectedMetrics.map((r) => r.requirement_id),
  });
  const latestPeriod = periods.at(-1);

  const rowByKey = useMemo(() => {
    const map = new Map<string, (typeof rows)[number]>();
    for (const row of rows) map.set(`${row.company_id}|${row.requirement_id}`, row);
    return map;
  }, [rows]);

  if (chartable.length === 0) {
    return (
      <EmptyState
        icon={SlidersHorizontal}
        title="Ninguna métrica obligatoria es numérica todavía."
        description="Las métricas de tipo texto no se pueden graficar — creá una de tipo dinero, número o porcentaje."
      />
    );
  }
  if (rateLimited) {
    return <EmptyState icon={Building2} title="Esperá un momento." description="Se alcanzó el límite de consultas para tu fondo — reintentá en unos minutos." />;
  }
  if (forbidden) {
    return <EmptyState icon={Building2} title="No se pudo cargar el dashboard." description="Reintentá en unos minutos." />;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <RangeSelect value={range} onChange={setRange} />
        <ToggleGroup type="single" value={compareMode} onValueChange={(v) => v && setCompareMode(v as CompareMode)} className="justify-start">
          <ToggleGroupItem value="snapshot" size="sm" className="text-xs px-3">Snapshot</ToggleGroupItem>
          <ToggleGroupItem value="trend" size="sm" className="text-xs px-3">Trend</ToggleGroupItem>
          <ToggleGroupItem value="benchmark" size="sm" className="text-xs px-3">Benchmark</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {chartable.length > 1 && (
        <div className="flex flex-wrap gap-1.5">
          {chartable.map((metric) => {
            const active = !excludedMetricIds.has(metric.requirement_id);
            return (
              <button
                key={metric.requirement_id}
                type="button"
                onClick={() => toggleMetric(metric.requirement_id)}
                aria-pressed={active}
                className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                  active
                    ? "bg-primary/10 border-primary/30 text-primary font-medium"
                    : "bg-transparent border-border text-muted-foreground hover:border-foreground/30"
                }`}
              >
                {metric.name}
              </button>
            );
          })}
        </div>
      )}

      {selectedMetrics.length === 0 ? (
        <EmptyState
          icon={SlidersHorizontal}
          title="Deseleccionaste todas las métricas."
          description="Elegí al menos una arriba para ver la comparación."
        />
      ) : compareMode === "trend" ? (
        <PortfolioTrendView metrics={selectedMetrics} companies={companies} rowByKey={rowByKey} periods={periods} />
      ) : (
        <div className="space-y-6">
          {selectedMetrics.map((metric) => {
            const cov = coverageById.get(metric.requirement_id);
            const period = latestPeriod;
            const average = period ? portfolioAggregates[metric.requirement_id]?.[period]?.avg : undefined;
            return (
              <div key={metric.requirement_id} className="border border-border rounded-lg bg-card p-5">
                <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1 mb-4">
                  <h2 className="text-sm font-medium text-foreground">{metric.name}</h2>
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {cov ? `${cov.ok_count}/${cov.target_count} al día` : "—"}
                    {" · "}
                    {PERIODICITY_LABELS[metric.periodicity]}
                    {compareMode === "benchmark" && average !== undefined && ` · promedio ${formatRequirementValue(average, metric)}`}
                  </p>
                </div>
                <PortfolioMetricBarChart
                  requirement={metric}
                  rows={companies.map((c) => {
                    const row = rowByKey.get(`${c.id}|${metric.requirement_id}`);
                    return {
                      name: c.name,
                      value: period ? row?.values[period] ?? null : null,
                      status: period ? row?.compliance_status[period] ?? "unfulfilled" : "unfulfilled",
                    };
                  })}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Serie temporal simple, una empresa por línea — cobertura mínima de
// "Trend" (evolución histórica), sin selector de línea individual todavía.
function PortfolioTrendView({
  metrics,
  companies,
  rowByKey,
  periods,
}: {
  metrics: MetricRequirement[];
  companies: { id: string; name: string }[];
  rowByKey: Map<string, { values: Record<string, number | null> }>;
  periods: string[];
}) {
  if (periods.length < 2) {
    return <EmptyState icon={SlidersHorizontal} title="No hay suficientes períodos en este rango." description="Elegí un rango más amplio para ver la tendencia." />;
  }
  return (
    <div className="space-y-6">
      {metrics.map((metric) => (
        <div key={metric.requirement_id} className="border border-border rounded-lg bg-card p-5">
          <h2 className="text-sm font-medium text-foreground mb-4">{metric.name}</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-xs tabular-nums">
              <thead>
                <tr className="text-muted-foreground">
                  <th className="text-left font-normal py-1 pr-3">Empresa</th>
                  {periods.map((p) => (
                    <th key={p} className="text-right font-normal py-1 px-2 whitespace-nowrap">{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {companies.map((c) => {
                  const row = rowByKey.get(`${c.id}|${metric.requirement_id}`);
                  return (
                    <tr key={c.id} className="border-t border-border/50">
                      <td className="py-1.5 pr-3 text-foreground font-medium whitespace-nowrap">{c.name}</td>
                      {periods.map((p) => {
                        const v = row?.values[p];
                        return (
                          <td key={p} className="text-right py-1.5 px-2 text-foreground">
                            {v !== null && v !== undefined ? formatRequirementValue(v, metric) : "Sin reportar"}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}
