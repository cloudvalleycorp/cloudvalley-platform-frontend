import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { PeriodSelect } from "@/components/metrics/PeriodSelect";
import { ReportingStatusPill } from "@/components/investor/ReportingStatusPill";
import { useReportingStatus, useReportingStatusMutations } from "@/hooks/useReportingStatus";
import { toPeriodString } from "@/lib/metricPeriod";
import { FileBarChart } from "lucide-react";

// Vista portfolio-wide: quién reportó, quién no, qué falta — responde de un
// vistazo lo que hoy solo se ve entrando a cada empresa una por una. La
// pestaña "Updates" del Company Workspace (InvestorCompany.tsx) muestra el
// contenido real de un reporte puntual; esta pantalla es la vista agregada
// que lleva ahí.
export default function InvestorReporting() {
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
          <EmptyState icon={FileBarChart} title="Todavía no hay nada para mostrar." description="Vas a ver el reporting de tu portfolio apenas te unas a un fondo." />
        </div>
      </AppLayout>
    );
  }

  const companies = portfolio_company_ids.map((id, i) => ({ id, name: portfolio_company_names[i] ?? "—" }));
  return <InvestorReportingContent companies={companies} />;
}

function InvestorReportingContent({ companies }: { companies: { id: string; name: string }[] }) {
  const navigate = useNavigate();
  const now = new Date();
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const periodString = toPeriodString(period.month, period.year);

  const { rows, loading } = useReportingStatus(periodString, companies.map((c) => c.id));
  const { markReviewed } = useReportingStatusMutations();
  const rowByCompany = new Map(rows.map((r) => [r.company_id, r]));

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-6">
        <PageHeader title="Reporting" subtitle="Quién reportó, quién no, y qué falta" action={<PeriodSelect period={period} onChange={setPeriod} />} />

        {companies.length === 0 ? (
          <EmptyState
            icon={FileBarChart}
            title="Tu fondo todavía no tiene empresas conectadas."
            description="Las conexiones con startups se gestionan desde Conexiones."
          />
        ) : loading ? (
          <LoadingState variant="centered" className="py-16" />
        ) : (
          <div className="border border-border rounded-lg divide-y divide-border">
            {companies.map((c) => {
              const row = rowByCompany.get(c.id);
              return (
                <div key={c.id} className="flex flex-col sm:flex-row sm:items-center gap-2 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => navigate(`/companies/${c.id}?tab=updates`)}
                    className="text-sm font-medium text-foreground hover:underline text-left flex-1 min-w-0"
                  >
                    {c.name}
                  </button>
                  <div className="flex items-center gap-3 shrink-0">
                    <ReportingStatusPill status={row?.status ?? "missing_data"} />
                    <span className="text-xs text-muted-foreground w-16 text-right tabular-nums">
                      {row?.updated_at ? new Date(row.updated_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short" }) : "—"}
                    </span>
                    {row?.needs_review && row.report_id && (
                      <Button variant="ghost" size="sm" onClick={() => markReviewed(row.report_id!, true)}>
                        Marcar revisado
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
