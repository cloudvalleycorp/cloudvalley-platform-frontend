import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { NodeShell } from "@/components/metrics/query-builder/NodeShell";
import { AggregationFields } from "@/components/metrics/query-builder/AggregationFields";
import { MetricRefPicker, type MetricOption } from "@/components/metrics/query-builder/MetricRefPicker";
import {
  blankAggregationNode,
  blankMetricRefNode,
  blankConstantNode,
  wrapInArithmetic,
  type QuerySpec,
  type ArithmeticOperator,
} from "@/lib/querySpec";
import type { RawField } from "@/lib/metrics";

type LeafType = "aggregation" | "metric_ref" | "constant";

const ARITHMETIC_LABELS: Record<ArithmeticOperator, string> = { "+": "+ Sumar", "-": "− Restar", "*": "× Multiplicar", "/": "÷ Dividir" };

type Props = {
  value: QuerySpec;
  onChange: (next: QuerySpec) => void;
  // Solo lo pasa el padre arithmetic a cada uno de sus dos operandos —
  // invocarlo colapsa el arithmetic reemplazándolo por el OTRO operando.
  // undefined en la raíz (ahí "quitar" lo maneja QueryBuilder, vacía todo).
  onRemove?: () => void;
  rawFields: RawField[];
  metricOptions: MetricOption[];
  depth: number;
};

// El componente recursivo real del árbol: se auto-referencia para renderizar
// left/right de un nodo arithmetic. Cada nodo es controlado (value/onChange),
// sin estado global ni ids sintéticos — el árbol completo vive en un solo
// useState más arriba (draft.query en useMetricPropertyForm.ts).
export function QueryNodeEditor({ value, onChange, onRemove, rawFields, metricOptions, depth }: Props) {
  const handleCombine = (op: ArithmeticOperator) => onChange(wrapInArithmetic(op, value));

  if (value.type === "arithmetic") {
    return (
      <NodeShell depth={depth} onCombine={handleCombine} onRemove={onRemove}>
        <Select value={value.operator} onValueChange={(op) => onChange({ ...value, operator: op as ArithmeticOperator })}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.entries(ARITHMETIC_LABELS) as [ArithmeticOperator, string][]).map(([op, label]) => (
              <SelectItem key={op} value={op}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="space-y-2 border-l-2 border-border ml-1 pl-3">
          <QueryNodeEditor
            value={value.left}
            onChange={(left) => onChange({ ...value, left })}
            onRemove={() => onChange(value.right)}
            rawFields={rawFields}
            metricOptions={metricOptions}
            depth={depth + 1}
          />
          <QueryNodeEditor
            value={value.right}
            onChange={(right) => onChange({ ...value, right })}
            onRemove={() => onChange(value.left)}
            rawFields={rawFields}
            metricOptions={metricOptions}
            depth={depth + 1}
          />
        </div>
      </NodeShell>
    );
  }

  const setLeafType = (t: LeafType) => {
    if (t === "aggregation") onChange(blankAggregationNode());
    else if (t === "metric_ref") onChange(blankMetricRefNode());
    else onChange(blankConstantNode());
  };

  return (
    <NodeShell depth={depth} onCombine={handleCombine} onRemove={onRemove}>
      <Select value={value.type} onValueChange={(t) => setLeafType(t as LeafType)}>
        <SelectTrigger className="h-8 w-48 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="aggregation">Agregación de datos</SelectItem>
          <SelectItem value="metric_ref">Otra métrica</SelectItem>
          <SelectItem value="constant">Número fijo</SelectItem>
        </SelectContent>
      </Select>

      {value.type === "aggregation" && <AggregationFields value={value} onChange={onChange} rawFields={rawFields} />}
      {value.type === "metric_ref" && (
        <MetricRefPicker value={value.metric_id} onChange={(id) => onChange({ type: "metric_ref", metric_id: id })} metricOptions={metricOptions} />
      )}
      {value.type === "constant" && (
        <Input
          type="number"
          className="h-8 text-xs w-32"
          value={value.value}
          onChange={(e) => onChange({ type: "constant", value: Number(e.target.value) })}
          aria-label="Valor constante"
        />
      )}
    </NodeShell>
  );
}
