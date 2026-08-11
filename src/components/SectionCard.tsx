import { ReactNode } from "react";
import { cn } from "@/lib/utils";

const PADDING = {
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
} as const;

export function SectionCard({
  title,
  description,
  action,
  children,
  padding = "md",
  className,
}: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  padding?: keyof typeof PADDING;
  className?: string;
}) {
  return (
    <section className={cn("border border-border rounded-lg bg-card", PADDING[padding], className)}>
      {(title || action) && (
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-medium text-foreground">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground mt-1">{description}</p>}
          </div>
          {action && <div className="flex items-center gap-2 sm:shrink-0">{action}</div>}
        </div>
      )}
      {!title && description && <p className="text-xs text-muted-foreground mb-4">{description}</p>}
      {children}
    </section>
  );
}
