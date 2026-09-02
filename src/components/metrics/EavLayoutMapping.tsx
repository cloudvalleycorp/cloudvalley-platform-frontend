import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { EavMetricMapping } from "@/lib/sheetsIntegration";

type Props = {
  periodColumn: string;
  metricNameColumn: string;
  valueColumn: string;
  metricMapping: EavMetricMapping[];
  onChange: (next: EavMetricMapping[]) => void;
};

// Mapeo para hojas "eav" (formato vertical: una columna de período, una de
// nombre de métrica, una de valor — ej. "date | metric | value" en vez de
// una columna por métrica). Cada valor distinto visto en la columna de
// nombre de métrica se mapea a un field_key propio.
export function EavLayoutMapping({ periodColumn, metricNameColumn, valueColumn, metricMapping, onChange }: Props) {
  const updateRow = (i: number, patch: Partial<EavMetricMapping>) => {
    onChange(metricMapping.map((m, idx) => (idx === i ? { ...m, ...patch } : m)));
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground grid sm:grid-cols-3 gap-2">
        <div>
          <span className="text-tertiary">Columna de período</span>
          <p className="font-medium text-foreground">{periodColumn}</p>
        </div>
        <div>
          <span className="text-tertiary">Columna de nombre de métrica</span>
          <p className="font-medium text-foreground">{metricNameColumn}</p>
        </div>
        <div>
          <span className="text-tertiary">Columna de valor</span>
          <p className="font-medium text-foreground">{valueColumn}</p>
        </div>
      </div>

      <div>
        <p className="text-xs font-medium mb-1.5">Métricas encontradas en "{metricNameColumn}" ({metricMapping.length})</p>
        <div className="space-y-1.5">
          {metricMapping.map((m, i) => (
            <div key={`${m.observed_value}-${i}`} className="flex items-center gap-2 border border-border rounded-md p-2 bg-surface">
              <p className="text-sm font-medium min-w-0 flex-1 truncate" title={m.observed_value}>
                {m.observed_value}
              </p>
              <Input
                value={m.field_key}
                onChange={(e) => updateRow(i, { field_key: e.target.value })}
                className="h-8 w-40 text-xs font-mono shrink-0"
                aria-label={`Nombre de campo para ${m.observed_value}`}
              />
              <Select value={m.value_type} onValueChange={(v) => updateRow(i, { value_type: v as EavMetricMapping["value_type"] })}>
                <SelectTrigger className="h-8 w-24 text-xs shrink-0" aria-label={`Tipo de dato para ${m.observed_value}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="number">Número</SelectItem>
                  <SelectItem value="text">Texto</SelectItem>
                </SelectContent>
              </Select>
              <Select value={m.data_maturity} onValueChange={(v) => updateRow(i, { data_maturity: v as "raw" | "calculated" })}>
                <SelectTrigger className="h-8 w-28 text-xs shrink-0" aria-label={`¿Dato crudo o calculado? para ${m.observed_value}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="raw">Dato crudo</SelectItem>
                  <SelectItem value="calculated">Ya calculado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          ))}
          {metricMapping.length === 0 && (
            <p className="text-xs text-muted-foreground">No se encontró ningún valor de métrica en esta columna.</p>
          )}
        </div>
      </div>
    </div>
  );
}
