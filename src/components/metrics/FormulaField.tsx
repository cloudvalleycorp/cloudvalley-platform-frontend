import { useMemo, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { formatMetricValue, formatValueByType, type MetricDef, type InputsMap, type PeriodInputs } from "@/lib/metrics";
import {
  evalFormula,
  evalFormulaDetailed,
  findEnclosingCall,
  RECOMMENDED_FUNCTIONS,
  FUNCTION_SIGNATURES,
} from "@/lib/formulaEngine";

type Suggestion =
  | { kind: "function"; name: string }
  | { kind: "field"; key: string; label: string; value: number | undefined; valueType: MetricDef["value_type"] }
  | { kind: "metric"; id: string; label: string; value: number | null; unit: string | null };

function suggestionId(s: Suggestion): string {
  return s.kind === "function" ? s.name : s.kind === "field" ? s.key : s.id;
}

function suggestionSearchValue(s: Suggestion): string {
  return s.kind === "function" ? s.name : s.kind === "field" ? `${s.label} ${s.key}` : `${s.label} ${s.id}`;
}

function matchesToken(s: Suggestion, token: string): boolean {
  const t = token.toLowerCase();
  if (!t) return false;
  const id = suggestionId(s).toLowerCase();
  const label = s.kind === "function" ? "" : s.label.toLowerCase();
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
};

/**
 * Sheets/AppSheet-style formula editor: a searchable "Insertar variable"
 * picker, live-as-you-type autocomplete (functions + fields + reusable
 * metrics, filtered by the identifier being typed), auto-closing ()/""
 * pairs, a parameter-hint bar while inside a function call, and a live
 * preview against the real current-period data.
 */
export function FormulaField({ value, onChange, unit, inputDefs, calcDefs, currentInputs, formulaHistory }: Props) {
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

  const metricSuggestions: Suggestion[] = useMemo(
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

  const allSuggestions = useMemo(
    () => [...functionSuggestions, ...fields, ...metricSuggestions],
    [functionSuggestions, fields, metricSuggestions]
  );

  const preview = useMemo(
    () => evalFormulaDetailed(value, currentInputs, formulaHistory, calcDefs),
    [value, currentInputs, formulaHistory, calcDefs]
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
    } else {
      const id = suggestionId(s);
      insertAtCursor(id, id.length, tokenStart ?? undefined, cursorPos);
    }
  };

  const insertFromPicker = (s: Suggestion) => {
    if (s.kind === "function") {
      insertAtCursor(`${s.name}()`, s.name.length + 1);
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

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">Fórmula</Label>
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1">
              <Plus size={12} /> Insertar variable
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
        />
        {autoOpen && filtered.length > 0 && (
          <div className="absolute z-20 mt-1 w-full max-w-sm rounded-md border border-border bg-popover shadow-md overflow-hidden py-1">
            {filtered.map((s, i) => (
              <button
                key={suggestionId(s)}
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
            preview.error
              ? "border-destructive/40 bg-destructive/5 text-destructive"
              : preview.value !== null
                ? "border-success/40 bg-success/5 text-foreground"
                : "border-border bg-surface text-muted-foreground"
          )}
        >
          {preview.error ? (
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
        <code>YTD("revenue")</code>. El nombre del campo va entre comillas solo en esas tres.
      </p>
    </div>
  );
}
