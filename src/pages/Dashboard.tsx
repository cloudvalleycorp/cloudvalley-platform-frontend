import { useEffect, useMemo, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
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
import { collectDataHealthIssues, summarizeHealth } from "@/lib/dataHealthIssues";
import { LIST_DATA_HEALTH_ISSUES_URL, type DataHealthIssue } from "@/lib/metricIntelligence";
import { LIST_FINANCIAL_REPORTS_URL, type ReportSummary } from "@/lib/financialReports";
import { periodRange } from "@/lib/metricPeriod";
import { DashboardKpiError, defaultDashboardKpiIds, type KpiSaveOutcome } from "@/lib/dashboardKpis";
import { useDashboardKpis } from "@/hooks/useDashboardKpis";
import type { RoadmapTask } from "@/lib/roadmap";

import { CompanyHealthStrip } from "@/components/dashboard/CompanyHealthStrip";
import { ActionCenterSection } from "@/components/dashboard/ActionCenterSection";
import { DataReadinessSection } from "@/components/dashboard/DataReadinessSection";
import { ExploreSection } from "@/components/dashboard/ExploreSection";

// Arreglo estable: un [] nuevo en cada render reiniciaría el borrador del selector
// de KPIs mientras está abierto.
const NO_KPI_IDS: string[] = [];

export default function Dashboard() {
  // user.id NO es el id real del usuario (alias legacy a company_id, ver
  // AuthContext.tsx) — para comparar "es mi propia tarea" hace falta user_id.
  const { role, company_id, user_id, email, full_name, loading: authLoading, user } = useAuth();
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

  // 12 meses alcanza para KPIs + comparación de período.
  const financialRange = useMemo(() => {
    const now = new Date();
    return periodRange({ month: now.getMonth() + 1, year: now.getFullYear() }, 12);
  }, []);
  // periodRange(period, N) devuelve N+1 períodos (incluye ambos extremos,
  // ver metricPeriod.ts) — evaluate-metrics rechaza más de 12 períodos por
  // request (400 real), así que acá va con 11 meses atrás, para quedar en 12.
  const periodSpec = useMemo(() => {
    const now = new Date();
    const r = periodRange({ month: now.getMonth() + 1, year: now.getFullYear() }, 11);
    return { period_from: r.from, period_to: r.to };
  }, []);

  const financial = useFinancialMetrics(company_id ?? null, financialRange);
  const roadmap = useRoadmap(company_id ?? null);
  const documents = useDocuments(company_id ?? null);
  const sources = useSheetsSources(company_id ?? null);

  // KPIs elegidos por la startup, guardados en el backend. Sin selección
  // guardada se usa el default. Mientras carga no se evalúa nada, así no se
  // calcula el default para después reemplazarlo.
  const defaultKpiIds = useMemo(() => defaultDashboardKpiIds(financial.metrics), [financial.metrics]);
  const kpisCompanyId = role === "user" ? company_id ?? null : null;
  const { kpiIds, loading: kpisLoading, saving: kpisSaving, saveKpis } = useDashboardKpis(kpisCompanyId, defaultKpiIds);
  const kpiValues = useEvaluatedMetrics(company_id ?? null, kpisLoading ? NO_KPI_IDS : kpiIds, periodSpec, "actual");

  const handleChangeKpis = async (ids: string[]): Promise<KpiSaveOutcome> => {
    try {
      await saveKpis(ids);
      return { ok: true };
    } catch (err) {
      const invalidIds = err instanceof DashboardKpiError ? err.invalidMetricIds : [];
      if (invalidIds.length > 0) {
        // El catálogo cambió (métrica archivada o borrada): se refresca para que
        // el selector no la vuelva a ofrecer.
        void financial.reload();
      }
      const message =
        err instanceof DashboardKpiError ? err.message : "No pudimos guardar la selección. Revisá tu conexión y probá de nuevo.";
      return { ok: false, message, invalidIds };
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
  // es-AR devuelve en minúscula ("domingo, 4 de octubre"): solo la primera letra va en mayúscula.
  const todayRaw = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const today = todayRaw.charAt(0).toUpperCase() + todayRaw.slice(1);
  const monthLabel = new Date().toLocaleDateString("es-AR", { month: "long" });

  // Guardas de rol: van después de todos los hooks (rules-of-hooks). Esperar
  // authLoading antes de evaluar el rol evita rebotes a /admin en una recarga.
  if (authLoading) return null;
  // Sin sesión se va a login, nunca se rebota entre rutas.
  if (!user) return <Navigate to="/login" replace />;
  if (role === "investor") return <Navigate to="/overview" replace />;
  if (role !== "user") return <Navigate to="/admin" replace />;

  // role="user" sin company asignada: flujo "sin empresa" o banner persistente.
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
        <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12">
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
      <div className="max-w-6xl mx-auto px-4 sm:px-8 py-12 space-y-6">
        <PageHeader size="compact" title={greeting} subtitle={today} className="mb-0" />

        {pageLoading ? (
          <div className="space-y-6" aria-hidden="true">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="border border-border rounded-lg h-40 bg-surface/40 animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            <CompanyHealthStrip
              metrics={financial.metrics}
              selectedIds={kpisLoading ? NO_KPI_IDS : kpiIds}
              values={kpiValues.values}
              loading={kpisLoading || kpiValues.loading}
              monthLabel={monthLabel}
              saving={kpisSaving}
              onChangeSelected={handleChangeKpis}
            />

            <div className="grid lg:grid-cols-2 gap-6 items-start">
              <ActionCenterSection tasks={roadmap.tasks} loading={roadmap.loading} currentUserId={user_id} onToggleDone={handleToggleDone} />
              <DataReadinessSection issues={healthIssues} loading={sources.loading || financial.loadingLogs} />
            </div>

            <ExploreSection
              metricsCount={financial.metrics.length}
              metricsIssueCount={healthSummary.critical + healthSummary.warning}
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
