import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialMetrics } from "@/hooks/useFinancialMetrics";
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
  // Fuentes de datos, Salud de datos, y el lineage de Overview/Explorador.
  const [rawFields, setRawFields] = useState<RawField[]>([]);
  const [connections, setConnections] = useState<SheetConnection[]>([]);
  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const reloadSources = async () => {
    if (!company_id) return;
    setLoadingSources(true);
    const qs = `?company_id=${encodeURIComponent(company_id)}`;
    // Promise.allSettled, no Promise.all: son 3 requests independientes que
    // alimentan piezas de UI distintas — un fallo de red en una sola (ej. el
    // gap de CORS conocido en list-raw-fields, ver playwright/README.md) no
    // debe tirar las otras dos que sí respondieron. Bug real encontrado en
    // vivo 2026-09-01: con Promise.all, ese único fallo dejaba "Fuentes de
    // datos" en "0 fuentes conectadas" pese a que list-sheet-connections
    // devolvía conexiones reales — Promise.all rechaza entero apenas una
    // promesa rechaza, descartando los otros dos resultados ya resueltos.
    const [fieldsResult, connectionsResult, accountsResult] = await Promise.allSettled([
      fetch(`${LIST_RAW_FIELDS_URL}${qs}`, { credentials: "include" }),
      fetch(`${LIST_SHEET_CONNECTIONS_URL}${qs}`, { credentials: "include" }),
      fetch(`${LIST_GOOGLE_ACCOUNTS_URL}${qs}`, { credentials: "include" }),
    ]);

    const connectionLabelById: Record<string, string> = {};
    let conns: SheetConnection[] = [];
    if (connectionsResult.status === "fulfilled" && connectionsResult.value.ok) {
      try {
        const connectionsData = await connectionsResult.value.json();
        conns = Array.isArray(connectionsData?.connections) ? connectionsData.connections : [];
        for (const c of conns) connectionLabelById[c.connection_id] = `${c.spreadsheet_name} · ${c.sheet_name}`;
      } catch {
        // sigue con conns vacío
      }
    }
    setConnections(conns);

    if (fieldsResult.status === "fulfilled") {
      const fieldsRes = fieldsResult.value;
      if (fieldsRes.ok) {
        try {
          const fieldsData = await fieldsRes.json();
          const fields: Omit<RawField, "connection_label">[] = Array.isArray(fieldsData?.fields) ? fieldsData.fields : [];
          setRawFields(fields.map((f) => ({ ...f, connection_label: connectionLabelById[f.connection_id] ?? null })));
        } catch {
          setRawFields([]);
        }
      } else {
        await handleMembershipError(fieldsRes);
        setRawFields([]);
      }
    } else {
      // Fallo de red (ej. CORS) — silencioso, mismo criterio que antes:
      // Fuentes/Salud de datos simplemente muestran menos señales.
      setRawFields([]);
    }

    if (accountsResult.status === "fulfilled" && accountsResult.value.ok) {
      try {
        const accountsData = await accountsResult.value.json();
        setAccounts(Array.isArray(accountsData?.accounts) ? accountsData.accounts : []);
      } catch {
        setAccounts([]);
      }
    } else {
      setAccounts([]);
    }

    setLoadingSources(false);
  };
  useEffect(() => {
    reloadSources();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company_id]);

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
