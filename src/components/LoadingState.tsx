import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export function LoadingState({
  variant = "centered",
  label = "Cargando…",
  className,
}: {
  variant?: "inline" | "centered" | "fullScreen";
  label?: string;
  className?: string;
}) {
  if (variant === "fullScreen") {
    return (
      <div
        role="status"
        className={cn("min-h-screen flex items-center justify-center", className)}
      >
        <img src="/logo.svg" alt="" className="h-10 w-10 animate-fade-in" />
        <span className="sr-only">{label}</span>
      </div>
    );
  }
  if (variant === "centered") {
    return (
      <div role="status" className={cn("p-8 flex flex-col items-center gap-2.5", className)}>
        <Skeleton className="h-3.5 w-40" />
        <Skeleton className="h-3 w-56" />
        <Skeleton className="h-3 w-32" />
        <span className="sr-only">{label}</span>
      </div>
    );
  }
  return (
    <p role="status" className={cn("text-sm text-muted-foreground", className)}>
      {label}
    </p>
  );
}
