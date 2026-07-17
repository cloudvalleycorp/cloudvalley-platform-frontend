export type MetricType = "input" | "calculated";

export type MetricDef = {
  id: string;
  name: string;
  category: string;
  metric_type: MetricType;
  input_key: string | null;
  formula_expression: string | null;
  unit: string | null;
  formula: string | null;
  description: string | null;
  why_it_matters: string | null;
  benchmark: string | null;
  order_index: number;
};

export type InputsMap = Record<string, number>; // input_key -> value

/**
 * Safely evaluate a metric formula given a map of input values.
 * Returns null if any required input is missing or result is invalid.
 */
export function evalFormula(expression: string, inputs: InputsMap): number | null {
  // Extract identifiers (input_keys referenced in the formula)
  const identifiers = Array.from(new Set(expression.match(/[a-z_][a-z0-9_]*/gi) ?? []));
  // Check all referenced inputs exist (treat 0 as valid)
  for (const id of identifiers) {
    if (inputs[id] === undefined || inputs[id] === null || Number.isNaN(inputs[id])) {
      return null;
    }
  }
  try {
    // Build sandboxed function: only allows the identifiers we extracted
    const args = identifiers.join(",");
    const values = identifiers.map((k) => inputs[k]);
    // eslint-disable-next-line no-new-func
    const fn = new Function(args, `return (${expression});`);
    const result = fn(...values);
    if (typeof result !== "number" || !isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}

/** Identifies which inputs a calculated metric needs. */
export function requiredInputs(expression: string): string[] {
  return Array.from(new Set(expression.match(/[a-z_][a-z0-9_]*/gi) ?? []));
}

export function formatMetricValue(value: number | null, unit: string | null): string {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  if (unit === "USD") {
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
    return `$${value.toFixed(0)}`;
  }
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "x") return `${value.toFixed(2)}x`;
  if (unit === "meses") return `${value.toFixed(1)} meses`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}