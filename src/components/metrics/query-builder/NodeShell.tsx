import { useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { ArithmeticOperator } from "@/lib/querySpec";

const COMBINE_OPTIONS: { op: ArithmeticOperator; label: string }[] = [
  { op: "+", label: "+ Sumar" },
  { op: "-", label: "− Restar" },
  { op: "*", label: "× Multiplicar" },
  { op: "/", label: "÷ Dividir" },
];

type Props = {
  depth: number;
  onCombine: (op: ArithmeticOperator) => void;
  onRemove?: () => void;
  children: React.ReactNode;
};

// Chrome compartido por cada nodo del árbol de QuerySpec: el control
// "Combinar con…" (envuelve el nodo actual en un arithmetic, disponible en
// CUALQUIER nodo — incluidos los arithmetic, así el anidado no tiene límite)
// y "Quitar" (solo si el padre pasó onRemove). El contenido específico del
// tipo de nodo (selector de tipo, campos de agregación, etc.) lo arma
// QueryNodeEditor y se pasa como children.
export function NodeShell({ depth, onCombine, onRemove, children }: Props) {
  const [combineOpen, setCombineOpen] = useState(false);
  return (
    <div className={cn("rounded-md border border-border p-2.5 space-y-2", depth > 0 && "bg-surface/50")}>
      <div className="flex items-center justify-end gap-1">
        <Popover open={combineOpen} onOpenChange={setCombineOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs">
              Combinar con…
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-36 p-1" align="end">
            <div className="flex flex-col">
              {COMBINE_OPTIONS.map(({ op, label }) => (
                <button
                  key={op}
                  type="button"
                  onClick={() => {
                    onCombine(op);
                    setCombineOpen(false);
                  }}
                  className="w-full text-left px-2 py-1.5 text-xs rounded hover:bg-surface transition-colors"
                >
                  {label}
                </button>
              ))}
            </div>
          </PopoverContent>
        </Popover>
        {onRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onRemove}
            aria-label="Quitar"
          >
            <X size={12} aria-hidden="true" />
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}
