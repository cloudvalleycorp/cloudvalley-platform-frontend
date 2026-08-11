import { summarizeQuery, type QuerySpec } from "@/lib/querySpec";
import { cn } from "@/lib/utils";
import type { RawField } from "@/lib/metrics";
import type { MetricOption } from "@/components/metrics/query-builder/MetricRefPicker";

type Props = {
  query: QuerySpec | null;
  rawFields?: RawField[];
  metricOptions?: MetricOption[];
  className?: string;
};

// Resumen de solo texto de un QuerySpec — usado como "vista previa" dentro
// del builder y para mostrar una query propuesta por el agente en la card
// de confirmación de PlatformAgentPanel.tsx (ahí no hay rawFields/
// metricOptions a mano, así que cae en mostrar los ids crudos — sigue
// siendo legible, solo menos amigable que dentro del builder).
export function QuerySummary({ query, rawFields = [], metricOptions = [], className }: Props) {
  const text = summarizeQuery(query, {
    // Dos conexiones pueden tener una columna con el mismo nombre visible
    // ("Monto") mapeada a datos distintos — el field_key ya las distingue
    // sin ambigüedad, pero el resumen para humanos también necesita
    // mostrar de qué planilla/hoja viene para no confundirlas a simple vista.
    rawFieldLabel: (k) => {
      const f = rawFields.find((f) => f.field_key === k);
      if (!f) return k;
      return f.connection_label ? `${f.sample_column} (${f.connection_label})` : f.sample_column;
    },
    metricLabel: (id) => metricOptions.find((m) => m.id === id)?.name ?? id,
  });
  return <span className={cn("text-sm text-foreground", className)}>{text}</span>;
}
