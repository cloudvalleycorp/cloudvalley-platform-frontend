import { cn } from "@/lib/utils";

export function StatusBadge({
  isActive,
  activeLabel = "Activo",
  inactiveLabel = "Inactivo",
}: {
  isActive: boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border",
        isActive
          ? "bg-emerald-100 text-emerald-800 border-emerald-200"
          : "bg-red-100 text-red-800 border-red-200",
      )}
    >
      {isActive ? activeLabel : inactiveLabel}
    </span>
  );
}
