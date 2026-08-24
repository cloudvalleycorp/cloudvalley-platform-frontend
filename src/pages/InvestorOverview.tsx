import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { useMetricRequirements } from "@/hooks/useMetricRequirements";
import { usePortfolioMetricsDashboard } from "@/hooks/usePortfolioMetricsDashboard";
import { usePortfolioTasks } from "@/hooks/usePortfolioTasks";
import { useReportingStatus } from "@/hooks/useReportingStatus";
import { useActivity } from "@/hooks/useActivity";
import { formatRequirementValue } from "@/lib/metricRequirements";
import { toPeriodString } from "@/lib/metricPeriod";
import { CRITICALITY_LABELS } from "@/lib/roadmap";
import { Compass, AlertTriangle, ListTodo, FileBarChart, Activity as ActivityIcon } from "lucide-react";

// Briefing ejecutivo del portfolio — responde "¿qué está pasando?" en
// segundos, sin entrar pantalla por pantalla. No hay endpoint dedicado de
// "atención"/"resumen": se deriva client-side de reporting status (sin
// datos = atención) y tareas vencidas, ambos ya confirmados por backend —
// nunca se inventa un número que no salga de un endpoint real.
export default function InvestorOverview() {
  const { user, loading, fund_id, portfolio_company_ids, portfolio_company_names, email } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [reopen, setReopen] = useState(false);

  if (loading) return null;
  if (!user) return null;

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
          <EmptyState icon={Compass} title="Todavía no hay nada para mostrar." description="Vas a ver el resumen de tu portfolio apenas te unas a un fondo." />
        </div>
      </AppLayout>
    );
  }

  const companies = portfolio_company_ids.map((id, i) => ({ id, name: portfolio_company_names[i] ?? "—" }));
  return <InvestorOverviewContent companies={companies} />;
}

function InvestorOverviewContent({ companies }: { companies: { id: string; name: string }[] }) {
  const navigate = useNavigate();
  const now = new Date();
  const currentPeriod = toPeriodString(now.getMonth() + 1, now.getFullYear());

  const { requirements } = useMetricRequirements();
  const standardMandatory = useMemo(
    () => requirements.filter((r) => r.mandatory && r.metric_class === "standard"),
    [requirements]
  );
  const { rows, portfolioAggregates, loading: dashLoading } = usePortfolioMetricsDashboard(
    { range: "last_6_months" },
    { requirementIds: standardMandatory.map((r) => r.requirement_id) }
  );
  const latestPeriod = rows[0]?.values ? Object.keys(rows[0].values).sort().at(-1) : undefined;

  const { rows: reportingRows, loading: reportingLoading } = useReportingStatus(currentPeriod, companies.map((c) => c.id));
  const { tasks, loading: tasksLoading } = usePortfolioTasks({ page_size: 100 });
  const { events, loading: activityLoading } = useActivity({ page_size: 8 });

  const attention = useMemo(() => {
    const items: { company_id: string; company_name: string; reason: string }[] = [];
    for (const r of reportingRows) {
      if (r.status === "missing_data") items.push({ company_id: r.company_id, company_name: r.company_name, reason: "Sin reportar" });
    }
    const overdueByCompany = new Map<string, number>();
    for (const t of tasks) {
      if (t.is_overdue && t.status !== "done") overdueByCompany.set(t.company_id, (overdueByCompany.get(t.company_id) ?? 0) + 1);
    }
    for (const [company_id, count] of overdueByCompany) {
      const name = companies.find((c) => c.id === company_id)?.name ?? "—";
      items.push({ company_id, company_name: name, reason: `${count} tarea${count === 1 ? "" : "s"} vencida${count === 1 ? "" : "s"}` });
    }
    return items;
  }, [reportingRows, tasks, companies]);

  const pendingTasks = useMemo(
    () => tasks.filter((t) => t.status !== "done").slice(0, 6),
    [tasks]
  );
  const recentUpdates = useMemo(
    () => events.filter((e) => e.type === "report_shared").slice(0, 5),
    [events]
  );

  const loading = dashLoading || reportingLoading || tasksLoading;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-8">
        <PageHeader title="Overview" subtitle={`${companies.length} empresa${companies.length === 1 ? "" : "s"}`} />

        {companies.length === 0 ? (
          <EmptyState icon={Compass} title="Tu fondo todavía no tiene empresas conectadas." description="Las conexiones con startups se gestionan desde Conexiones." />
        ) : loading ? (
          <LoadingState variant="centered" className="py-16" />
        ) : (
          <>
            {standardMandatory.length === 0 ? (
              <EmptyState
                icon={Compass}
                title="Todavía no tenés métricas estándar marcadas como obligatorias."
                description='Desde Portfolio → Gestionar métricas, definí una métrica y marcala como "estándar" para que aparezca acá agregada.'
              />
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {standardMandatory.map((r) => {
                  const agg = latestPeriod ? portfolioAggregates[r.requirement_id]?.[latestPeriod] : undefined;
                  const value = agg ? (r.value_type === "percentage" ? agg.avg : agg.sum) ?? null : null;
                  return (
                    <div key={r.requirement_id} className="border border-border rounded-lg bg-card p-3">
                      <p className="text-[11px] text-muted-foreground uppercase tracking-wide truncate">{r.name}</p>
                      <p className="text-lg font-medium text-foreground tabular-nums mt-1">
                        {value !== null && value !== undefined ? formatRequirementValue(value, r) : "Sin reportar"}
                      </p>
                    </div>
                  );
                })}
                <div className="border border-border rounded-lg bg-card p-3">
                  <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Empresas</p>
                  <p className="text-lg font-medium text-foreground tabular-nums mt-1">{companies.length}</p>
                </div>
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <section className="border border-border rounded-lg bg-card p-4">
                <h2 className="text-xs font-medium text-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <AlertTriangle size={13} strokeWidth={1.5} aria-hidden="true" /> Necesitan atención
                </h2>
                {attention.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ninguna empresa necesita atención ahora.</p>
                ) : (
                  <div className="space-y-1">
                    {attention.slice(0, 6).map((a, i) => (
                      <button
                        key={`${a.company_id}-${i}`}
                        type="button"
                        onClick={() => navigate(`/companies/${a.company_id}`)}
                        className="w-full flex items-center justify-between gap-2 py-1.5 text-sm text-left hover:underline"
                      >
                        <span className="truncate">{a.company_name}</span>
                        <span className="text-xs text-destructive shrink-0">{a.reason}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="border border-border rounded-lg bg-card p-4">
                <h2 className="text-xs font-medium text-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <ListTodo size={13} strokeWidth={1.5} aria-hidden="true" /> Tareas pendientes
                </h2>
                {pendingTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin tareas pendientes.</p>
                ) : (
                  <div className="space-y-1">
                    {pendingTasks.map((t) => (
                      <button
                        key={t.startup_task_id}
                        type="button"
                        onClick={() => navigate(`/companies/${t.company_id}?tab=tasks`)}
                        className="w-full flex items-center justify-between gap-2 py-1.5 text-sm text-left hover:underline"
                      >
                        <span className="truncate">{t.title}</span>
                        <span className={`text-xs shrink-0 ${t.is_overdue ? "text-destructive" : "text-muted-foreground"}`}>
                          {t.is_overdue ? "Vencida" : CRITICALITY_LABELS[t.criticality]}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="border border-border rounded-lg bg-card p-4">
                <h2 className="text-xs font-medium text-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <FileBarChart size={13} strokeWidth={1.5} aria-hidden="true" /> Updates recientes
                </h2>
                {activityLoading ? (
                  <LoadingState variant="inline" />
                ) : recentUpdates.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin updates recientes.</p>
                ) : (
                  <div className="space-y-1">
                    {recentUpdates.map((e, i) => (
                      <button
                        key={`${e.related_id}-${i}`}
                        type="button"
                        onClick={() => navigate(`/companies/${e.company_id}?tab=updates`)}
                        className="w-full flex items-center justify-between gap-2 py-1.5 text-sm text-left hover:underline"
                      >
                        <span className="truncate">{e.summary}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {new Date(e.occurred_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>

              <section className="border border-border rounded-lg bg-card p-4">
                <h2 className="text-xs font-medium text-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <ActivityIcon size={13} strokeWidth={1.5} aria-hidden="true" /> Actividad reciente
                </h2>
                {activityLoading ? (
                  <LoadingState variant="inline" />
                ) : events.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Sin actividad reciente.</p>
                ) : (
                  <div className="space-y-1">
                    {events.slice(0, 5).map((e, i) => (
                      <button
                        key={`${e.related_id}-act-${i}`}
                        type="button"
                        onClick={() => navigate(`/companies/${e.company_id}`)}
                        className="w-full flex items-center justify-between gap-2 py-1.5 text-sm text-left hover:underline"
                      >
                        <span className="truncate">{e.summary}</span>
                        <span className="text-xs text-muted-foreground shrink-0">
                          {new Date(e.occurred_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
