import { AlertTriangle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ConceptAxisEntry, PeriodAxisEntry } from "@/lib/sheetsIntegration";

type Props = {
  periodOrientation: "columns" | "rows";
  periodAxis: PeriodAxisEntry[];
  conceptAxis: ConceptAxisEntry[];
  onChange: (next: ConceptAxisEntry[]) => void;
};

// Mapeo para hojas "grid" (período en un eje, conceptos en el otro — ej. un
// estado de resultados con meses en columnas). extract-sheet-layout nunca
// manda los valores numéricos de la hoja, solo posiciones/nombres — acá
// solo se confirma/corrige QUÉ es cada fila/columna, los valores reales se
// ven en la vista previa de datos que ya está arriba en el wizard.
export function GridLayoutMapping({ periodOrientation, periodAxis, conceptAxis, onChange }: Props) {
  const updateConcept = (index: number, patch: Partial<ConceptAxisEntry>) => {
    onChange(conceptAxis.map((c) => (c.index === index ? { ...c, ...patch } : c)));
  };

  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium mb-1.5">
          Períodos detectados ({periodOrientation === "columns" ? "en columnas" : "en filas"})
        </p>
        <div className="flex flex-wrap gap-1.5">
          {periodAxis.map((p) => (
            <Badge key={p.index} variant="outline" className="text-[11px] font-mono">
              {p.period}
            </Badge>
          ))}
        </div>
        {periodAxis.length === 0 && (
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <AlertTriangle size={12} strokeWidth={1.5} /> No se detectó ningún período — revisá manualmente antes de confirmar.
          </p>
        )}
      </div>

      <div>
        <p className="text-xs font-medium mb-1.5">Conceptos detectados ({conceptAxis.length})</p>
        <div className="space-y-1.5">
          {conceptAxis.map((c) => (
            <div key={c.index} className="flex items-center gap-2 border border-border rounded-md p-2 bg-surface">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium truncate" title={c.label}>
                  {c.label}
                </p>
                {c.derived_from && c.derived_from.length > 0 && (
                  <p className="text-[11px] text-tertiary truncate">Calculado a partir de: {c.derived_from.join(", ")}</p>
                )}
              </div>
              <Input
                value={c.suggested_field_key}
                onChange={(e) => updateConcept(c.index, { suggested_field_key: e.target.value })}
                className="h-8 w-40 text-xs font-mono shrink-0"
                aria-label={`Nombre de campo para ${c.label}`}
              />
              <Select value={c.value_type} onValueChange={(v) => updateConcept(c.index, { value_type: v as ConceptAxisEntry["value_type"] })}>
                <SelectTrigger className="h-8 w-24 text-xs shrink-0" aria-label={`Tipo de dato para ${c.label}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="text">Texto</SelectItem>
                </SelectContent>
              </Select>
              <Select
                value={c.data_maturity}
                onValueChange={(v) => updateConcept(c.index, { data_maturity: v as "raw" | "calculated" })}
              >
                <SelectTrigger className="h-8 w-28 text-xs shrink-0" aria-label={`¿Dato crudo o calculado? para ${c.label}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="raw">Dato crudo</SelectItem>
                  <SelectItem value="calculated">Ya calculado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-tertiary mt-1.5">
          "Ya calculado" significa que la planilla ya hizo la cuenta (ej. EBITDA) — se guarda tal cual, sin volver a
          sumarlo.
        </p>
      </div>
    </div>
  );
}
