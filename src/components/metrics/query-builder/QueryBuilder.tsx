import { Button } from "@/components/ui/button";
import { QueryNodeEditor } from "@/components/metrics/query-builder/QueryNodeEditor";
import { QuerySummary } from "@/components/metrics/query-builder/QuerySummary";
import type { MetricOption } from "@/components/metrics/query-builder/MetricRefPicker";
import { blankAggregationNode, blankMetricRefNode, blankConstantNode, type QuerySpec } from "@/lib/querySpec";
import type { RawField } from "@/lib/metrics";

type Props = {
  value: QuerySpec | null;
  onChange: (next: QuerySpec | null) => void;
  rawFields: RawField[];
  metricOptions: MetricOption[];
};

// Raíz del árbol de consulta — reemplaza al viejo editor de fórmula por
// texto (FormulaField.tsx) para métricas calculadas nuevas. value===null
// muestra el picker inicial; "arithmetic" nunca es un punto de partida
// válido (solo se llega ahí envolviendo un nodo existente vía "Combinar
// con…", ver NodeShell.tsx) — así el anidado ilimitado sale gratis del
// mismo mecanismo que arma el primer nivel.
export function QueryBuilder({ value, onChange, rawFields, metricOptions }: Props) {
  if (!value) {
    return (
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">Elegí cómo empieza la consulta:</p>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(blankAggregationNode())}>
            Agregación de datos
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(blankMetricRefNode())}>
            Otra métrica
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => onChange(blankConstantNode())}>
            Número fijo
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <QueryNodeEditor
        value={value}
        onChange={onChange}
        onRemove={() => onChange(null)}
        rawFields={rawFields}
        metricOptions={metricOptions}
        depth={0}
      />
      <div className="rounded-md border border-border bg-surface px-3 py-2">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground mr-1.5">Vista previa:</span>
        <QuerySummary query={value} rawFields={rawFields} metricOptions={metricOptions} className="text-xs" />
      </div>
    </div>
  );
}
