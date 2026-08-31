import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialMetrics } from "@/hooks/useFinancialMetrics";
import { cn } from "@/lib/utils";
import { PlatformAgentPanel } from "@/components/ai/PlatformAgentPanel";
import { Button } from "@/components/ui/button";
import { Sparkles } from "lucide-react";
import { type RawField } from "@/lib/metrics";
import { FORMULA_SYNTAX } from "@/lib/formulaEngine";
import { toPeriodString, periodRange } from "@/lib/metricPeriod";
import { LIST_RAW_FIELDS_URL, LIST_SHEET_CONNECTIONS_URL, LIST_GOOGLE_ACCOUNTS_URL, type SheetConnection, type GoogleAccount } from "@/lib/sheetsIntegration";
import { handleMembershipError } from "@/lib/membership";
import { parseMetricsTab, type MetricsTab } from "@/lib/metricsNavigation";
import { MetricsOverviewTab } from "@/components/metrics/MetricsOverviewTab";
import { MetricsDataSourcesTab } from "@/components/metrics/MetricsDataSourcesTab";
import { MetricsDataHealthTab } from "@/components/metrics/MetricsDataHealthTab";
import { MetricsExplorerTab } from "@/components/metrics/MetricsExplorerTab";

const TAB_LABELS: Record<MetricsTab, string> = {
  overview: "Overview",
  sources: "Fuentes de datos",
  health: "Salud de datos",
  explorer: "Explorador",
};

const now = new Date();

export default function Metrics() {
  const { company_id, is_owner } = useAuth();
  const { metricId } = useParams<{ metricId?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab: MetricsTab = metricId ? "explorer" : parseMetricsTab(searchParams);
  const [assistantOpen, setAssistantOpen] = useState(false);

  const setTab = (tab: MetricsTab) => {
    if (tab === "explorer" && metricId) return; // ya estamos en explorer, no perder el metricId de la URL
    setSearchParams(tab === "overview" ? {} : { tab }, { replace: false });
  };

  // Rango compartido por Overview/Fuentes/Salud — no depende de navegación
  // de período como Explorador (que tiene su propio year/period, ver
  // MetricsExplorerTab), así que un rango fijo de 12 meses alcanza para KPIs
  // + evaluación de conflictos. Explorador llama useFinancialMetrics por su
  // cuenta con su propio rango — evita acoplar su navegador de año/mes al de
  // estos tres tabs (ver comentario en MetricsExplorerTab.tsx).
  const overviewRange = useMemo(() => periodRange({ month: now.getMonth() + 1, year: now.getFullYear() }, 12), []);
  const financial = useFinancialMetrics(company_id, overviewRange);

  // Campos crudos + conexiones + cuentas de Google — compartidos por
  // Fuentes de datos, Salud de datos, y el lineage de Overview/Explorador.
  const [rawFields, setRawFields] = useState<RawField[]>([]);
  const [connections, setConnections] = useState<SheetConnection[]>([]);
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const reloadSources = async () => {
    if (!company_id) return;
    setLoadingSources(true);
    try {
      const qs = `?company_id=${encodeURIComponent(company_id)}`;
      const [fieldsRes, connectionsRes, accountsRes] = await Promise.all([
        fetch(`${LIST_RAW_FIELDS_URL}${qs}`, { credentials: "include" }),
        fetch(`${LIST_SHEET_CONNECTIONS_URL}${qs}`, { credentials: "include" }),
        fetch(`${LIST_GOOGLE_ACCOUNTS_URL}${qs}`, { credentials: "include" }),
      ]);
      if (await handleMembershipError(fieldsRes)) return;
      const fieldsData = await fieldsRes.json();
      const fields: Omit<RawField, "connection_label">[] = Array.isArray(fieldsData?.fields) ? fieldsData.fields : [];

      const connectionLabelById: Record<string, string> = {};
      let conns: SheetConnection[] = [];
      if (connectionsRes.ok) {
        const connectionsData = await connectionsRes.json();
        conns = Array.isArray(connectionsData?.connections) ? connectionsData.connections : [];
        for (const c of conns) connectionLabelById[c.connection_id] = `${c.spreadsheet_name} · ${c.sheet_name}`;
      }
      setConnections(conns);
      setRawFields(fields.map((f) => ({ ...f, connection_label: connectionLabelById[f.connection_id] ?? null })));

      if (accountsRes.ok) {
        const accountsData = await accountsRes.json();
        setAccounts(Array.isArray(accountsData?.accounts) ? accountsData.accounts : []);
      }
    } catch {
      // silencioso — Fuentes/Salud de datos simplemente muestran menos señales
    } finally {
      setLoadingSources(false);
    }
  };
  useEffect(() => {
    reloadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company_id]);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <PageHeader
          title="Métricas"
          subtitle="Tu capa de datos financieros: fuentes conectadas, salud de los datos, y cada métrica con su origen."
          action={
            <Button variant="outline" onClick={() => setAssistantOpen(true)}>
              <Sparkles size={14} className="mr-1" aria-hidden="true" /> Asistente
            </Button>
          }
        />

        <div className="flex gap-1 border-b border-border mb-8 overflow-x-auto">
          {(Object.keys(TAB_LABELS) as MetricsTab[]).map((tab) => (
            <button
              key={tab}
              onClick={() => setTab(tab)}
              aria-pressed={activeTab === tab}
              className={cn(
                "px-3 py-2 text-sm rounded-md transition-all duration-150 shrink-0 whitespace-nowrap",
                activeTab === tab
                  ? "bg-surface text-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-surface/60"
              )}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </div>

        {activeTab === "overview" && (
          <MetricsOverviewTab
            companyId={company_id}
            metrics={financial.metrics}
            warnings={financial.warnings}
            fundRequired={financial.fundRequired}
            loading={financial.loading}
            onChanged={() => {
              financial.reload();
              reloadSources();
            }}
            onGoToExplorer={(fulfillRequirementId) => {
              const params = fulfillRequirementId ? { tab: "explorer", fulfill: fulfillRequirementId } : { tab: "explorer" };
              setSearchParams(params);
            }}
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
