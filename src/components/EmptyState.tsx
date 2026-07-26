import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type EmptyStateAction = {
  label: string;
  onClick: () => void;
};

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondaryAction,
  bordered = true,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  secondaryAction?: EmptyStateAction;
  /** Set to false when nesting inside a container that already has its own border/card (e.g. DataTable). */
  bordered?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "p-12 text-center animate-fade-in",
        bordered && "border border-border rounded-lg bg-card",
        className,
      )}
    >
      {Icon && (
        <div className="mx-auto mb-4 flex h-10 w-10 items-center justify-center rounded-full bg-muted">
          <Icon size={18} strokeWidth={1.5} className="text-muted-foreground" />
        </div>
      )}
      <div className="text-sm font-medium text-foreground">{title}</div>
      {description && (
        <p className="mt-1 text-sm text-muted-foreground max-w-sm mx-auto">{description}</p>
      )}
      {(action || secondaryAction) && (
        <div className="mt-5 flex items-center justify-center gap-2">
          {secondaryAction && (
            <Button variant="outline" onClick={secondaryAction.onClick}>
              {secondaryAction.label}
            </Button>
          )}
          {action && <Button onClick={action.onClick}>{action.label}</Button>}
        </div>
      )}
    </div>
  );
}
