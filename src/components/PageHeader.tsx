import { ReactNode } from "react";
import { cn } from "@/lib/utils";

// "compact" = tipografía del mockup del Command Center (Dashboard/Roadmap/
// Data Room del founder, refactor 2026-09-04): título 22px en vez de los
// 30px de siempre. Variante, no un componente nuevo — el resto de la
// plataforma sigue con "default" sin ningún cambio.
const TITLE_SIZE = { default: "text-3xl", compact: "text-[22px]" } as const;
const SUBTITLE_SIZE = { default: "text-sm", compact: "text-[13px]" } as const;

export function PageHeader({
  title,
  subtitle,
  action,
  className,
  size = "default",
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  className?: string;
  size?: keyof typeof TITLE_SIZE;
}) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-8", className)}>
      <div className="min-w-0">
        <h1 className={cn(TITLE_SIZE[size], "font-medium tracking-tight")}>{title}</h1>
        {subtitle && <p className={cn(SUBTITLE_SIZE[size], "text-muted-foreground mt-1")}>{subtitle}</p>}
      </div>
      {action && <div className="flex items-center gap-2 sm:shrink-0">{action}</div>}
    </div>
  );
}
