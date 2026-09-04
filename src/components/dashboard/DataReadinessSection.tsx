import { Link } from "react-router-dom";
import { CheckCircle2, AlertTriangle, AlertCircle, Info, ChevronRight, ShieldCheck } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonSection } from "@/components/SkeletonSection";
import { summarizeHealth, type HealthIssue, type HealthIssueSeverity } from "@/lib/dataHealthIssues";
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

// Heurística propia, no un endpoint (no existe un "score de calidad de
// datos" real en backend todavía — ver Fase 8 del plan, pedido de
// desglose por dominio queda como mejora futura). Penaliza por severidad,
// clamp a [0,100] — es una aproximación legible ("cuántos problemas reales
// hay pesados por gravedad"), no una medición precisa. Documentado acá y en
// docs/design-system-command-center.md para que no se lea como un número
// certificado por backend.
function readinessPct(issues: HealthIssue[]): number {
  const s = summarizeHealth(issues);
  const penalty = s.critical * 15 + s.warning * 7 + s.info * 2;
  return Math.max(0, Math.min(100, 100 - penalty));
}

export function DataReadinessSection({ issues, loading }: Props) {
  const pct = readinessPct(issues);
  const summary = summarizeHealth(issues);

  return (
    <SectionCard
      padding="sm"
      title={
        <span className="flex items-center gap-1.5">
          <ShieldCheck size={14} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          Data Readiness
        </span>
      }
    >
      {loading ? (
        <SkeletonSection rows={3} columns={1} />
      ) : issues.length === 0 ? (
        <EmptyState bordered={false} icon={CheckCircle2} title="Todo en orden." description="No detectamos problemas de datos en este momento." />
      ) : (
        <>
          <div className="flex items-center gap-3 mb-4">
            <div
              className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center text-[11px] font-semibold"
              style={{
                background: `conic-gradient(hsl(var(--warning)) 0% ${pct}%, hsl(var(--border)) ${pct}% 100%)`,
              }}
            >
              <div className="w-[34px] h-[34px] rounded-full bg-card flex items-center justify-center">{pct}%</div>
            </div>
            <p className="text-xs text-muted-foreground">
              Tus insights hoy son <span className="font-medium text-foreground">{pct}% confiables</span>. {summary.critical + summary.warning} problema
              {summary.critical + summary.warning === 1 ? "" : "s"} de impacto {summary.critical > 0 ? "alto" : "medio"} recomendado
              {summary.critical + summary.warning === 1 ? "" : "s"} de resolver.
            </p>
          </div>
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
                    <p className="text-[11px] text-muted-foreground mt-0.5 truncate">{issue.description}</p>
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
            <Link to="/metrics?tab=health" className="text-xs font-medium text-primary mt-3 inline-block hover:underline">
              Ver los {issues.length - 6} restantes en Salud de datos →
            </Link>
          )}
        </>
      )}
    </SectionCard>
  );
}
