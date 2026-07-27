// Split out of lib/metrics.ts on purpose: hot-formula-parser (~formulajs)
// is a real dependency weight, and lib/metrics.ts's lightweight exports
// (types, formatMetricValue) are imported by chunks — like MetricInfoSheet —
// that never call evalFormula. Importing this file pulls the formula engine
// in; importing lib/metrics.ts alone does not.
import { Parser, SUPPORTED_FORMULAS } from "hot-formula-parser";
import type { InputsMap, PeriodInputs } from "@/lib/metrics";

// Function names hot-formula-parser resolves as formulas, plus our own
// custom ones and the built-in literals — anything in this set is NOT a
// real input_key even though it matches the identifier regex below.
const RESERVED_NAMES = new Set([
  ...SUPPORTED_FORMULAS.map((f) => f.toUpperCase()),
  "TRUE",
  "FALSE",
  "NULL",
  "SUMLAST",
  "AVGLAST",
  "YTD",
]);

function stripQuotedStrings(expression: string): string {
  return expression.replace(/"[^"]*"/g, "");
}

/** Identifiers a formula references as bare variables (revenue, headcount…) — excludes function names and anything quoted (SUMLAST("revenue", 3) doesn't need `revenue` in the current period). */
export function requiredInputs(expression: string): string[] {
  const stripped = stripQuotedStrings(expression);
  return Array.from(new Set(stripped.match(/[a-z_][a-z0-9_]*/gi) ?? [])).filter(
    (id) => !RESERVED_NAMES.has(id.toUpperCase())
  );
}

function numberOrNull(values: (number | undefined)[]): number[] {
  return values.filter((v): v is number => v !== undefined);
}

function registerHistoryFunctions(parser: Parser, history: PeriodInputs[]) {
  parser.setFunction("SUMLAST", (params) => {
    const [key, n] = params as unknown[];
    if (typeof key !== "string" || typeof n !== "number" || n <= 0) return null;
    const values = numberOrNull(history.slice(-n).map((p) => p.values[key]));
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  });
  parser.setFunction("AVGLAST", (params) => {
    const [key, n] = params as unknown[];
    if (typeof key !== "string" || typeof n !== "number" || n <= 0) return null;
    const values = numberOrNull(history.slice(-n).map((p) => p.values[key]));
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  });
  parser.setFunction("YTD", (params) => {
    const [key] = params as unknown[];
    if (typeof key !== "string" || history.length === 0) return null;
    const currentYear = history[history.length - 1].year;
    const values = numberOrNull(
      history.filter((p) => p.year === currentYear).map((p) => p.values[key])
    );
    return values.length ? values.reduce((a, b) => a + b, 0) : null;
  });
}

/**
 * Evaluate a metric formula given the current period's inputs, using a real
 * Sheets/Excel-compatible engine (hot-formula-parser: SUM, IF, ROUND, AVERAGE,
 * etc.) instead of a raw JS expression. `history` (chronological, ending at
 * the current period) is optional and only needed for SUMLAST/AVGLAST/YTD —
 * without it those three simply return null, everything else works the same.
 * Returns null if any bare identifier referenced is missing from `inputs`,
 * or the formula itself errors.
 */
export function evalFormula(expression: string, inputs: InputsMap, history: PeriodInputs[] = []): number | null {
  const identifiers = requiredInputs(expression);
  for (const id of identifiers) {
    if (inputs[id] === undefined || inputs[id] === null || Number.isNaN(inputs[id])) {
      return null;
    }
  }
  try {
    const parser = new Parser();
    for (const [key, value] of Object.entries(inputs)) {
      parser.setVariable(key, value);
    }
    registerHistoryFunctions(parser, history);
    const cleaned = expression.trim().replace(/^=/, "");
    const { result, error } = parser.parse(cleaned);
    if (error || typeof result !== "number" || !isFinite(result)) return null;
    return result;
  } catch {
    return null;
  }
}
