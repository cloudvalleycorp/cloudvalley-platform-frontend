import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function StatCard({
  label,
  value,
  suffix,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  suffix?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("border border-border rounded-lg bg-card p-5", className)}>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-3xl font-medium tracking-tight mt-2 tabular-nums">
        {value}
        {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}
