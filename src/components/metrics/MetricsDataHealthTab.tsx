import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, Info } from "lucide-react";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Badge } from "@/components/ui/badge";
import type { MetricDef, RawField } from "@/lib/metrics";
import type { MetricClassWarning, ImportLogEntry } from "@/lib/financialData";
import type { SheetConnection, GoogleAccount } from "@/lib/sheetsIntegration";
import { collectDataHealthIssues, summarizeHealth, type HealthIssueSeverity } from "@/lib/dataHealthIssues";
import { LIST_DATA_HEALTH_ISSUES_URL, type DataHealthIssue } from "@/lib/metricIntelligence";
import { cn } from "@/lib/utils";

type Props = {
  companyId: string | null;
  metrics: MetricDef[];
  warnings: MetricClassWarning[];
  rawFields: RawField[];
  connections: SheetConnection[];
  accounts: GoogleAccount[];
  importLogs: ImportLogEntry[];
  loading: boolean;
};

const SEVERITY_ICON: Record<HealthIssueSeverity, typeof AlertCircle> = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};
const SEVERITY_COLOR: Record<HealthIssueSeverity, string> = {
  critical: "text-destructive",
  warning: "text-warning",
  info: "text-muted-foreground",
};

// Salud de datos — combina señales 100% determinísticas ya calculables en
// el cliente (reconnect/sync errors/frescura/huérfanas/conflictos/campos sin
// usar, ver dataHealthIssues.ts) con list-data-health-issues real de backend
// (mapeos de baja confianza + anomalías estadísticas, con confidence
// verdadera). Ninguna de las dos mitades inventa nada — la diferencia es
// solo qué mitad puede calcularse sin IA.
export function MetricsDataHealthTab({ companyId, metrics, warnings, rawFields, connections, accounts, importLogs, loading }: Props) {
  const [backendIssues, setBackendIssues] = useState<DataHealthIssue[]>([]);
  const [loadingBackend, setLoadingBackend] = useState(true);
  useEffect(() => {
    if (!companyId) return;
    setLoadingBackend(true);
    fetch(`${LIST_DATA_HEALTH_ISSUES_URL}?company_id=${encodeURIComponent(companyId)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { issues: [] }))
      .then((data) => setBackendIssues(Array.isArray(data?.issues) ? data.issues : []))
      .catch(() => setBackendIssues([]))
      .finally(() => setLoadingBackend(false));
  }, [companyId]);

  if (loading) return <LoadingState variant="centered" className="py-16" />;

  const issues = collectDataHealthIssues({ accounts, connections, metrics, importLogs, rawFields, warnings, backendIssues });
  const summary = summarizeHealth(issues);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-1.5 text-destructive">
          <AlertCircle size={14} strokeWidth={1.5} /> {summary.critical} crítico{summary.critical === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-1.5 text-warning">
          <AlertTriangle size={14} strokeWidth={1.5} /> {summary.warning} advertencia{summary.warning === 1 ? "" : "s"}
        </span>
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Info size={14} strokeWidth={1.5} /> {summary.info} informativo{summary.info === 1 ? "" : "s"}
        </span>
        {loadingBackend && <span className="text-xs text-muted-foreground ml-auto">Cargando señales adicionales…</span>}
      </div>

      {issues.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Todo en orden." description="No detectamos problemas de datos en este momento." />
      ) : (
        <div className="space-y-2">
          {issues.map((issue) => {
            const Icon = SEVERITY_ICON[issue.severity];
            return (
              <div key={issue.id} className="border border-border rounded-md p-3 flex items-start gap-2.5">
                <Icon size={15} strokeWidth={1.5} className={cn("shrink-0 mt-0.5", SEVERITY_COLOR[issue.severity])} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium">{issue.title}</p>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                      {issue.category}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{issue.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
