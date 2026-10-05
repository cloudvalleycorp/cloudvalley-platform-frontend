import { cn } from "@/lib/utils";

// Carga de pantalla o de sección: logo fijo y el texto visible dice qué se carga.
// Sin animación de respiración ni de aparición (revertidas a pedido).
export function BrandLoader({
  size = "md",
  label = "Cargando…",
  className,
}: {
  size?: "md" | "lg";
  label?: string;
  className?: string;
}) {
  return (
    <div role="status" className={cn("flex flex-col items-center justify-center gap-3", className)}>
      <img
        src="/logo.svg"
        alt=""
        aria-hidden="true"
        className={size === "lg" ? "h-14 w-14" : "h-10 w-10"}
      />
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
