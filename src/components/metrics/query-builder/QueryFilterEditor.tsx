import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RawFieldPicker } from "@/components/metrics/query-builder/RawFieldPicker";
import { RANGE_OPERATORS, type QueryFilter, type FilterOperator } from "@/lib/querySpec";
import type { RawField } from "@/lib/metrics";

const OPERATOR_OPTIONS: { value: FilterOperator; label: string }[] = [
  { value: "in", label: "en" },
  { value: "==", label: "=" },
  { value: "!=", label: "≠" },
  { value: "<", label: "<" },
  { value: "<=", label: "≤" },
  { value: ">", label: ">" },
  { value: ">=", label: "≥" },
  { value: "between", label: "entre" },
];

type Props = {
  filters: QueryFilter[];
  onChange: (next: QueryFilter[]) => void;
  rawFields: RawField[];
};

// Firestore solo permite un campo de rango/desigualdad por query — se avisa
// acá mismo (chequeo client-side) además de que backend lo rechaza con 400
// si se manda igual (ver findRangeConflicts en querySpec.ts, usado también
// como gate de guardado en useMetricPropertyForm.ts).
//
// La forma del valor depende del operador (confirmado con backend
// 2026-08-11): "in" → values: [...]: el resto de los operadores va bajo la
// clave singular "value" ("between" como [min, max], los demás como
// escalar) — ver querySpec.ts. Al cambiar de operador se reemplaza el
// filtro entero (no merge) para no dejar values/value viejos colgando.
export function QueryFilterEditor({ filters, onChange, rawFields }: Props) {
  const isNumericField = (fieldKey: string) => rawFields.find((f) => f.field_key === fieldKey)?.value_type === "number";
  const toTyped = (fieldKey: string, raw: string): string | number => {
    if (!isNumericField(fieldKey)) return raw;
    const n = Number(raw);
    return Number.isNaN(n) ? raw : n;
  };

  const updateFilter = (i: number, patch: Partial<QueryFilter>) =>
    onChange(filters.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const replaceFilter = (i: number, next: QueryFilter) => onChange(filters.map((f, idx) => (idx === i ? next : f)));
  const removeFilter = (i: number) => onChange(filters.filter((_, idx) => idx !== i));
  const addFilter = () => onChange([...filters, { field_key: "", operator: "in", values: [] }]);

  const setOperator = (i: number, operator: FilterOperator) => {
    const field_key = filters[i].field_key;
    if (operator === "in") replaceFilter(i, { field_key, operator, values: [] });
    else if (operator === "between") replaceFilter(i, { field_key, operator, value: ["", ""] });
    else replaceFilter(i, { field_key, operator, value: "" });
  };

  const handleInValuesChange = (i: number, raw: string) => {
    const fieldKey = filters[i].field_key;
    const values = raw
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .map((v) => toTyped(fieldKey, v));
    updateFilter(i, { values });
  };

  const rangeFieldsInUse = filters.filter((f) => RANGE_OPERATORS.includes(f.operator)).map((f) => f.field_key || "(sin campo)");

  return (
    <div className="space-y-1.5">
      <Label className="text-xs">Filtros (opcional)</Label>
      {filters.map((f, i) => {
        const betweenValue = f.operator === "between" && Array.isArray(f.value) ? f.value : ["", ""];
        const scalarValue = f.operator !== "in" && f.operator !== "between" && !Array.isArray(f.value) ? (f.value ?? "") : "";
        return (
          <div key={i} className="flex items-center gap-1.5">
            <RawFieldPicker value={f.field_key || null} onChange={(k) => updateFilter(i, { field_key: k })} rawFields={rawFields} placeholder="Campo…" />
            <Select value={f.operator} onValueChange={(op) => setOperator(i, op as FilterOperator)}>
              <SelectTrigger className="h-8 w-20 text-xs shrink-0">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {OPERATOR_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {f.operator === "in" && (
              <Input
                className="h-8 text-xs flex-1 min-w-0"
                placeholder="valor1, valor2…"
                value={(f.values ?? []).join(", ")}
                onChange={(e) => handleInValuesChange(i, e.target.value)}
                aria-label={`Valores del filtro ${i + 1}`}
              />
            )}
            {f.operator === "between" && (
              <>
                <Input
                  className="h-8 text-xs flex-1 min-w-0"
                  placeholder="mínimo"
                  value={String(betweenValue[0] ?? "")}
                  onChange={(e) => updateFilter(i, { value: [toTyped(f.field_key, e.target.value), betweenValue[1]] })}
                  aria-label={`Valor mínimo del filtro ${i + 1}`}
                />
                <span className="text-xs text-muted-foreground shrink-0">y</span>
                <Input
                  className="h-8 text-xs flex-1 min-w-0"
                  placeholder="máximo"
                  value={String(betweenValue[1] ?? "")}
                  onChange={(e) => updateFilter(i, { value: [betweenValue[0], toTyped(f.field_key, e.target.value)] })}
                  aria-label={`Valor máximo del filtro ${i + 1}`}
                />
              </>
            )}
            {f.operator !== "in" && f.operator !== "between" && (
              <Input
                className="h-8 text-xs flex-1 min-w-0"
                placeholder="valor…"
                value={String(scalarValue)}
                onChange={(e) => updateFilter(i, { value: toTyped(f.field_key, e.target.value) })}
                aria-label={`Valor del filtro ${i + 1}`}
              />
            )}
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={() => removeFilter(i)} aria-label="Quitar filtro">
              <X size={12} aria-hidden="true" />
            </Button>
          </div>
        );
      })}
      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={addFilter}>
        <Plus size={12} className="mr-1" aria-hidden="true" /> Agregar filtro
      </Button>
      {rangeFieldsInUse.length > 1 && (
        <Alert variant="destructive" className="p-2.5">
          <AlertDescription className="text-xs">
            Solo se puede usar un filtro de rango/desigualdad (&lt;, ≤, &gt;, ≥, entre) por consulta. Elegí uno solo
            entre: {rangeFieldsInUse.join(", ")}.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
