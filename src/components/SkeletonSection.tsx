import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export function SkeletonSection({
  rows = 5,
  columns = 3,
  className,
}: {
  rows?: number;
  columns?: number;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-label="Cargando…"
      className={cn("border border-border rounded-lg bg-card overflow-hidden", className)}
    >
      {Array.from({ length: rows }, (_, row) => (
        <div
          key={row}
          className="flex items-center gap-6 px-5 py-4 border-b border-border/50 last:border-0"
        >
          {Array.from({ length: columns }, (_, col) => (
            <Skeleton
              key={col}
              className={cn("h-3.5", col === 0 ? "w-1/3" : "flex-1 max-w-32")}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
