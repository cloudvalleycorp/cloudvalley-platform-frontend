import { cn } from "@/lib/utils";
import { SOURCE_STATUS_LABELS, type SourceStatus } from "@/lib/dataFreshness";

// Mismo patrón que ReportingStatusPill.tsx (investor) — color y texto
// juntos, nunca solo color.
const STYLES: Record<SourceStatus, string> = {
  up_to_date: "bg-success/10 text-success",
  recent: "bg-secondary text-secondary-foreground",
  stale: "bg-warning/15 text-warning",
  critical: "bg-destructive/10 text-destructive",
  never_synced: "bg-destructive/10 text-destructive",
  sync_error: "bg-destructive/10 text-destructive",
  reconnect_required: "bg-destructive/10 text-destructive",
};

export function SourceStatusPill({ status, className }: { status: SourceStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap",
        STYLES[status],
        className
      )}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-current shrink-0" aria-hidden="true" />
      {SOURCE_STATUS_LABELS[status]}
    </span>
  );
}
