import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { RELATIVE_RANGE_LABELS, type RelativeRange, type RelativeRangeKind } from "@/lib/portfolioIntelligence";
import { cn } from "@/lib/utils";

const PRESET_KINDS: RelativeRangeKind[] = ["last_30_days", "current_quarter", "last_6_months", "last_12_months", "custom"];

function currentMonthString(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

type Props = {
  value: RelativeRange;
  onChange: (range: RelativeRange) => void;
  className?: string;
};

// Reemplaza PeriodSelect (dropdown de "Marzo 2026" — un mes fijo, sin
// concepto de rango) en las pantallas investor rediseñadas. Habilita el
// modo Trend de Portfolio Compare, que con un solo período puntual no es
// viable. No toca PeriodSelect.tsx — ese sigue siendo correcto del lado
// founder, fuera de alcance de este rediseño.
export function RangeSelect({ value, onChange, className }: Props) {
  return (
    <div className={cn("flex flex-col sm:flex-row sm:items-center gap-2", className)}>
      <ToggleGroup
        type="single"
        value={value.kind}
        onValueChange={(kind) => {
          if (!kind) return;
          if (kind === "custom") {
            onChange({ kind: "custom", from: value.from ?? currentMonthString(), to: value.to ?? currentMonthString() });
          } else {
            onChange({ kind: kind as RelativeRangeKind });
          }
        }}
        className="justify-start flex-wrap"
      >
        {PRESET_KINDS.map((kind) => (
          <ToggleGroupItem key={kind} value={kind} size="sm" aria-label={RELATIVE_RANGE_LABELS[kind]} className="text-xs px-3">
            {RELATIVE_RANGE_LABELS[kind]}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      {value.kind === "custom" && (
        <div className="flex items-center gap-1.5">
          <input
            type="month"
            value={value.from ?? ""}
            onChange={(e) => onChange({ kind: "custom", from: e.target.value, to: value.to ?? currentMonthString() })}
            aria-label="Desde"
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-background h-9"
          />
          <span className="text-xs text-muted-foreground">a</span>
          <input
            type="month"
            value={value.to ?? ""}
            onChange={(e) => onChange({ kind: "custom", from: value.from ?? currentMonthString(), to: e.target.value })}
            aria-label="Hasta"
            className="border border-border rounded-md px-2 py-1.5 text-xs bg-background h-9"
          />
        </div>
      )}
    </div>
  );
}
