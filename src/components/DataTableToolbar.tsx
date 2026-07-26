import { ReactNode } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function DataTableToolbar({
  search,
  onSearchChange,
  searchPlaceholder = "Buscar…",
  filters,
  actions,
  className,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
  searchPlaceholder?: string;
  filters?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2 mb-4", className)}>
      {onSearchChange && (
        <div className="relative flex-1 min-w-[200px]">
          <Search
            size={14}
            strokeWidth={1.5}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="pl-9 h-9"
          />
        </div>
      )}
      {filters}
      {actions && <div className="flex items-center gap-2 ml-auto">{actions}</div>}
    </div>
  );
}
