import { cn } from "@/lib/utils";
import { REPORTING_STATUS_LABELS, type ReportingStatus } from "@/lib/portfolioIntelligence";

// Mismo patrón que ComplianceStatusPill.tsx — color y texto juntos, nunca
// solo color. Variantes -dark: el token base como texto no pasa WCAG AA
// (calculado, ver ComplianceStatusPill.tsx).
const STYLES: Record<ReportingStatus, string> = {
  up_to_date: "bg-success/10 text-success-dark",
  new_update: "bg-primary/10 text-primary-dark",
  needs_review: "bg-warning/15 text-warning-dark",
  awaiting_update: "bg-secondary text-secondary-foreground",
  missing_data: "bg-destructive/10 text-destructive-dark",
};

export function ReportingStatusPill({ status, className }: { status: ReportingStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap",
        STYLES[status],
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
      {REPORTING_STATUS_LABELS[status]}
    </span>
  );
}
