import { useMemo, useRef, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { formatMetricValue, formatValueByType, type MetricDef, type InputsMap, type PeriodInputs, type RawField } from "@/lib/metrics";
import {
  evalFormula,
  evalFormulaDetailed,
  extractRawFieldQueries,
  findEnclosingCall,
  RECOMMENDED_FUNCTIONS,
  FUNCTION_SIGNATURES,
  FORMULA_SYNTAX,
} from "@/lib/formulaEngine";
import { useMetricInsights } from "@/hooks/useMetricInsights";
import type { GenerateFormulaResponse } from "@/lib/aiInsights";

type Suggestion =
  | { kind: "function"; name: string }
  | { kind: "field"; key: string; label: string; value: number | undefined; valueType: MetricDef["value_type"] }
  | { kind: "metric"; id: string; label: string; value: number | null; unit: string | null }
  // Un campo crudo de una integración — nunca se usa suelto, siempre dentro
  // de FIELDSUM/FIELDCOUNT/FIELDCOUNTD/FIELDAVG (ver formulaEngine.ts), así
  // que insertarlo arma la llamada completa, no solo el nombre.
  | { kind: "rawfield"; fieldKey: string; valueType: RawField["value_type"] };

function suggestionId(s: Suggestion): string {
  return s.kind === "function" ? s.name : s.kind === "field" ? s.key : s.kind === "rawfield" ? s.fieldKey : s.id;
}

function suggestionSearchValue(s: Suggestion): string {
  if (s.kind === "function") return s.name;
  if (s.kind === "field") return `${s.label} ${s.key}`;
  if (s.kind === "rawfield") return s.fieldKey;
  return `${s.label} ${s.id}`;
}

function matchesToken(s: Suggestion, token: string): boolean {
  const t = token.toLowerCase();
  if (!t) return false;
  const id = suggestionId(s).toLowerCase();
  const label = s.kind === "function" ? "" : s.kind === "rawfield" ? "" : s.label.toLowerCase();
  return id.startsWith(t) || label.startsWith(t);
}

// Same row shape everywhere a variable/función can be picked — the
// "Insertar variable" popover and the live-as-you-type dropdown render
// through this so they never drift apart visually.
function SuggestionRow({ s }: { s: Suggestion }) {
  if (s.kind === "function") {
    const sig = FUNCTION_SIGNATURES[s.name];
    return (
      <div className="flex items-center justify-between gap-3 min-w-0 w-full">
        <span className="min-w-0">
          <span className="block truncate">{s.name}</span>
          {sig && <span className="block text-[10px] text-tertiary truncate">{sig.description}</span>}
        </span>
        <span className="text-[10px] uppercase tracking-wide text-tertiary shrink-0">función</span>
      </div>
    );
  }
  if (s.kind === "rawfield") {
    return (
      <div className="flex items-center justify-between gap-3 min-w-0 w-full">
        <span className="min-w-0">
          <span className="block truncate font-mono">{s.fieldKey}</span>
          <span className="block text-[10px] text-tertiary truncate">Inserta FIELDSUM("{s.fieldKey}")</span>
        </span>
        <span className="text-[10px] uppercase tracking-wide text-tertiary shrink-0">
          {s.valueType === "text" ? "texto" : "número"}
        </span>
      </div>
    );
  }
  const identifier = s.kind === "field" ? s.key : s.id;
  const display = s.kind === "field" ? formatValueByType(s.value, s.valueType) : formatMetricValue(s.value, s.unit);
  return (
    <div className="flex items-center justify-between gap-3 min-w-0 w-full">
      <span className="min-w-0">
        <span className="block truncate">{s.label}</span>
        <span className="block text-[10px] font-mono text-tertiary truncate">{identifier}</span>
      </span>
      <span className="text-xs tabular-nums text-muted-foreground shrink-0">{display}</span>
    </div>
  );
}

function getCurrentToken(text: string, cursor: number): { token: string; start: number } {
  let start = cursor;
  while (start > 0 && /[a-zA-Z0-9_]/.test(text[start - 1])) start--;
  return { token: text.slice(start, cursor), start };
}

type Props = {
  value: string;
  onChange: (v: string) => void;
  unit: string | null;
  inputDefs: MetricDef[]; // all input metrics (any category) — field suggestions
  calcDefs: MetricDef[]; // all OTHER calculated metrics — reuse suggestions (self already excluded by caller)
  currentInputs: InputsMap;
  formulaHistory?: PeriodInputs[];
  // Campos crudos de integraciones disponibles (list-raw-fields) — opcional,
  // sin esto simplemente no aparece el grupo "Campos crudos" en el picker.
  rawFields?: RawField[];
  // Valores ya resueltos (useRawFieldValues → resolveRawFieldQueries) para
  // el período actual, necesarios para que la preview calcule algo cuando
  // la fórmula usa FIELDSUM/FIELDCOUNT/FIELDCOUNTD/FIELDAVG.
  rawFieldValues?: Record<string, number | null>;
  // Mientras se resuelven esos valores (llamada de red en curso) — la
  // preview muestra "Calculando…" en vez de un resultado potencialmente
  // desactualizado.
  rawFieldValuesLoading?: boolean;
  // Para "Generar fórmula" con IA (POST /generate-formula) — sin esto, el
  // modo simple/generar queda oculto y el editor abre directo en modo
  // avanzado, como antes.
  companyId?: string | null;
  // Solo cuando se está creando una métrica nueva desde cero: generate-formula
  // devuelve el formulario ENTERO (nombre/categoría/descripción/por qué
  // importa/unidad), no solo la fórmula — este callback le pasa esos campos
  // extra al panel padre para prellenar el resto del draft. Si no se pasa
  // (editando una métrica que ya existe, botón "Generar con IA" en modo
  // avanzado), solo se aplica la fórmula — nunca se toca nombre/categoría de
  // algo que ya estaba definido.
  onGenerated?: (extras: { name: string; category: string; description: string; why_it_matters: string; unit: string }) => void;
};

/**
 * Sheets/AppSheet-style formula editor. Dos modos:
 * - "simple" (default para una fórmula nueva/vacía): un campo de lenguaje
 *   natural + "Generar fórmula" con IA — nada de sintaxis técnica visible
 *   hasta que hace falta. Ver rediseño en el plan: la IA tiene que bajar la
 *   carga cognitiva, no sumarle una pantalla más al editor de siempre.
 * - "advanced" (el editor de toda la vida — picker "Insertar variable",
 *   autocomplete, hint de parámetros, preview en vivo): se abre directo si
 *   ya había una fórmula (venís a ajustar algo puntual, no a arrancar de
 *   cero), o si elegís "Prefiero escribirla yo" / "Ajustar a mano" desde el
 *   modo simple.
 */
export function FormulaField({
  value,
  onChange,
  unit,
  inputDefs,
  calcDefs,
  currentInputs,
  formulaHistory,
  rawFields = [],
  rawFieldValues = {},
  rawFieldValuesLoading = false,
  companyId = null,
  onGenerated,
}: Props) {
  const [mode, setMode] = useState<"simple" | "advanced">(value.trim() ? "advanced" : "simple");
  const [description, setDescription] = useState("");
  const [generatedResult, setGeneratedResult] = useState<GenerateFormulaResponse | null>(null);
  const { generateFormula, generating } = useMetricInsights(companyId);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [autoOpen, setAutoOpen] = useState(false);
  const [autoIndex, setAutoIndex] = useState(0);
  const [tokenStart, setTokenStart] = useState<number | null>(null);
  const [cursorPos, setCursorPos] = useState(0);

  const fields: Suggestion[] = useMemo(
    () =>
      inputDefs
        .filter((d): d is MetricDef & { input_key: string } => !!d.input_key)
        .map((d) => ({
          kind: "field" as const,
          key: d.input_key,
          label: d.name,
          value: currentInputs[d.input_key],
          valueType: d.value_type,
        })),
    [inputDefs, currentInputs]
  );

  const metricSuggestions: Extract<Suggestion, { kind: "metric" }>[] = useMemo(
    () =>
      calcDefs.map((m) => ({
        kind: "metric" as const,
        id: m.id,
        label: m.name,
        unit: m.unit,
        value: m.formula_expression ? evalFormula(m.formula_expression, currentInputs, formulaHistory, calcDefs) : null,
      })),
    [calcDefs, currentInputs, formulaHistory]
  );

  const functionSuggestions: Suggestion[] = useMemo(
    () => RECOMMENDED_FUNCTIONS.map((name) => ({ kind: "function" as const, name })),
    []
  );

  const rawFieldSuggestions: Extract<Suggestion, { kind: "rawfield" }>[] = useMemo(
    () => rawFields.map((f) => ({ kind: "rawfield" as const, fieldKey: f.field_key, valueType: f.value_type })),
    [rawFields]
  );

  const allSuggestions = useMemo(
    () => [...functionSuggestions, ...fields, ...metricSuggestions, ...rawFieldSuggestions],
    [functionSuggestions, fields, metricSuggestions, rawFieldSuggestions]
  );

  const hasRawFieldRefs = useMemo(() => extractRawFieldQueries(value).length > 0, [value]);

  const preview = useMemo(
    () => evalFormulaDetailed(value, currentInputs, formulaHistory, calcDefs, rawFieldValues),
    [value, currentInputs, formulaHistory, calcDefs, rawFieldValues]
  );

  const enclosingCall = useMemo(() => findEnclosingCall(value, cursorPos), [value, cursorPos]);
  const signature = enclosingCall ? FUNCTION_SIGNATURES[enclosingCall.name] : undefined;

  const currentToken = tokenStart !== null ? value.slice(tokenStart, cursorPos) : "";
  const filtered = autoOpen ? allSuggestions.filter((s) => matchesToken(s, currentToken)).slice(0, 8) : [];

  const syncCursor = (text: string, cursor: number) => {
    setCursorPos(cursor);
    const { token, start } = getCurrentToken(text, cursor);
    if (token.length >= 1) {
      setTokenStart(start);
      setAutoIndex(0);
      setAutoOpen(true);
    } else {
      setAutoOpen(false);
      setTokenStart(null);
    }
  };

  const insertAtCursor = (text: string, caretOffset: number, from?: number, to?: number) => {
    const el = textareaRef.current;
    const start = from ?? el?.selectionStart ?? value.length;
    const end = to ?? el?.selectionEnd ?? value.length;
    const next = value.slice(0, start) + text + value.slice(end);
    onChange(next);
    setAutoOpen(false);
    setTokenStart(null);
    const pos = start + caretOffset;
    setCursorPos(pos);
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  };

  const acceptSuggestion = (s: Suggestion) => {
    if (s.kind === "function") {
      insertAtCursor(`${s.name}()`, s.name.length + 1, tokenStart ?? undefined, cursorPos);
    } else if (s.kind === "rawfield") {
      const text = `FIELDSUM("${s.fieldKey}")`;
      insertAtCursor(text, text.length, tokenStart ?? undefined, cursorPos);
    } else {
      const id = suggestionId(s);
      insertAtCursor(id, id.length, tokenStart ?? undefined, cursorPos);
    }
  };

  const insertFromPicker = (s: Suggestion) => {
    if (s.kind === "function") {
      insertAtCursor(`${s.name}()`, s.name.length + 1);
    } else if (s.kind === "rawfield") {
      const text = `FIELDSUM("${s.fieldKey}")`;
      insertAtCursor(text, text.length);
    } else {
      const id = suggestionId(s);
      insertAtCursor(id, id.length);
    }
    setPickerOpen(false);
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onChange(e.target.value);
    syncCursor(e.target.value, e.target.selectionStart);
  };

  const handleClick = () => {
    const el = textareaRef.current;
    if (el) syncCursor(value, el.selectionStart);
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
      const el = textareaRef.current;
      if (el) syncCursor(value, el.selectionStart);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (autoOpen && filtered.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setAutoIndex((i) => (i + 1) % filtered.length);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setAutoIndex((i) => (i - 1 + filtered.length) % filtered.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        acceptSuggestion(filtered[autoIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setAutoOpen(false);
        return;
      }
    }

    const el = e.currentTarget;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start !== end) return;

    // Skip over an already-typed closing char instead of duplicating it.
    if (e.key === ")" && value[start] === ")") {
      e.preventDefault();
      setAutoOpen(false);
      setCursorPos(start + 1);
      requestAnimationFrame(() => el.setSelectionRange(start + 1, start + 1));
      return;
    }
    if (e.key === '"' && value[start] === '"') {
      e.preventDefault();
      setAutoOpen(false);
      setCursorPos(start + 1);
      requestAnimationFrame(() => el.setSelectionRange(start + 1, start + 1));
      return;
    }
    // Auto-close the pair, caret lands in the middle — same as Sheets/most editors.
    if (e.key === "(") {
      e.preventDefault();
      onChange(value.slice(0, start) + "()" + value.slice(end));
      setAutoOpen(false);
      setCursorPos(start + 1);
      requestAnimationFrame(() => el.setSelectionRange(start + 1, start + 1));
      return;
    }
    if (e.key === '"') {
      e.preventDefault();
      onChange(value.slice(0, start) + '""' + value.slice(end));
      setAutoOpen(false);
      setCursorPos(start + 1);
      requestAnimationFrame(() => el.setSelectionRange(start + 1, start + 1));
      return;
    }
  };

  const handleGenerate = async () => {
    const result = await generateFormula(description, FORMULA_SYNTAX);
    if (result) setGeneratedResult(result);
  };

  const acceptGenerated = () => {
    if (!generatedResult) return;
    onChange(generatedResult.formula_expression);
    if (onGenerated) {
      onGenerated({
        name: generatedResult.name,
        category: generatedResult.category,
        description: generatedResult.description,
        why_it_matters: generatedResult.why_it_matters,
        unit: generatedResult.unit,
      });
    }
    setGeneratedResult(null);
    setMode("advanced");
  };

  if (mode === "simple") {
    return (
      <div>
        <Label className="text-xs">Fórmula</Label>
        {!generatedResult ? (
          <div className="mt-1.5 space-y-2">
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder='Describí qué querés calcular. Ej: "suma el monto de las ventas marcadas como Nueva en el período actual"'
              aria-label="Describí qué querés calcular"
            />
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" onClick={handleGenerate} disabled={!description.trim() || generating}>
                <Sparkles size={12} aria-hidden="true" className={cn("mr-1.5", generating && "animate-spin")} />
                {generating ? "Generando…" : "Generar fórmula"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setMode("advanced")}>
                Prefiero escribirla yo
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-1.5 rounded-md border border-success/40 bg-success/5 p-3 space-y-2" aria-live="polite">
            {onGenerated && <p className="text-sm font-medium text-foreground">{generatedResult.name}</p>}
            <p className="text-sm text-foreground">{generatedResult.description}</p>
            {onGenerated && generatedResult.why_it_matters && (
              <p className="text-xs text-muted-foreground">{generatedResult.why_it_matters}</p>
            )}
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer select-none">Ver fórmula técnica</summary>
              <code className="block mt-1.5 font-mono bg-surface rounded px-2 py-1.5">
                {generatedResult.formula_expression}
              </code>
            </details>
            <div className="flex items-center gap-2 pt-1">
              <Button type="button" size="sm" onClick={acceptGenerated}>
                {onGenerated ? "Usar esta propuesta" : "Usar esta fórmula"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setGeneratedResult(null)}>
                Volver a describir
              </Button>
            </div>
            {onGenerated && (
              <p className="text-[11px] text-muted-foreground pt-0.5">
                También completa nombre, categoría, descripción y unidad arriba — revisalos antes de guardar.
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Fórmula</Label>
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setMode("simple")}>
            <Sparkles size={12} aria-hidden="true" /> Generar con IA
          </Button>
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1">
                <Plus size={12} aria-hidden="true" /> Insertar variable
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="end">
              <Command>
                <CommandInput placeholder="Buscar campo, métrica o función…" />
                <CommandList>
                  <CommandEmpty>Sin resultados.</CommandEmpty>
                  {fields.length > 0 && (
                    <CommandGroup heading="Campos">
                      {fields.map((s) => (
                        <CommandItem
                          key={suggestionId(s)}
                          value={suggestionSearchValue(s)}
                          onSelect={() => insertFromPicker(s)}
                          className="flex items-center justify-between gap-3"
                        >
                          <SuggestionRow s={s} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {metricSuggestions.length > 0 && (
                    <CommandGroup heading="Métricas">
                      {metricSuggestions.map((s) => (
                        <CommandItem
                          key={suggestionId(s)}
                          value={suggestionSearchValue(s)}
                          onSelect={() => insertFromPicker(s)}
                          className="flex items-center justify-between gap-3"
                        >
                          <SuggestionRow s={s} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  {rawFieldSuggestions.length > 0 && (
                    <CommandGroup heading="Campos crudos">
                      {rawFieldSuggestions.map((s) => (
                        <CommandItem
                          key={suggestionId(s)}
                          value={suggestionSearchValue(s)}
                          onSelect={() => insertFromPicker(s)}
                          className="flex items-center justify-between gap-3"
                        >
                          <SuggestionRow s={s} />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  <CommandGroup heading="Funciones">
                    {functionSuggestions.map((s) => (
                      <CommandItem
                        key={suggestionId(s)}
                        value={suggestionSearchValue(s)}
                        onSelect={() => insertFromPicker(s)}
                        className="flex items-center justify-between gap-3"
                      >
                        <SuggestionRow s={s} />
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <div className="relative mt-1.5">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onClick={handleClick}
          onKeyDown={handleKeyDown}
          onKeyUp={handleKeyUp}
          onBlur={() => setAutoOpen(false)}
          className="font-mono text-sm"
          rows={6}
          placeholder='Ej: SUM(revenue, headcount) o revenue / headcount'
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={autoOpen && filtered.length > 0}
          aria-controls="formula-autocomplete-listbox"
          aria-activedescendant={autoOpen && filtered.length > 0 ? `formula-option-${autoIndex}` : undefined}
        />
        {autoOpen && filtered.length > 0 && (
          <div
            id="formula-autocomplete-listbox"
            role="listbox"
            className="absolute z-20 mt-1 w-full max-w-sm rounded-md border border-border bg-popover shadow-md overflow-hidden py-1"
          >
            {filtered.map((s, i) => (
              <button
                key={suggestionId(s)}
                id={`formula-option-${i}`}
                role="option"
                aria-selected={i === autoIndex}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => acceptSuggestion(s)}
                className={cn(
                  "w-full px-3 py-1.5 text-left text-sm transition-colors",
                  i === autoIndex ? "bg-accent text-accent-foreground" : "hover:bg-surface"
                )}
              >
                <SuggestionRow s={s} />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Parameter hint: only when the cursor is inside a function call and
          there's nothing to autocomplete (the two never really overlap —
          typing a word closes once "(" appears — but guard anyway). */}
      {!autoOpen && enclosingCall && (
        <div className="mt-1.5 rounded-md border border-border bg-surface px-3 py-2 text-xs">
          <div className="font-mono">
            <span className="font-medium text-foreground">{enclosingCall.name}</span>
            <span className="text-muted-foreground">(</span>
            {signature ? (
              signature.params.map((p, i) => {
                const isCurrent = i === Math.min(enclosingCall.argIndex, signature.params.length - 1);
                return (
                  <span key={i}>
                    {i > 0 && <span className="text-muted-foreground">, </span>}
                    <span className={isCurrent ? "text-primary font-medium" : "text-muted-foreground"}>{p}</span>
                  </span>
                );
              })
            ) : (
              <span className="text-muted-foreground">…</span>
            )}
            <span className="text-muted-foreground">)</span>
          </div>
          <p className="text-muted-foreground mt-1 font-sans">
            {signature
              ? signature.description
              : "Esta función no tiene ayuda acá todavía. Puede que necesite un rango de celdas, algo que este editor no soporta (solo variables sueltas). Si no calcula, probá con otra función."}
          </p>
        </div>
      )}

      {value.trim() && (
        <div
          aria-live="polite"
          className={cn(
            "mt-1.5 rounded-md border px-3 py-2 text-xs",
            hasRawFieldRefs && rawFieldValuesLoading
              ? "border-border bg-surface text-muted-foreground"
              : preview.error
                ? "border-destructive/40 bg-destructive/5 text-destructive"
                : preview.value !== null
                  ? "border-success/40 bg-success/5 text-foreground"
                  : "border-border bg-surface text-muted-foreground"
          )}
        >
          {hasRawFieldRefs && rawFieldValuesLoading ? (
            <>Calculando con los datos crudos…</>
          ) : preview.error ? (
            <>No se puede calcular: {preview.error}</>
          ) : preview.value !== null ? (
            <>
              Con los datos del período actual da{" "}
              <span className="font-medium">{formatMetricValue(preview.value, unit)}</span>.
            </>
          ) : (
            <>
              Todavía no se puede calcular: falta cargar{" "}
              {preview.missing.map((k) => metricSuggestions.find((m) => suggestionId(m) === k)?.label ?? k).join(", ")}.
            </>
          )}
        </div>
      )}

      <p className="text-xs text-muted-foreground mt-1.5">
        Funciona como Google Sheets: escribí y elegí de la lista, o usá <span className="font-medium">Insertar variable</span>.
        Para promediar o sumar meses anteriores usá <code>SUMLAST("revenue", 3)</code>, <code>AVGLAST("revenue", 3)</code> o{" "}
        <code>YTD("revenue")</code>. Para traer datos crudos de una integración usá{" "}
        <code>FIELDSUM("campo")</code>, <code>FIELDCOUNT("campo")</code>, <code>FIELDCOUNTD("campo")</code> o{" "}
        <code>FIELDAVG("campo")</code> — opcionalmente con un filtro:{" "}
        <code>FIELDSUM("monto", "evento", "New,Renewal")</code> suma "monto" solo en las filas donde "evento" es "New"
        o "Renewal". El nombre del campo (y los filtros) van siempre entre comillas.
      </p>
    </div>
  );
}
