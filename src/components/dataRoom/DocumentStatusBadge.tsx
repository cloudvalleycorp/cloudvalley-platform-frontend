import { Badge } from "@/components/ui/badge";
import type { DocumentStatus } from "@/lib/dataRoom";

const CONFIG: Record<DocumentStatus, { label: string; variant: "secondary" | "warning" | "success" }> = {
  missing: { label: "Falta", variant: "secondary" },
  uploaded: { label: "Subido", variant: "warning" },
  verified: { label: "Verificado", variant: "success" },
};

export function DocumentStatusBadge({ status }: { status: DocumentStatus }) {
  const { label, variant } = CONFIG[status];
  return <Badge variant={variant}>{label}</Badge>;
}
