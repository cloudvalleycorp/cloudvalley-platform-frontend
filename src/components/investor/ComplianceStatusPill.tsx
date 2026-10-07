import { cn } from "@/lib/utils";
import { COMPLIANCE_STATUS_LABELS, type ComplianceStatus } from "@/lib/metricRequirements";

// Cada estado se distingue por color Y texto (nunca solo color) — 6 estados
// reales más not_required_then, que en la práctica no debería llegar a
// pintarse en el dashboard del período vigente (se pliega en coverage).
// Los 4 primeros usaban el token base como color de TEXTO (success 2.22:1,
// warning 1.75:1, destructive 3.55:1, primary ~2.70:1 contra blanco,
// calculado — un fondo teñido al 10-15% no cambia esto de forma
// significativa) — todos por debajo de 4.5:1. Las variantes -dark existen
// justo para esto (CLAUDE.md, verificadas: 6.11/4.81/6.20:1); primary-dark
// se corrigió hoy a ~5.95:1 para el mismo uso.
const STYLES: Record<ComplianceStatus, string> = {
  ok: "bg-success/10 text-success-dark",
  pending: "bg-primary/10 text-primary-dark",
  no_data: "bg-warning/15 text-warning-dark",
  error: "bg-destructive/10 text-destructive-dark",
  unfulfilled: "bg-muted text-muted-foreground",
  not_applicable: "bg-secondary text-secondary-foreground",
  not_required_then: "bg-muted text-muted-foreground",
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
