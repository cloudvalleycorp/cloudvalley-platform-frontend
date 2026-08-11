import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { QueryWindow } from "@/lib/querySpec";

type Props = {
  window?: QueryWindow;
  onChange: (next: QueryWindow | undefined) => void;
};

type WindowMode = "point" | "cumulative" | "rolling";

function modeOf(window: QueryWindow | undefined): WindowMode {
  if (!window) return "point";
  return window.months == null ? "cumulative" : "rolling";
}

// Tres estados con semántica distinta (confirmado con backend 2026-08-11),
// no intercambiables:
//   ausente        → puntual: solo el período evaluado.
//   {months: null} → acumulado: sin límite inferior, desde el primer dato.
//   {months: N}    → ventana móvil de N meses terminando en el período evaluado.
export function WindowToggle({ window, onChange }: Props) {
  const mode = modeOf(window);

  const setMode = (next: WindowMode) => {
    if (next === "point") onChange(undefined);
    else if (next === "cumulative") onChange({ months: null });
    else onChange({ months: window?.months ?? 3 });
  };

  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs shrink-0 w-16">Período</Label>
      <Select value={mode} onValueChange={(v) => setMode(v as WindowMode)}>
        <SelectTrigger className="h-8 text-xs flex-1">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="point">Solo este período</SelectItem>
          <SelectItem value="cumulative">Acumulado (desde el primer dato)</SelectItem>
          <SelectItem value="rolling">Ventana móvil de N meses</SelectItem>
        </SelectContent>
      </Select>
      {mode === "rolling" && (
        <>
          <Input
            type="number"
            min={1}
            className="h-8 w-16 text-xs shrink-0"
            value={window?.months ?? 3}
            onChange={(e) => onChange({ months: Math.max(1, Number(e.target.value) || 1) })}
            aria-label="Meses de la ventana móvil"
          />
          <span className="text-xs text-muted-foreground shrink-0">meses</span>
        </>
      )}
    </div>
  );
}
