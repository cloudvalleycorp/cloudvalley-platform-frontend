import { cn } from "@/lib/utils";

export function LoadingState({
  variant = "inline",
  label = "Cargando…",
  className,
}: {
  variant?: "inline" | "centered" | "fullScreen";
  label?: string;
  className?: string;
}) {
  if (variant === "fullScreen") {
    return (
      <div className={cn("min-h-screen flex items-center justify-center text-sm text-muted-foreground", className)}>
        {label}
      </div>
    );
  }
  if (variant === "centered") {
    return <div className={cn("p-8 text-center text-sm text-muted-foreground", className)}>{label}</div>;
  }
  return <p className={cn("text-sm text-muted-foreground", className)}>{label}</p>;
}
