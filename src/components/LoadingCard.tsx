import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function LoadingCard({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div
      role="status"
      aria-label="Cargando…"
      className={cn("border border-border rounded-lg bg-card p-6 space-y-4", className)}
    >
      <Skeleton className="h-4 w-1/3" />
      <div className="space-y-2.5">
        {Array.from({ length: lines }, (_, i) => (
          <Skeleton key={i} className={cn("h-3", i === lines - 1 ? "w-2/3" : "w-full")} />
        ))}
      </div>
    </div>
  );
}
