import { cn } from "@/lib/utils";
import { COMPLIANCE_STATUS_LABELS, type ComplianceStatus } from "@/lib/metricRequirements";

// Cada estado se distingue por color Y texto (nunca solo color) — 6 estados
// reales más not_required_then, que en la práctica no debería llegar a
// pintarse en el dashboard del período vigente (se pliega en coverage).
const STYLES: Record<ComplianceStatus, string> = {
  ok: "bg-success/10 text-success",
  pending: "bg-primary/10 text-primary",
  no_data: "bg-warning/15 text-warning",
  error: "bg-destructive/10 text-destructive",
  unfulfilled: "bg-muted text-muted-foreground",
  not_applicable: "bg-secondary text-secondary-foreground",
  not_required_then: "bg-muted text-tertiary",
};

export function ComplianceStatusPill({ status, className }: { status: ComplianceStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap",
        STYLES[status],
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
      {COMPLIANCE_STATUS_LABELS[status]}
    </span>
  );
}
