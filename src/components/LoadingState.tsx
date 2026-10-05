import { cn } from "@/lib/utils";
import { BrandLoader } from "@/components/BrandLoader";

// Pantalla completa y sección: logo de CloudValley. Dentro de un botón o en
// una línea de texto no va: ahí el spinner chico o el texto alcanzan.
// Listas y tablas usan SkeletonSection, no este componente.
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
      <div className={cn("min-h-screen flex items-center justify-center", className)}>
        <BrandLoader size="lg" label={label} />
      </div>
    );
  }
  if (variant === "centered") {
    return (
      <div className={cn("p-8 flex justify-center", className)}>
        <BrandLoader size="md" label={label} />
      </div>
    );
  }
  return (
    <p role="status" className={cn("text-sm text-muted-foreground", className)}>
      {label}
    </p>
  );
}
