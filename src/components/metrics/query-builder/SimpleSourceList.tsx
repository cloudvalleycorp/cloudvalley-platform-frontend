import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RawFieldPicker } from "@/components/metrics/query-builder/RawFieldPicker";
import { blankAggregationNode, wrapInArithmetic, type AggregationNode, type AggregationFn, type QuerySpec } from "@/lib/querySpec";
import type { RawField } from "@/lib/metrics";

// ¿Esta query se puede mostrar como una lista plana "fuente + fuente + ..."?
// Solo agregaciones sin filtros/ventana, combinadas por suma — cualquier otra
// forma (filtros, ventana, referencia a otra métrica, resta/multiplicación)
// no es representable acá y cae al editor avanzado (QueryBuilder), que sigue
// intacto y con toda su capacidad. null = no representable, [] = vacía (punto
// de partida), N = N fuentes.
export function flattenSimpleSources(q: QuerySpec | null): AggregationNode[] | null {
  if (!q) return [];
  if (q.type === "aggregation") return q.filters.length === 0 && !q.window ? [q] : null;
  if (q.type === "arithmetic" && q.operator === "+") {
    const left = flattenSimpleSources(q.left);
    const right = flattenSimpleSources(q.right);
    return left && right ? [...left, ...right] : null;
  }
  return null;
}

export function buildSimpleSources(leaves: AggregationNode[]): QuerySpec | null {
  if (leaves.length === 0) return null;
  return leaves.slice(1).reduce<QuerySpec>((acc, leaf) => wrapInArithmetic("+", acc, leaf), leaves[0]);
}

type Props = {
  leaves: AggregationNode[];
  onChange: (next: QuerySpec | null) => void;
  rawFields: RawField[];
  onSwitchToAdvanced: () => void;
};

// Vista por default de "Consulta" para el caso más común (sumar 1+ fuentes) —
// reemplaza al árbol crudo del QueryBuilder como primera pantalla: acá
// combinar una 2ª fuente es un botón siempre visible, no algo escondido
// dentro de un nodo ya agregado ("Combinar con…").
export function SimpleSourceList({ leaves, onChange, rawFields, onSwitchToAdvanced }: Props) {
  const numericFields = rawFields.filter((f) => f.value_type === "number");

  const updateLeaf = (i: number, next: AggregationNode) => {
    const copy = leaves.slice();
    copy[i] = next;
    onChange(buildSimpleSources(copy));
  };
  const removeLeaf = (i: number) => {
    const copy = leaves.slice();
    copy.splice(i, 1);
    onChange(buildSimpleSources(copy));
  };
  const addLeaf = () => onChange(buildSimpleSources([...leaves, blankAggregationNode()]));

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium">
        {leaves.length === 0
          ? "Elegí de dónde sale esta métrica"
          : leaves.length === 1
            ? "Esta métrica sale de:"
            : `Esta métrica combina valores de ${leaves.length} fuentes:`}
      </p>

      {leaves.length > 0 && (
        <div className="space-y-2">
          {leaves.map((leaf, i) => (
            <div key={i} className="flex items-center gap-2 border border-border rounded-md p-2 bg-surface">
              <Select
                value={leaf.aggregation}
                onValueChange={(v) => {
                  const aggregation = v as AggregationFn;
                  updateLeaf(i, {
                    ...leaf,
                    aggregation,
                    field_key: aggregation === "sum" || aggregation === "average" ? leaf.field_key : null,
                    distinct_field_key: aggregation === "count_distinct" ? leaf.distinct_field_key : null,
                  });
                }}
              >
                <SelectTrigger className="h-8 w-[104px] text-xs shrink-0" aria-label="Función de agregación">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sum">Suma</SelectItem>
                  <SelectItem value="count">Cantidad</SelectItem>
                  <SelectItem value="count_distinct">Únicos</SelectItem>
                  <SelectItem value="average">Promedio</SelectItem>
                </SelectContent>
              </Select>
              {leaf.aggregation === "count" ? (
                <span className="flex-1 text-xs text-muted-foreground px-1">de todas las filas</span>
              ) : leaf.aggregation === "count_distinct" ? (
                <RawFieldPicker value={leaf.distinct_field_key} onChange={(k) => updateLeaf(i, { ...leaf, distinct_field_key: k })} rawFields={rawFields} />
              ) : (
                <RawFieldPicker value={leaf.field_key} onChange={(k) => updateLeaf(i, { ...leaf, field_key: k })} rawFields={numericFields} />
              )}
              <button
                type="button"
                onClick={() => removeLeaf(i)}
                className="shrink-0 text-muted-foreground hover:text-destructive p-1 -m-1"
                aria-label="Quitar esta fuente"
              >
                <X size={13} strokeWidth={1.5} />
              </button>
            </div>
          ))}
        </div>
      )}

      <Button type="button" variant="outline" size="sm" className="w-full border-dashed" onClick={addLeaf}>
        <Plus size={13} className="mr-1.5" /> Agregar {leaves.length > 0 ? "otra" : "una"} fuente
      </Button>

      {leaves.length > 0 && (
        <p className="text-[11px] text-tertiary">
          Cada fuente se suma tal cual — nunca se combina en silencio.
        </p>
      )}
      <button type="button" onClick={onSwitchToAdvanced} className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground">
        ¿Necesitás filtros, restar, o referenciar otra métrica? Usá el editor avanzado.
      </button>
    </div>
  );
}
