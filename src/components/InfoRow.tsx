import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function InfoRow({
  label,
  value,
  action,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 py-3", className)}>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-sm text-foreground truncate">{value}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
