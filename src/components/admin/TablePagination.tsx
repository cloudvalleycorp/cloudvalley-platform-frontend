import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function TablePagination({
  page,
  totalPages,
  totalCount,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  totalCount: number;
  onPageChange: (page: number) => void;
}) {
  if (totalCount === 0) return null;
  return (
    <div className="flex items-center justify-between mt-4 text-xs text-muted-foreground">
      <span>
        {totalCount} {totalCount === 1 ? "resultado" : "resultados"}
        {totalPages > 1 && ` · Página ${page} de ${totalPages}`}
      </span>
      {totalPages > 1 && (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => onPageChange(page - 1)}
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => onPageChange(page + 1)}
          >
            <ChevronRight size={14} strokeWidth={1.5} />
          </Button>
        </div>
      )}
    </div>
  );
}
