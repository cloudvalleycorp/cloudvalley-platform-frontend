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
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DataTableToolbar } from "@/components/DataTableToolbar";
import { SegmentFilterSelect } from "@/components/investor/SegmentFilterSelect";
import { AddRoadmapTaskDialog } from "@/components/roadmap/AddRoadmapTaskDialog";
import { RangeSelect } from "@/components/investor/RangeSelect";
import { PortfolioMetricBarChart } from "@/components/investor/PortfolioMetricBarChart";
import { ComplianceStatusPill } from "@/components/investor/ComplianceStatusPill";
import { LIST_ROADMAP_PILLARS_URL, type RoadmapPillar } from "@/lib/roadmap";
import { useMetricRequirements } from "@/hooks/useMetricRequirements";
import { useMetricRequirementCoverage } from "@/hooks/useMetricRequirementCoverage";
import { usePortfolioMetricsDashboard } from "@/hooks/usePortfolioMetricsDashboard";
import { useSegmentFilter } from "@/hooks/useSegmentFilter";
import {
  formatRequirementValue,
  PERIODICITY_LABELS,
  type MetricRequirement,
  type MetricRequirementCoverage,
} from "@/lib/metricRequirements";
import type { RelativeRange, Segment } from "@/lib/portfolioIntelligence";
import { toPeriodString } from "@/lib/metricPeriod";
import { Building2, Download, Plus, SlidersHorizontal, ArrowRight } from "lucide-react";

type ViewMode = "list" | "compare";
type CompareMode = "snapshot" | "trend" | "benchmark";
// company con logo opcional — solo el catálogo lo usa, Comparar/Trend lo
// ignoran (siguen recibiendo la misma forma {id,name}).
type PortfolioCompany = { id: string; name: string; logo_url?: string | null };

const PAGE_SIZE = 20;

export default function InvestorPortfolio() {
  const {
    user,
    loading,
    isOrgViewer,
    fund_id,
    portfolio_company_ids,
    portfolio_company_names,
    portfolio_companies,
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

  // Contrato confirmado por backend 2026-09-19: portfolio_companies (con
  // logo) reemplaza el zip manual de los dos arrays viejos — esos siguen
  // existiendo sin cambios, se usan como fallback defensivo si por lo que
  // sea todavía viniera vacío.
  const companies: PortfolioCompany[] =
    portfolio_companies.length > 0
      ? portfolio_companies.map((c) => ({ id: c.company_id, name: c.name, logo_url: c.logo_url }))
      : portfolio_company_ids.map((id, i) => ({ id, name: portfolio_company_names[i] ?? "—", logo_url: null }));

  return <InvestorPortfolioContent companies={companies} />;
}

function InvestorPortfolioContent({ companies }: { companies: PortfolioCompany[] }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // El toggle Lista/Comparar de antes ahora es navegación real del sidebar
  // (grupo colapsable "Portfolio" en AppSidebar.tsx, sub-ítems Catálogo/
  // Comparar apuntando a las mismas dos rutas por querystring) — no
  // escalaba como un switch inline perdido arriba a la derecha.
  const mode: ViewMode = searchParams.get("mode") === "compare" ? "compare" : "list";

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
  const { segments, selectedSegmentId, setSelectedSegmentId, filteredCompanies } = useSegmentFilter(companies);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-6">
        <PageHeader
          title="Portfolio"
          subtitle={`${filteredCompanies.length} empresa${filteredCompanies.length === 1 ? "" : "s"}`}
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
        ) : filteredCompanies.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Ninguna empresa de este segmento."
            description="Elegí otro segmento o volvé a Todos los segmentos."
          />
        ) : mode === "list" ? (
          <PortfolioCatalogView
            companies={filteredCompanies}
            mandatory={mandatory}
            segments={segments}
            selectedSegmentId={selectedSegmentId}
            onSegmentChange={setSelectedSegmentId}
          />
        ) : (
          <PortfolioCompareView
            companies={filteredCompanies}
            mandatory={mandatory}
            coverageById={coverageById}
            segments={segments}
            selectedSegmentId={selectedSegmentId}
            onSegmentChange={setSelectedSegmentId}
          />
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

// Catálogo — reemplaza la tabla densa de antes (Fase 8 del rediseño
// investor): grid de cards con identidad visual (logo + nombre) en vez de
// filas de tabla, buscador y export CSV. Cada card muestra SOLO los
// requisitos que de verdad le aplican a esa empresa vía target_startup_ids
// — no todas las startups tienen las mismas métricas obligatorias, mostrar
// una lista fija para todas era el bug real que esto reemplaza.
function PortfolioCatalogView({
  companies,
  mandatory,
  segments,
  selectedSegmentId,
  onSegmentChange,
}: {
  companies: PortfolioCompany[];
  mandatory: MetricRequirement[];
  segments: Segment[];
  selectedSegmentId: string | undefined;
  onSegmentChange: (v: string | undefined) => void;
}) {
  const [search, setSearch] = useState("");
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

  const visibleCompanies = useMemo(
    () => companies.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase())),
    [companies, search]
  );

  // Exporta TODAS las columnas mandatory (no las 3 capeadas de la card) —
  // es un dump para un deck/reporte a LPs, no la vista compacta de pantalla.
  // 100% client-side, los datos ya están en memoria, sin pedido a backend.
  const exportCsv = () => {
    const header = ["Empresa", ...mandatory.map((r) => r.name)];
    const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const lines = [header.map(csvCell).join(",")];
    for (const c of companies) {
      const cells = [
        c.name,
        ...mandatory.map((r) => {
          const value = rowByKey.get(`${c.id}|${r.requirement_id}`)?.values[periodString];
          return value !== null && value !== undefined ? String(value) : "";
        }),
      ];
      lines.push(cells.map(csvCell).join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `portfolio-${periodString}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (forbidden) {
    return <EmptyState icon={Building2} title="No se pudo cargar el dashboard." description="Reintentá en unos minutos." />;
  }

  return (
    <div className="space-y-4">
      <DataTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar empresa…"
        filters={<SegmentFilterSelect segments={segments} value={selectedSegmentId} onChange={onSegmentChange} />}
        actions={
          <Button variant="outline" size="sm" onClick={exportCsv}>
            <Download size={13} strokeWidth={1.5} className="mr-1.5" /> Exportar CSV
          </Button>
        }
      />

      {loading ? (
        <LoadingState variant="centered" className="py-16" />
      ) : visibleCompanies.length === 0 ? (
        <EmptyState icon={Building2} title="Ninguna empresa coincide con la búsqueda." />
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {visibleCompanies.map((c) => {
            const applicable = mandatory.filter(
              (r) => !r.target_startup_ids || r.target_startup_ids.length === 0 || r.target_startup_ids.includes(c.id)
            );
            const shown = applicable.slice(0, 3);
            const extra = applicable.length - shown.length;
            return (
              <Link
                key={c.id}
                to={`/companies/${c.id}`}
                className="border border-border rounded-lg bg-card p-3.5 flex flex-col gap-2.5 hover:border-foreground/30 transition-colors"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <Avatar className="h-8 w-8 shrink-0">
                    <AvatarImage src={c.logo_url ?? undefined} alt="" />
                    <AvatarFallback className="text-[10px] font-semibold">
                      {c.name.trim().slice(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-foreground truncate">{c.name}</span>
                </div>
                {applicable.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Sin requisitos asignados</p>
                ) : (
                  <div className="flex flex-col gap-1 pt-2 border-t border-border">
                    {shown.map((r) => {
                      const row = rowByKey.get(`${c.id}|${r.requirement_id}`);
                      const value = row?.values[periodString] ?? null;
                      const status = row?.compliance_status[periodString] ?? "unfulfilled";
                      return (
                        <div key={r.requirement_id} className="flex items-center justify-between gap-2 text-xs">
                          <span className="text-muted-foreground truncate">{r.name}</span>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span className="tabular-nums text-foreground">{formatRequirementValue(value, r)}</span>
                            <ComplianceStatusPill status={status} />
                          </div>
                        </div>
                      );
                    })}
                    {extra > 0 && <span className="text-[11px] text-primary font-medium">+{extra} más</span>}
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
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
  segments,
  selectedSegmentId,
  onSegmentChange,
}: {
  companies: PortfolioCompany[];
  mandatory: MetricRequirement[];
  coverageById: Map<string, MetricRequirementCoverage>;
  segments: Segment[];
  selectedSegmentId: string | undefined;
  onSegmentChange: (v: string | undefined) => void;
}) {
  const [range, setRange] = useState<RelativeRange>({ kind: "last_6_months" });
  const [compareMode, setCompareMode] = useState<CompareMode>("snapshot");
  // Vacío = ninguna deseleccionada = se grafican todas — evita tener que
  // resincronizar una lista de "incluidas" cada vez que cambia el catálogo
  // de requisitos obligatorios.
  const [excludedMetricIds, setExcludedMetricIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

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

  // Buscador + paginación son 100% client-side (corte sobre lo que ya está
  // en memoria) — usePortfolioMetricsDashboard no soporta page/page_size en
  // su contrato hoy, así que la request siempre trae el portfolio (o
  // segmento) completo. Recién si un fondo real se acerca a cientos de
  // empresas vale la pena pedir paginación server-side, no antes.
  const searchedCompanies = useMemo(
    () => companies.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase())),
    [companies, search]
  );
  const pagedCompanies = useMemo(() => searchedCompanies.slice(0, visibleCount), [searchedCompanies, visibleCount]);

  const { rows, periods, portfolioAggregates, forbidden, rateLimited } = usePortfolioMetricsDashboard(
    range.kind === "custom" ? { range: "custom", from: range.from ?? "", to: range.to ?? "" } : { range: range.kind },
    { requirementIds: selectedMetrics.map((r) => r.requirement_id), segmentId: selectedSegmentId }
  );
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
      <DataTableToolbar
        search={search}
        onSearchChange={(v) => {
          setSearch(v);
          setVisibleCount(PAGE_SIZE);
        }}
        searchPlaceholder="Buscar empresa…"
        filters={<SegmentFilterSelect segments={segments} value={selectedSegmentId} onChange={onSegmentChange} />}
      />

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
      ) : searchedCompanies.length === 0 ? (
        <EmptyState icon={Building2} title="Ninguna empresa coincide con la búsqueda." />
      ) : compareMode === "trend" ? (
        <PortfolioTrendView metrics={selectedMetrics} companies={pagedCompanies} rowByKey={rowByKey} periods={periods} />
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
                  rows={pagedCompanies.map((c) => {
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

      {searchedCompanies.length > visibleCount && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}>
            Cargar {Math.min(PAGE_SIZE, searchedCompanies.length - visibleCount)} más
          </Button>
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
