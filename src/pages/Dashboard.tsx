import { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialMetrics } from "@/hooks/useFinancialMetrics";
import { useRoadmap } from "@/hooks/useRoadmap";
import { useDocuments } from "@/hooks/useDocuments";
import { useSheetsSources } from "@/hooks/useSheetsSources";
import { useEvaluatedMetrics } from "@/hooks/useEvaluatedMetrics";
import { useMetricHighlights } from "@/hooks/useMetricHighlights";
import { collectDataHealthIssues, summarizeHealth } from "@/lib/dataHealthIssues";
import { LIST_DATA_HEALTH_ISSUES_URL, type DataHealthIssue } from "@/lib/metricIntelligence";
import { LIST_METRIC_SOURCE_COVERAGE_URL, type ListMetricSourceCoverageResponse } from "@/lib/metricSourceCoverage";
import { LIST_FINANCIAL_REPORTS_URL, type ReportSummary } from "@/lib/financialReports";
import { handleMembershipError } from "@/lib/membership";
import { STANDARD_KEY_ORDER } from "@/lib/metricRequirements";
import { periodRange } from "@/lib/metricPeriod";
import type { RoadmapTask } from "@/lib/roadmap";

import { ExecutiveSummaryCard } from "@/components/dashboard/ExecutiveSummaryCard";
import { CompanyHealthStrip } from "@/components/dashboard/CompanyHealthStrip";
import { WhatChangedSection } from "@/components/dashboard/WhatChangedSection";
import { RisksOpportunitiesSection } from "@/components/dashboard/RisksOpportunitiesSection";
import { ActionCenterSection } from "@/components/dashboard/ActionCenterSection";
import { DataReadinessSection } from "@/components/dashboard/DataReadinessSection";
import { PerformanceVsPlanSection } from "@/components/dashboard/PerformanceVsPlanSection";
import { ExploreSection } from "@/components/dashboard/ExploreSection";

type CoverageErrorKind = "rate_limit" | "unavailable" | "generic";

export default function Dashboard() {
  const { user, role, company_id, email, full_name } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("message") === "email_updated") {
      toast.success("Tu email fue actualizado correctamente");
      const next = new URLSearchParams(searchParams);
      next.delete("message");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [dismissed, setDismissed] = useState(false);
  const [reopenNoMembership, setReopenNoMembership] = useState(false);

  // 12 meses alcanza para KPIs + comparación de período — mismo rango que
  // usa Metrics > Overview para el mismo propósito.
  const financialRange = useMemo(() => {
    const now = new Date();
    return periodRange({ month: now.getMonth() + 1, year: now.getFullYear() }, 12);
  }, []);
  // periodRange(period, N) devuelve N+1 períodos (incluye ambos extremos,
  // ver metricPeriod.ts) — bien para financialRange (sin tope), pero
  // evaluate-metrics rechaza más de 12 períodos por request (400 real,
  // encontrado en vivo probando esta pantalla): acá va con 11 meses atrás,
  // no 12, para quedar en exactamente 12.
  const periodSpec = useMemo(() => {
    const now = new Date();
    const r = periodRange({ month: now.getMonth() + 1, year: now.getFullYear() }, 11);
    return { period_from: r.from, period_to: r.to };
  }, []);

  const financial = useFinancialMetrics(company_id ?? null, financialRange);
  const roadmap = useRoadmap(company_id ?? null);
  const documents = useDocuments(company_id ?? null);
  const sources = useSheetsSources(company_id ?? null);

  const standardMetricIds = useMemo(
    () =>
      financial.metrics
        .filter((m) => m.metric_class === "standard" && m.standard_key && STANDARD_KEY_ORDER.includes(m.standard_key))
        .map((m) => m.id),
    [financial.metrics]
  );
  const actual = useEvaluatedMetrics(company_id ?? null, standardMetricIds, periodSpec, "actual");
  const forecast = useEvaluatedMetrics(company_id ?? null, standardMetricIds, periodSpec, "forecast");

  const highlights = useMetricHighlights(company_id ?? null);

  // list-metric-source-coverage — mismo endpoint/criterio que "Qué podemos
  // mejorar" en MetricsOverviewTab.tsx (disparo manual, sin hook dedicado
  // todavía porque hoy solo lo consumen esas dos pantallas).
  const [coverage, setCoverage] = useState<ListMetricSourceCoverageResponse | null>(null);
  const [loadingCoverage, setLoadingCoverage] = useState(false);
  const [coverageError, setCoverageError] = useState<CoverageErrorKind | null>(null);
  const loadCoverage = async () => {
    if (!company_id) return;
    setLoadingCoverage(true);
    setCoverageError(null);
    try {
      const res = await fetch(`${LIST_METRIC_SOURCE_COVERAGE_URL}?company_id=${encodeURIComponent(company_id)}`, { credentials: "include" });
      if (res.status === 429) return setCoverageError("rate_limit");
      if (res.status === 503) return setCoverageError("unavailable");
      if (!res.ok) {
        await handleMembershipError(res);
        return setCoverageError("generic");
      }
      setCoverage((await res.json()) as ListMetricSourceCoverageResponse);
    } catch {
      setCoverageError("generic");
    } finally {
      setLoadingCoverage(false);
    }
  };

  // list-data-health-issues — mismo endpoint que Metrics > Salud de datos.
  const [backendHealthIssues, setBackendHealthIssues] = useState<DataHealthIssue[]>([]);
  useEffect(() => {
    if (!company_id) return;
    fetch(`${LIST_DATA_HEALTH_ISSUES_URL}?company_id=${encodeURIComponent(company_id)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { issues: [] }))
      .then((data) => setBackendHealthIssues(Array.isArray(data?.issues) ? data.issues : []))
      .catch(() => setBackendHealthIssues([]));
  }, [company_id]);

  const healthIssues = useMemo(
    () =>
      collectDataHealthIssues({
        accounts: sources.accounts,
        connections: sources.connections,
        metrics: financial.metrics,
        importLogs: financial.logs,
        rawFields: sources.rawFields,
        warnings: financial.warnings,
        backendIssues: backendHealthIssues,
      }),
    [sources.accounts, sources.connections, financial.metrics, financial.logs, sources.rawFields, financial.warnings, backendHealthIssues]
  );
  const healthSummary = summarizeHealth(healthIssues);

  // Reportes — solo para el stat de la card "Reporting" en Explorar, mismo
  // endpoint que ya usa Reporting.tsx.
  const [reports, setReports] = useState<ReportSummary[]>([]);
  useEffect(() => {
    if (!company_id) return;
    fetch(`${LIST_FINANCIAL_REPORTS_URL}?company_id=${encodeURIComponent(company_id)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { reports: [] }))
      .then((data) => setReports(Array.isArray(data?.reports) ? data.reports : []))
      .catch(() => setReports([]));
  }, [company_id]);
  const lastReportDaysAgo = useMemo(() => {
    if (reports.length === 0) return null;
    const mostRecent = reports.reduce<string | null>((acc, r) => (!acc || r.updated_at > acc ? r.updated_at : acc), null);
    if (!mostRecent) return null;
    return Math.max(0, Math.floor((Date.now() - new Date(mostRecent).getTime()) / 86_400_000));
  }, [reports]);

  const handleToggleDone = async (task: RoadmapTask) => {
    await roadmap.toggleStatus(task.startup_task_id, "done");
  };

  const greeting = full_name?.trim() ? `Hola, ${full_name.trim().split(" ")[0]}` : "Buen día";
  const today = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });

  // role="user" sin company asignada: mostrar el flujo "sin empresa" (o un
  // banner persistente si el usuario eligió "decidir más tarde").
  if (role === "user" && !company_id) {
    if (!dismissed || reopenNoMembership) {
      return (
        <AppLayout>
          <NoMembershipScreen
            role="user"
            email={email}
            onDismiss={() => {
              setDismissed(true);
              setReopenNoMembership(false);
            }}
          />
        </AppLayout>
      );
    }
    return (
      <AppLayout>
        <div className="max-w-6xl mx-auto px-8 py-12">
          <NoMembershipBanner role="user" onOpen={() => setReopenNoMembership(true)} />
          <div className="border border-border rounded-lg p-12 text-center text-sm text-muted-foreground bg-card">
            No hay contenido para mostrar hasta que te unas a una startup.
          </div>
        </div>
      </AppLayout>
    );
  }

  const pageLoading = financial.loading || roadmap.loading;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-6">
        <PageHeader size="compact" title={greeting} subtitle={<span className="capitalize">{today}</span>} className="mb-0" />

        {pageLoading ? (
          <div className="space-y-6" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border border-border rounded-lg h-40 bg-surface/40 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <ExecutiveSummaryCard companyId={company_id ?? null} />

            <CompanyHealthStrip
              metrics={financial.metrics}
              values={actual.values}
              loading={actual.loading}
              onGoToMetrics={() => navigate("/metrics?tab=explorer")}
            />

            <WhatChangedSection
              companyId={company_id ?? null}
              highlights={highlights.highlights}
              loading={highlights.loading}
              error={highlights.error}
              onLoad={() => highlights.load()}
            />

            <RisksOpportunitiesSection
              metrics={financial.metrics}
              highlights={highlights.highlights}
              healthIssues={healthIssues}
              coverage={coverage}
              hasTriggeredEither={highlights.highlights !== null || coverage !== null}
              onLoadHighlights={() => highlights.load()}
              onLoadCoverage={loadCoverage}
            />

            <div className="grid lg:grid-cols-2 gap-6 items-start">
              <ActionCenterSection tasks={roadmap.tasks} loading={roadmap.loading} currentUserId={user?.id ?? null} onToggleDone={handleToggleDone} />
              <DataReadinessSection issues={healthIssues} loading={sources.loading || financial.loadingLogs} />
            </div>

            <PerformanceVsPlanSection
              metrics={financial.metrics}
              forecastValues={forecast.values}
              actualValues={forecast.valuesActual}
              loading={forecast.loading}
            />

            <ExploreSection
              metricsCount={financial.metrics.length}
              metricsIssueCount={healthSummary.critical + healthSummary.warning}
              roadmapReadiness={roadmap.readinessScore}
              roadmapPendingCount={roadmap.tasks.filter((t) => t.status !== "done").length}
              docsUploaded={documents.documents.filter((d) => d.status !== "missing").length}
              docsTotal={documents.documents.length}
              reportsCount={reports.length}
              lastReportDaysAgo={lastReportDaysAgo}
            />
          </>
        )}
      </div>
    </AppLayout>
  );
}
