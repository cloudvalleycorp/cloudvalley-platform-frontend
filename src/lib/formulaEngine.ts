// CAPA: Calculation Engine / Formula Engine del Growth Tracker. Funciones
// puras, cero imports de React — corre igual en el browser, en un script de
// Node o (a futuro) desde un servicio de IA. No tocar la UI desde acá; la
// Presentation Layer (src/components/metrics/*, src/pages/Metrics.tsx) es la
// única que decide cómo se ve un resultado.
//
// Split out of lib/metrics.ts on purpose: hot-formula-parser (~formulajs)
// is a real dependency weight, and lib/metrics.ts's lightweight exports
// (types, formatMetricValue) are imported by chunks — like MetricInfoSheet —
// that never call evalFormula. Importing this file pulls the formula engine
// in; importing lib/metrics.ts alone does not.
import { Parser, SUPPORTED_FORMULAS } from "hot-formula-parser";
import type { InputsMap, PeriodInputs } from "@/lib/metrics";
import {
  QUERY_RAW_FIELDS_URL,
  type QueryRawFieldsRequest,
  type QueryRawFieldsRequestItem,
  type QueryRawFieldsResponse,
  type RawFieldFilter,
} from "@/lib/sheetsIntegration";

// Every function name available in a formula — hot-formula-parser's ~280
// Excel/Sheets functions plus our custom ones. Exported for the formula
// editor's autocomplete (src/components/metrics/FormulaField.tsx).
export const ALL_FORMULA_FUNCTIONS: string[] = Array.from(
  new Set([
    ...SUPPORTED_FORMULAS.map((f) => f.toUpperCase()),
    "SUMLAST",
    "AVGLAST",
    "YTD",
    "FIELDSUM",
    "FIELDCOUNT",
    "FIELDCOUNTD",
    "FIELDAVG",
  ])
).sort();

// Function names hot-formula-parser resolves as formulas, plus our own
// custom ones and the built-in literals — anything in this set is NOT a
// real input_key even though it matches the identifier regex below.
const RESERVED_NAMES = new Set([...ALL_FORMULA_FUNCTIONS, "TRUE", "FALSE", "NULL"]);

export type FunctionSignature = { params: string[]; description: string };

// Curated subset of ALL_FORMULA_FUNCTIONS with real param names + a
// one-line description, shown as parameter help while authoring a formula.
// Deliberately excludes range/array functions (COUNTIF, SUMIF, MATCH,
// VLOOKUP-style, etc.): this app only has scalar named variables, no
// cell ranges, and there's no array-literal syntax in the parser to build
// one — verified COUNTIF(revenue, ">100") parses but is meaningless over a
// single scalar, and {a,b} array literals error out (#ERROR!). Anything
// outside this list can still be typed by hand (the engine itself isn't
// restricted), it just won't get suggested or documented here.
export const FUNCTION_SIGNATURES: Record<string, FunctionSignature> = {
  SUM: { params: ["número1", "[número2, …]"], description: "Suma todos los números." },
  AVERAGE: { params: ["número1", "[número2, …]"], description: "Promedio de los números." },
  MIN: { params: ["número1", "[número2, …]"], description: "El valor más chico." },
  MAX: { params: ["número1", "[número2, …]"], description: "El valor más grande." },
  MEDIAN: { params: ["número1", "[número2, …]"], description: "La mediana de los números." },
  COUNT: { params: ["valor1", "[valor2, …]"], description: "Cuenta cuántos son valores numéricos." },
  COUNTA: { params: ["valor1", "[valor2, …]"], description: "Cuenta cuántos valores no están vacíos." },
  PRODUCT: { params: ["número1", "[número2, …]"], description: "Multiplica todos los números." },
  ABS: { params: ["número"], description: "Valor absoluto (sin signo)." },
  ROUND: { params: ["número", "decimales"], description: "Redondea al número de decimales indicado." },
  ROUNDUP: { params: ["número", "decimales"], description: "Redondea siempre hacia arriba." },
  ROUNDDOWN: { params: ["número", "decimales"], description: "Redondea siempre hacia abajo." },
  MOD: { params: ["número", "divisor"], description: "Resto de la división." },
  POWER: { params: ["base", "exponente"], description: "Eleva la base al exponente." },
  SQRT: { params: ["número"], description: "Raíz cuadrada." },
  INT: { params: ["número"], description: "Redondea hacia abajo, al entero más cercano." },
  TRUNC: { params: ["número", "[decimales]"], description: "Corta los decimales sin redondear." },
  CEILING: { params: ["número", "[cifra_significativa]"], description: "Redondea hacia arriba al múltiplo más cercano." },
  FLOOR: { params: ["número", "[cifra_significativa]"], description: "Redondea hacia abajo al múltiplo más cercano." },
  SIGN: { params: ["número"], description: "Da -1, 0 o 1 según el signo del número." },
  EVEN: { params: ["número"], description: "Redondea hacia arriba al entero par más cercano." },
  ODD: { params: ["número"], description: "Redondea hacia arriba al entero impar más cercano." },
  IF: { params: ["condición", "valor_si_verdadero", "[valor_si_falso]"], description: "Devuelve un valor u otro según se cumpla la condición." },
  AND: { params: ["lógico1", "[lógico2, …]"], description: "Verdadero solo si todas las condiciones son verdaderas." },
  OR: { params: ["lógico1", "[lógico2, …]"], description: "Verdadero si alguna condición es verdadera." },
  NOT: { params: ["lógico"], description: "Invierte verdadero por falso y viceversa." },
  XOR: { params: ["lógico1", "[lógico2, …]"], description: "Verdadero si un número impar de condiciones es verdadero." },
  CONCATENATE: { params: ["texto1", "[texto2, …]"], description: "Une varios textos en uno solo." },
  TRIM: { params: ["texto"], description: "Saca los espacios de más." },
  LEN: { params: ["texto"], description: "Cantidad de caracteres del texto." },
  LEFT: { params: ["texto", "[cantidad]"], description: "Los primeros caracteres del texto." },
  RIGHT: { params: ["texto", "[cantidad]"], description: "Los últimos caracteres del texto." },
  MID: { params: ["texto", "inicio", "cantidad"], description: "Extrae caracteres del texto desde una posición." },
  UPPER: { params: ["texto"], description: "Pasa el texto a mayúsculas." },
  LOWER: { params: ["texto"], description: "Pasa el texto a minúsculas." },
  SUBSTITUTE: { params: ["texto", "texto_buscado", "texto_nuevo", "[instancia]"], description: "Reemplaza una parte del texto por otra." },
  SUMLAST: { params: ['"campo" (entre comillas)', "n_meses"], description: "Suma el campo en los últimos N meses, incluido el actual." },
  AVGLAST: { params: ['"campo" (entre comillas)', "n_meses"], description: "Promedia el campo en los últimos N meses, incluido el actual." },
  YTD: { params: ['"campo" (entre comillas)'], description: "Acumulado del campo desde enero del año en curso." },
  FIELDSUM: {
    params: ['"campo_crudo"', '["campo_filtro", "valor1,valor2"]…'],
    description: "Suma un campo crudo de una integración sobre el período actual. Opcional: filtrar por otro campo (varios valores separados por coma = OR).",
  },
  FIELDCOUNT: {
    params: ['"campo_crudo"', '["campo_filtro", "valor1,valor2"]…'],
    description: "Cuenta filas del período actual donde el campo tiene valor. Mismos filtros opcionales que FIELDSUM.",
  },
  FIELDCOUNTD: {
    params: ['"campo_crudo"', '["campo_filtro", "valor1,valor2"]…'],
    description: "Cuenta valores únicos de un campo crudo en el período actual. Mismos filtros opcionales que FIELDSUM.",
  },
  FIELDAVG: {
    params: ['"campo_crudo"', '["campo_filtro", "valor1,valor2"]…'],
    description: "Promedia un campo crudo sobre el período actual. Mismos filtros opcionales que FIELDSUM.",
  },
};

export const RECOMMENDED_FUNCTIONS: string[] = Object.keys(FUNCTION_SIGNATURES).sort();

export type FormulaSyntaxEntry = { name: string; args: string; description: string };

// Lo que generate-formula/analyze-transactional-sheet/suggest-metrics piden
// como `formula_syntax` en cada request (ver aiInsights.ts) — backend arma
// el prompt y valida la fórmula generada CONTRA esto, así que se deriva de
// FUNCTION_SIGNATURES en vez de mantenerse a mano: nunca puede quedar
// desactualizado respecto a lo que este motor realmente soporta.
export const FORMULA_SYNTAX: FormulaSyntaxEntry[] = Object.entries(FUNCTION_SIGNATURES).map(([name, sig]) => ({
  name,
  args: sig.params.join(", "),
  description: sig.description,
}));

/**
 * Walks `text` up to `cursor` tracking a stack of open "(" and, for each,
 * which identifier preceded it (the function name) and how many top-level
 * commas have been seen since (the current argument index). Returns the
 * innermost function call the cursor is currently inside, or null if the
 * cursor isn't inside any call (or inside a plain grouping "(", which has
 * no preceding identifier). Used for the formula editor's parameter hint.
 */
export function findEnclosingCall(text: string, cursor: number): { name: string; argIndex: number } | null {
  const stack: { name: string; argIndex: number }[] = [];
  let inString = false;
  let identifierStart = -1;
  for (let i = 0; i < cursor; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      identifierStart = -1;
      continue;
    }
    if (/[a-zA-Z_]/.test(ch)) {
      if (identifierStart === -1) identifierStart = i;
    } else if (ch !== "." && !/[0-9]/.test(ch)) {
      if (ch === "(") {
        const name = identifierStart >= 0 ? text.slice(identifierStart, i).toUpperCase() : "";
        stack.push({ name, argIndex: 0 });
      } else if (ch === ")") {
        stack.pop();
      } else if (ch === "," && stack.length > 0) {
        stack[stack.length - 1].argIndex++;
      }
      identifierStart = -1;
    }
  }
  if (stack.length === 0) return null;
  const top = stack[stack.length - 1];
  return top.name ? top : null;
}

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

// ---- Campos crudos (FIELDSUM/FIELDCOUNT/FIELDCOUNTD/FIELDAVG) ----
//
// A diferencia de SUMLAST/AVGLAST/YTD (que solo necesitan `history`, ya
// disponible en memoria), estas 4 funciones agregan datos crudos de una
// integración — eso vive en el backend (POST /query-raw-field), no en el
// browser. hot-formula-parser evalúa todo de forma síncrona, así que no se
// puede hacer fetch() adentro de parser.setFunction. La solución: antes de
// evaluar la fórmula, se escanea su texto (extractRawFieldQueries), se
// resuelven todas las llamadas encontradas en paralelo (resolveRawFieldQueries,
// async), y RECIÉN AHÍ se evalúa la fórmula de forma síncrona de siempre,
// con esos valores ya en mano (rawFieldValues, ver evalFormula más abajo).
//
// Todos los argumentos de estas 4 funciones son siempre strings entre
// comillas (nombre de campo, o pares campo-de-filtro/valores) — nunca
// identificadores sueltos ni fórmulas anidadas — así que un scanner de texto
// simple alcanza, sin depender de que el resto de la fórmula ya sea
// evaluable (a diferencia de correr el parser completo).

const RAW_FIELD_FUNCTION_NAMES = ["FIELDSUM", "FIELDCOUNT", "FIELDCOUNTD", "FIELDAVG"] as const;
export type RawFieldFunctionName = (typeof RAW_FIELD_FUNCTION_NAMES)[number];

export type RawFieldQuery = {
  /** Cache/lookup key — misma función que produce este key a partir del texto (extracción) y de los params ya evaluados (runtime), para que ambos coincidan. */
  key: string;
  fn: RawFieldFunctionName;
  field: string;
  filters: RawFieldFilter[];
};

// Lee los argumentos entre comillas de una llamada tipo FUNC("a", "b", "c")
// a partir de `start` (justo después del "("). Devuelve null si algo no es
// un string literal — no intentamos adivinar, esa llamada se ignora (se
// resuelve como "sin datos" al evaluar, no rompe el resto de la fórmula).
function readQuotedArgs(text: string, start: number): string[] | null {
  const args: string[] = [];
  let i = start;
  const skipSpace = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };
  skipSpace();
  if (text[i] === ")") return args;
  for (;;) {
    if (text[i] !== '"') return null;
    i++;
    let value = "";
    while (i < text.length && text[i] !== '"') {
      if (text[i] === "\\" && text[i + 1] === '"') {
        value += '"';
        i += 2;
        continue;
      }
      value += text[i];
      i++;
    }
    if (text[i] !== '"') return null; // sin comilla de cierre
    i++;
    args.push(value);
    skipSpace();
    if (text[i] === ",") {
      i++;
      skipSpace();
      continue;
    }
    if (text[i] === ")") return args;
    return null;
  }
}

function buildRawFieldQuery(fn: RawFieldFunctionName, args: string[]): RawFieldQuery | null {
  if (args.length === 0) return null;
  const [field, ...rest] = args;
  if (!field || rest.length % 2 !== 0) return null; // los filtros vienen en pares campo/valores
  const filters: RawFieldFilter[] = [];
  for (let i = 0; i < rest.length; i += 2) {
    const values = rest[i + 1]
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    if (!rest[i] || values.length === 0) return null;
    filters.push({ field_key: rest[i], values });
  }
  return { key: JSON.stringify({ fn, field, filters }), fn, field, filters };
}

/** Todas las llamadas a FIELDSUM/FIELDCOUNT/FIELDCOUNTD/FIELDAVG en una fórmula, listas para resolver con resolveRawFieldQueries antes de evaluar. */
export function extractRawFieldQueries(expression: string): RawFieldQuery[] {
  const queries: RawFieldQuery[] = [];
  const re = new RegExp(`\\b(${RAW_FIELD_FUNCTION_NAMES.join("|")})\\s*\\(`, "gi");
  let m: RegExpExecArray | null;
  while ((m = re.exec(expression))) {
    const fn = m[1].toUpperCase() as RawFieldFunctionName;
    const args = readQuotedArgs(expression, m.index + m[0].length);
    if (!args) continue;
    const query = buildRawFieldQuery(fn, args);
    if (query) queries.push(query);
  }
  return queries;
}

const AGGREGATION_BY_FUNCTION: Record<RawFieldFunctionName, QueryRawFieldsRequestItem["aggregation"]> = {
  FIELDSUM: "sum",
  FIELDCOUNT: "count",
  FIELDCOUNTD: "count_distinct",
  FIELDAVG: "average",
};

/**
 * Resuelve, en un solo request batcheado, todas las queries que haga falta
 * para evaluar una o varias fórmulas en uno o varios períodos — la unión de
 * extractRawFieldQueries(...) de todas las fórmulas en pantalla (no una
 * llamada por fórmula ni una por período), para no repetir consultas.
 * Devuelve { [period]: { [queryKey]: value } }. Un fallo de red deja todo en
 * `null` (mismo criterio que "sin datos" de SUMLAST/AVGLAST/YTD), no rompe.
 * `results[i]` de la respuesta corresponde a `queries[i]` del request por
 * orden — la respuesta no repite filters/distinct_field_key, así que el
 * orden es la única forma de emparejar cuando dos queries comparten
 * field_key+aggregation+period con filtros distintos.
 */
export async function resolveRawFieldQueries(
  queries: RawFieldQuery[],
  companyId: string,
  periods: string[]
): Promise<Record<string, Record<string, number | null>>> {
  const unique = new Map<string, RawFieldQuery>();
  for (const q of queries) unique.set(q.key, q);
  const uniqueList = Array.from(unique.values());

  const result: Record<string, Record<string, number | null>> = {};
  for (const period of periods) result[period] = {};
  if (uniqueList.length === 0 || periods.length === 0) return result;

  const requestQueries: QueryRawFieldsRequestItem[] = [];
  const requestMeta: { period: string; key: string }[] = [];
  for (const period of periods) {
    for (const { key, fn, field, filters } of uniqueList) {
      requestQueries.push({
        period,
        field_key: field,
        aggregation: AGGREGATION_BY_FUNCTION[fn],
        ...(fn === "FIELDCOUNTD" ? { distinct_field_key: field } : {}),
        ...(filters.length > 0 ? { filters } : {}),
      });
      requestMeta.push({ period, key });
    }
  }

  try {
    const res = await fetch(QUERY_RAW_FIELDS_URL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company_id: companyId, queries: requestQueries } as QueryRawFieldsRequest),
    });
    if (!res.ok) return result;
    const data = (await res.json()) as QueryRawFieldsResponse;
    data.results.forEach((r, i) => {
      const meta = requestMeta[i];
      if (meta) result[meta.period][meta.key] = r.value;
    });
  } catch {
    // deja todo en null (ya inicializado arriba)
  }
  return result;
}

function registerRawFieldFunctions(parser: Parser, resolved: Record<string, number | null>) {
  const lookup = (fn: RawFieldFunctionName) => (params: unknown[]) => {
    if (!params.every((p): p is string => typeof p === "string")) return null;
    const query = buildRawFieldQuery(fn, params);
    if (!query) return null;
    const value = resolved[query.key];
    return value === undefined ? null : value;
  };
  for (const fn of RAW_FIELD_FUNCTION_NAMES) parser.setFunction(fn, lookup(fn));
}

function numberOrNull(values: (number | undefined)[]): number[] {
  return values.filter((v): v is number => v !== undefined);
}

// Lets a formula reference another calculated metric by its metric_id, not
// just raw input_key fields — e.g. a "LTV/CAC" metric can just write
// ltv / cac if both are themselves calculated metrics, no need to inline
// their formulas. Optional and backward compatible: call sites that don't
// pass calcDefs get the exact old behavior (bare identifiers only resolve
// against `inputs`).
export type CalcDefLike = { id: string; formula_expression: string | null };

const ERROR_MESSAGES: Record<string, string> = {
  "#ERROR!": "Hay un error de sintaxis en la fórmula.",
  "#DIV/0!": "La fórmula divide por cero.",
  "#NAME?": "Usa una función o variable que no reconoce.",
  "#N/A": "Falta un valor para poder calcular la fórmula.",
  "#NUM!": "La fórmula da un número inválido.",
  "#VALUE!": "Uno de los valores de la fórmula tiene el tipo equivocado.",
};

export type FormulaEvalResult = {
  value: number | null;
  /** Human-readable (Spanish) message when the formula itself is malformed. Null if there's no syntax/eval error. */
  error: string | null;
  /** Identifiers referenced that don't have a value yet (own period not loaded, or an unresolved/circular metric reference) — not a syntax error. */
  missing: string[];
};

function resolveIdentifier(
  id: string,
  inputs: InputsMap,
  history: PeriodInputs[],
  calcDefs: CalcDefLike[],
  visiting: Set<string>,
  cache: InputsMap,
  rawFieldValues: Record<string, number | null>
): number | null {
  if (cache[id] !== undefined) return cache[id];
  if (inputs[id] !== undefined && inputs[id] !== null && !Number.isNaN(inputs[id])) return inputs[id];
  if (visiting.has(id)) return null;
  const def = calcDefs.find((d) => d.id === id);
  if (!def?.formula_expression) return null;
  visiting.add(id);
  const result = evaluateInternal(def.formula_expression, inputs, history, calcDefs, visiting, cache, rawFieldValues);
  visiting.delete(id);
  if (result.value !== null) cache[id] = result.value;
  return result.value;
}

function evaluateInternal(
  expression: string,
  inputs: InputsMap,
  history: PeriodInputs[],
  calcDefs: CalcDefLike[],
  visiting: Set<string>,
  cache: InputsMap,
  rawFieldValues: Record<string, number | null>
): FormulaEvalResult {
  const identifiers = requiredInputs(expression);
  const missing = identifiers.filter(
    (id) => resolveIdentifier(id, inputs, history, calcDefs, visiting, cache, rawFieldValues) === null
  );

  // FIELDSUM/FIELDCOUNT/FIELDCOUNTD/FIELDAVG resuelven contra datos crudos
  // (ver resolveRawFieldQueries más arriba) — si la query todavía no llegó
  // (undefined: nunca se resolvió, a diferencia de null = backend confirmó
  // que no hay dato para ese período), es lo mismo que "falta cargar" un
  // input: no es un error de sintaxis, es un dato que todavía no está. Sin
  // este chequeo, la función de abajo devuelve null, el resultado final no
  // es un número, y cae en "la fórmula no da como resultado un número" —
  // engañoso, da a entender que la fórmula está mal escrita cuando en
  // realidad el dato crudo no llegó (red caída, o el campo no existe).
  const missingRawFields = Array.from(
    new Set(extractRawFieldQueries(expression).filter((q) => rawFieldValues[q.key] === undefined).map((q) => q.field))
  );
  if (missing.length > 0 || missingRawFields.length > 0) {
    return { value: null, error: null, missing: [...missing, ...missingRawFields] };
  }

  try {
    const parser = new Parser();
    for (const [key, value] of Object.entries(inputs)) parser.setVariable(key, value);
    for (const [key, value] of Object.entries(cache)) parser.setVariable(key, value);
    registerHistoryFunctions(parser, history);
    registerRawFieldFunctions(parser, rawFieldValues);
    const cleaned = expression.trim().replace(/^=/, "");
    const { result, error } = parser.parse(cleaned);
    if (error) return { value: null, error: ERROR_MESSAGES[error] ?? "La fórmula tiene un error.", missing: [] };
    if (typeof result !== "number" || !isFinite(result)) {
      return { value: null, error: "La fórmula no da como resultado un número.", missing: [] };
    }
    return { value: result, error: null, missing: [] };
  } catch {
    return { value: null, error: "Hay un error de sintaxis en la fórmula.", missing: [] };
  }
}

/**
 * Same evaluation as evalFormula, but returns the value AND why it's null
 * (missing data vs. a real formula error) — for the live preview while
 * authoring a formula. `calcDefs` (optional) lets the formula reference
 * other calculated metrics by id, resolved recursively with cycle
 * protection (a circular reference just resolves as "missing", never hangs).
 * `rawFieldValues` (optional) is the pre-resolved map from
 * resolveRawFieldQueries — without it, FIELDSUM/FIELDCOUNT/FIELDCOUNTD/
 * FIELDAVG simply return null (same "no data" behavior as SUMLAST/AVGLAST/
 * YTD without `history`).
 */
export function evalFormulaDetailed(
  expression: string,
  inputs: InputsMap,
  history: PeriodInputs[] = [],
  calcDefs: CalcDefLike[] = [],
  rawFieldValues: Record<string, number | null> = {}
): FormulaEvalResult {
  if (!expression.trim()) return { value: null, error: null, missing: [] };
  return evaluateInternal(expression, inputs, history, calcDefs, new Set(), {}, rawFieldValues);
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
 * `calcDefs` (optional) lets the formula also reference other calculated
 * metrics by id, resolved recursively — omit it for the old behavior (bare
 * identifiers only resolve against `inputs`). `rawFieldValues` (optional) is
 * the pre-resolved map from resolveRawFieldQueries — needed for FIELDSUM/
 * FIELDCOUNT/FIELDCOUNTD/FIELDAVG, see the block above registerRawFieldFunctions.
 * Returns null if any identifier can't be resolved, or the formula itself errors.
 */
export function evalFormula(
  expression: string,
  inputs: InputsMap,
  history: PeriodInputs[] = [],
  calcDefs: CalcDefLike[] = [],
  rawFieldValues: Record<string, number | null> = {}
): number | null {
  return evaluateInternal(expression, inputs, history, calcDefs, new Set(), {}, rawFieldValues).value;
}
