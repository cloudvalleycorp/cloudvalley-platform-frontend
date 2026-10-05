import { ReactNode } from "react";
import { cn } from "@/lib/utils";

// "compact" = tipografía del mockup del Command Center (Dashboard/Roadmap/
// Data Room del founder, refactor 2026-09-04): título 22px en vez de los
// 30px de siempre. Variante, no un componente nuevo — el resto de la
// plataforma sigue con "default" sin ningún cambio.
const TITLE_SIZE = { default: "text-3xl", compact: "text-[1.375rem]" } as const;
const SUBTITLE_SIZE = { default: "text-sm", compact: "text-sm" } as const;

export function PageHeader({
  title,
  subtitle,
  action,
  className,
  size = "default",
  wrapActions = false,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  size?: keyof typeof TITLE_SIZE;
  // Con muchas acciones (editor de reporte) los botones bajan de línea en vez
  // de empujar al título a una columna angosta. Por defecto no cambia nada.
  wrapActions?: boolean;
}) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8", className)}>
      <div className="min-w-0">
        <h1 className={cn(TITLE_SIZE[size], "font-medium tracking-tight")}>{title}</h1>
        {subtitle && <p className={cn(SUBTITLE_SIZE[size], "text-muted-foreground mt-1")}>{subtitle}</p>}
      </div>
      {action && (
        <div
          className={cn(
            "flex items-center gap-2",
            wrapActions ? "flex-wrap justify-end min-w-0 sm:flex-1" : "sm:shrink-0"
          )}
        >
          {action}
        </div>
      )}
    </div>
  );
}
