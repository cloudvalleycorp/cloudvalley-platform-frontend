import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RawFieldPicker } from "@/components/metrics/query-builder/RawFieldPicker";
import { QueryFilterEditor } from "@/components/metrics/query-builder/QueryFilterEditor";
import { WindowToggle } from "@/components/metrics/query-builder/WindowToggle";
import type { AggregationNode, AggregationFn } from "@/lib/querySpec";
import type { RawField } from "@/lib/metrics";

const AGGREGATION_OPTIONS: { value: AggregationFn; label: string }[] = [
  { value: "sum", label: "Suma" },
  { value: "count", label: "Cantidad de filas" },
  { value: "count_distinct", label: "Cantidad de valores únicos" },
  { value: "average", label: "Promedio" },
];

type Props = {
  value: AggregationNode;
  onChange: (next: AggregationNode) => void;
  rawFields: RawField[];
};

// field_key: requerido solo en sum/average (filtrado a campos numéricos).
// distinct_field_key: requerido solo en count_distinct (cualquier tipo).
// count puro no usa ninguno de los dos — confirmado con backend 2026-08-11.
export function AggregationFields({ value, onChange, rawFields }: Props) {
  const numericFields = rawFields.filter((f) => f.value_type === "number");

  const setAggregation = (aggregation: AggregationFn) =>
    onChange({
      ...value,
      aggregation,
      field_key: aggregation === "sum" || aggregation === "average" ? value.field_key : null,
      distinct_field_key: aggregation === "count_distinct" ? value.distinct_field_key : null,
    });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-xs shrink-0 w-16">Función</Label>
        <Select value={value.aggregation} onValueChange={(v) => setAggregation(v as AggregationFn)}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {AGGREGATION_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {(value.aggregation === "sum" || value.aggregation === "average") && (
        <div className="flex items-center gap-2">
          <Label className="text-xs shrink-0 w-16">Campo</Label>
          <RawFieldPicker value={value.field_key} onChange={(k) => onChange({ ...value, field_key: k })} rawFields={numericFields} />
        </div>
      )}
      {value.aggregation === "count_distinct" && (
        <div className="flex items-center gap-2">
          <Label className="text-xs shrink-0 w-16">Campo</Label>
          <RawFieldPicker value={value.distinct_field_key} onChange={(k) => onChange({ ...value, distinct_field_key: k })} rawFields={rawFields} />
        </div>
      )}

      <QueryFilterEditor filters={value.filters} onChange={(filters) => onChange({ ...value, filters })} rawFields={rawFields} />
      <WindowToggle window={value.window} onChange={(w) => onChange({ ...value, window: w })} />
    </div>
  );
}
