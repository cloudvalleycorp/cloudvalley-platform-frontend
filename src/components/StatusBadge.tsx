import { Badge } from "@/components/ui/badge";

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
    <Badge variant={isActive ? "success" : "destructive"}>
      {isActive ? activeLabel : inactiveLabel}
    </Badge>
  );
}
