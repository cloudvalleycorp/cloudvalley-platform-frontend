import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type DataTableColumn<T> = {
  header: ReactNode;
  onHeaderClick?: () => void;
  align?: "left" | "right";
  cellClassName?: string;
  cell: (row: T) => ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyLabel,
  onRowClick,
  className,
  selectable = false,
  selectedKeys,
  onSelectionChange,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel: ReactNode;
  onRowClick?: (row: T) => void;
  className?: string;
  /** Suma una columna de checkbox a la izquierda (selección para acciones en
   * bloque) — aditivo, no afecta a ningún uso existente que no lo pase. */
  selectable?: boolean;
  selectedKeys?: Set<string>;
  onSelectionChange?: (keys: Set<string>) => void;
}) {
  const allSelected = selectable && rows.length > 0 && rows.every((r) => selectedKeys?.has(rowKey(r)));
  const toggleAll = () => {
    if (!onSelectionChange) return;
    onSelectionChange(allSelected ? new Set() : new Set(rows.map(rowKey)));
  };
  const toggleRow = (key: string) => {
    if (!onSelectionChange) return;
    const next = new Set(selectedKeys);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onSelectionChange(next);
  };

  return (
    <div className={cn("border border-border rounded-lg bg-card overflow-x-auto", className)}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-muted-foreground border-b border-border">
            {selectable && (
              <th className="px-5 py-3 w-10">
                <input
                  type="checkbox"
                  checked={allSelected}
                  onChange={toggleAll}
                  aria-label={allSelected ? "Deseleccionar todo" : "Seleccionar todo"}
                />
              </th>
            )}
            {columns.map((col, i) => (
              <th
                key={i}
                onClick={col.onHeaderClick}
                tabIndex={col.onHeaderClick ? 0 : undefined}
                role={col.onHeaderClick ? "button" : undefined}
                onKeyDown={
                  col.onHeaderClick
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          col.onHeaderClick!();
                        }
                      }
                    : undefined
                }
                className={cn(
                  "font-normal px-5 py-3",
                  col.align === "right" ? "text-right" : "text-left",
                  col.onHeaderClick && "cursor-pointer",
                )}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className={cn(
                "border-b border-border/50 last:border-0 hover:bg-surface transition-all align-top",
                onRowClick && "cursor-pointer",
              )}
              onClick={() => onRowClick?.(row)}
              tabIndex={onRowClick ? 0 : undefined}
              role={onRowClick ? "button" : undefined}
              onKeyDown={
                onRowClick
                  ? (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onRowClick(row);
                      }
                    }
                  : undefined
              }
            >
              {selectable && (
                <td className="px-5 py-4" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={!!selectedKeys?.has(rowKey(row))}
                    onChange={() => toggleRow(rowKey(row))}
                    aria-label="Seleccionar fila"
                  />
                </td>
              )}
              {columns.map((col, i) => (
                <td
                  key={i}
                  className={cn("px-5 py-4", col.align === "right" && "text-right", col.cellClassName)}
                >
                  {col.cell(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length + (selectable ? 1 : 0)} className="p-0">
                {typeof emptyLabel === "string" ? (
                  <div className="py-12 text-center text-muted-foreground">{emptyLabel}</div>
                ) : (
                  emptyLabel
                )}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
