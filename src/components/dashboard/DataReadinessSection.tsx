import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, ChevronRight } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";
import { SectionNum } from "@/components/dashboard/SectionNum";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonSection } from "@/components/SkeletonSection";
import type { HealthIssue, HealthIssueSeverity } from "@/lib/dataHealthIssues";
import { cn } from "@/lib/utils";

type Props = { issues: HealthIssue[]; loading: boolean };

const SEVERITY_ICON: Record<HealthIssueSeverity, typeof AlertCircle> = {
  critical: AlertCircle,
  warning: AlertTriangle,
  info: Info,
};
const SEVERITY_COLOR: Record<HealthIssueSeverity, string> = {
  critical: "text-destructive-dark bg-destructive/10",
  warning: "text-warning-dark bg-warning/15",
  info: "text-muted-foreground bg-secondary",
};

// Solo la lista de alertas de datos. Se quitó el porcentaje de "confiables": era
// una heurística propia (penalización por severidad), no un dato de backend, y
// contradecía el readiness del Roadmap (auditoría P1-02).
export function DataReadinessSection({ issues, loading }: Props) {
  return (
    <SectionCard
      padding="sm"
      title={
        <span className="flex items-center gap-2">
          <SectionNum n={2} />
          Alertas de datos
        </span>
      }
    >
      {loading ? (
        <SkeletonSection rows={3} columns={1} />
      ) : issues.length === 0 ? (
        <EmptyState bordered={false} icon={CheckCircle2} title="Todo en orden." description="No detectamos problemas de datos en este momento." />
      ) : (
        <>
          <div className="space-y-2">
            {issues.slice(0, 6).map((issue) => {
              const Icon = SEVERITY_ICON[issue.severity];
              const content = (
                <>
                  <div className={cn("w-7 h-7 rounded-md flex items-center justify-center shrink-0", SEVERITY_COLOR[issue.severity])}>
                    <Icon size={13} strokeWidth={1.5} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium">{issue.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{issue.description}</p>
                  </div>
                  {issue.targetPath && <ChevronRight size={14} strokeWidth={1.5} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
                </>
              );
              return issue.targetPath ? (
                <Link key={issue.id} to={issue.targetPath} className="flex items-start gap-2.5 hover:bg-surface/60 rounded-md p-1.5 -m-1.5 transition-colors">
                  {content}
                </Link>
              ) : (
                <div key={issue.id} className="flex items-start gap-2.5 p-1.5 -m-1.5">
                  {content}
                </div>
              );
            })}
          </div>
          {issues.length > 6 && (
            <Link to="/metrics?tab=health" className="text-xs font-medium text-primary-dark mt-3 inline-flex min-h-[1.5rem] items-center hover:underline">
              Ver los {issues.length - 6} restantes en Salud de datos →
            </Link>
          )}
        </>
      )}
    </SectionCard>
  );
}
