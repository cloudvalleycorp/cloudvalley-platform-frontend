import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialMetrics } from "@/hooks/useFinancialMetrics";
import { useSheetsSources } from "@/hooks/useSheetsSources";
import { PlatformAgentPanel } from "@/components/ai/PlatformAgentPanel";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { FORMULA_SYNTAX } from "@/lib/formulaEngine";
import { toPeriodString, periodRange } from "@/lib/metricPeriod";
import { parseMetricsTab, type MetricsTab } from "@/lib/metricsNavigation";
import { MetricsOverviewTab } from "@/components/metrics/MetricsOverviewTab";
import { MetricsDataSourcesTab } from "@/components/metrics/MetricsDataSourcesTab";
import { MetricsDataHealthTab } from "@/components/metrics/MetricsDataHealthTab";
import { MetricsExplorerTab } from "@/components/metrics/MetricsExplorerTab";

// La navegación entre secciones vive en el grupo colapsable "Métricas" del
// sidebar (AppSidebar.tsx) — este título/subtítulo por tab reemplaza al tab
// bar que antes se repetía acá arriba, duplicando exactamente esos mismos 4
// destinos.
const TAB_HEADER: Record<MetricsTab, { title: string; subtitle: string }> = {
  overview: { title: "Overview", subtitle: "Tus KPIs principales, con tendencia real y el origen de cada número a un clic." },
  sources: { title: "Fuentes de datos", subtitle: "Revisá qué tan al día está cada fuente y cuántas métricas dependen de ella." },
  health: { title: "Salud de datos", subtitle: "Problemas reales agrupados por severidad — nada inventado." },
  explorer: { title: "Explorador", subtitle: "Creá, editá y entendé de dónde sale cada métrica." },
};

const now = new Date();

export default function Metrics() {
  const { company_id, is_owner } = useAuth();
  const { metricId } = useParams<{ metricId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: MetricsTab = metricId ? "explorer" : parseMetricsTab(searchParams);
  const [assistantOpen, setAssistantOpen] = useState(false);

  // Rango compartido por Overview/Fuentes/Salud — no depende de navegación
  // de período como Explorador (que tiene su propio year/period, ver
  // MetricsExplorerTab), así que un rango fijo de 12 meses alcanza para KPIs
  // + evaluación de conflictos. Explorador llama useFinancialMetrics por su
  // cuenta con su propio rango — evita acoplar su navegador de año/mes al de
  // estos tres tabs (ver comentario en MetricsExplorerTab.tsx).
  const overviewRange = useMemo(() => periodRange({ month: now.getMonth() + 1, year: now.getFullYear() }, 12), []);
  const financial = useFinancialMetrics(company_id, overviewRange);

  // Campos crudos + conexiones + cuentas de Google — compartidos por
  // Fuentes de datos, Salud de datos, y el lineage de Overview/Explorador
  // (y desde esta pasada, también por Data Readiness en el Dashboard).
  const { rawFields, connections, accounts, loading: loadingSources, reload: reloadSources } = useSheetsSources(company_id);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <PageHeader
          title={TAB_HEADER[activeTab].title}
          subtitle={TAB_HEADER[activeTab].subtitle}
          action={
            <Button variant="outline" onClick={() => setAssistantOpen(true)}>
              <Sparkles size={14} className="mr-1" aria-hidden="true" /> Asistente
            </Button>
          }
        />

        {activeTab === "overview" && (
          <MetricsOverviewTab
            companyId={company_id}
            metrics={financial.metrics}
            warnings={financial.warnings}
            fundRequired={financial.fundRequired}
            rawFields={rawFields}
            loading={financial.loading}
            onChanged={() => {
              financial.reload();
              reloadSources();
            }}
            onGoToExplorer={(fulfillRequirementId) => {
              const params = fulfillRequirementId ? { tab: "explorer", fulfill: fulfillRequirementId } : { tab: "explorer" };
              setSearchParams(params);
            }}
            onOpenMetric={(id) => navigate(`/metrics/${id}`)}
          />
        )}

        {activeTab === "sources" && (
          <MetricsDataSourcesTab
            companyId={company_id}
            connections={connections}
            accounts={accounts}
            metrics={financial.metrics}
            rawFields={rawFields}
            loading={loadingSources}
          />
        )}

        {activeTab === "health" && (
          <MetricsDataHealthTab
            companyId={company_id}
            metrics={financial.metrics}
            warnings={financial.warnings}
            rawFields={rawFields}
            connections={connections}
            accounts={accounts}
            importLogs={financial.logs}
            loading={financial.loading || loadingSources}
          />
        )}

        {activeTab === "explorer" && (
          <MetricsExplorerTab
            companyId={company_id}
            isOwner={is_owner}
            metricId={metricId}
            navigate={navigate}
            rawFields={rawFields}
            onOpenAssistant={() => setAssistantOpen(true)}
            onDataChanged={() => {
              financial.reload();
              reloadSources();
            }}
          />
        )}
      </div>

      <PlatformAgentPanel
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
        companyId={company_id}
        surface="metrics"
        uiContext={{
          selectedMetricId: metricId ?? null,
          selectedCategoryId: null,
          selectedReportId: null,
          currentPeriodId: toPeriodString(now.getMonth() + 1, now.getFullYear()),
        }}
        formulaSyntax={FORMULA_SYNTAX}
        onAgentWrote={() => {
          financial.reload();
          reloadSources();
        }}
      />
    </AppLayout>
  );
}
