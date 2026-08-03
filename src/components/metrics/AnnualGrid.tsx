import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Info, ChevronLeft, ChevronRight, Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { PrivacyToggle } from "@/components/privacy/PrivacyToggle";
import type { MetricDef, InputsMap } from "@/lib/metrics";
import { formatMetricValue, formatValueByType, sourceLabel, sourceSettingsPath } from "@/lib/metrics";
import { evalFormula } from "@/lib/formulaEngine";
import { toPeriodString } from "@/lib/metricPeriod";

const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

type Props = {
  year: number;
  onYearChange: (y: number) => void;
  inputDefs: MetricDef[]; // input defs in current category
  calcDefs: MetricDef[]; // calculated defs in current category
  allInputDefs: MetricDef[]; // all input defs across categories (for formulas)
  allCalcDefs?: MetricDef[]; // all calculated defs across categories (metric reuse inside formulas)
  // entries[metric_id]["YYYY-M"] = value
  entries: Record<string, Record<string, number>>;
  onSaveBatch: (
    changes: { metricId: string; year: number; month: number; value: number | null }[]
  ) => Promise<void>;
  privacy: Record<string, boolean>; // metric_id -> is_public
  onTogglePrivacy?: (metricId: string, next: boolean) => Promise<void>;
  onInfo: (m: MetricDef) => void;
  // Valores pre-resueltos de FIELDSUM/FIELDCOUNT/FIELDCOUNTD/FIELDAVG por
  // período ("YYYY-MM", ver toPeriodString) — necesarios para que una
  // fórmula que lee datos crudos de una integración calcule algo en cada
  // columna del año. Sin esto, esas fórmulas dan "—" en todo el grid (no
  // rompen, simplemente no tienen con qué calcular).
  rawFieldValuesByPeriod?: Record<string, Record<string, number | null>>;
};

const k = (y: number, m: number) => `${y}-${m}`;

export function AnnualGrid({
  year,
  onYearChange,
  inputDefs,
  calcDefs,
  allInputDefs,
  allCalcDefs = [],
  entries,
  onSaveBatch,
  privacy,
  onTogglePrivacy,
  onInfo,
  rawFieldValuesByPeriod = {},
}: Props) {
  // pending edits keyed `metric_id|month` -> raw string
  const [pending, setPending] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<{ metricId: string; month: number } | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [editing]);

  // Reset pending when year changes
  useEffect(() => {
    setPending({});
    setEditing(null);
  }, [year]);

  const inputDefByKey = useMemo(() => {
    const map: Record<string, MetricDef> = {};
    for (const d of allInputDefs) if (d.input_key) map[d.input_key] = d;
    return map;
  }, [allInputDefs]);

  const inputDefById = useMemo(() => {
    const map: Record<string, MetricDef> = {};
    for (const d of allInputDefs) map[d.id] = d;
    return map;
  }, [allInputDefs]);

  // Rows whose source is an automated integration have no cells to tab into.
  const editableInputDefs = useMemo(() => inputDefs.filter((d) => !sourceLabel(d.source)), [inputDefs]);

  const inputsForMonth = (m: number): InputsMap => {
    const result: InputsMap = {};
    for (const def of allInputDefs) {
      if (!def.input_key) continue;
      const pendKey = `${def.id}|${m}`;
      const pendVal = pending[pendKey];
      if (pendVal !== undefined && pendVal !== "") {
        const n = Number(pendVal);
        if (!isNaN(n)) result[def.input_key] = n;
      } else if (pendVal === "") {
        // explicit clear, leave undefined
      } else {
        const v = entries[def.id]?.[k(year, m)];
        if (v !== undefined) result[def.input_key] = v;
      }
    }
    return result;
  };

  const startEdit = (metricId: string, month: number, current: number | undefined) => {
    setEditing({ metricId, month });
    const pendKey = `${metricId}|${month}`;
    setDraft(pending[pendKey] ?? current?.toString() ?? "");
  };

  const commit = (next?: { metricId: string; month: number }) => {
    if (!editing) return;
    const pendKey = `${editing.metricId}|${editing.month}`;
    setPending((p) => ({ ...p, [pendKey]: draft.trim() }));
    setEditing(next ?? null);
    if (next) {
      const pk = `${next.metricId}|${next.month}`;
      const current = entries[next.metricId]?.[k(year, next.month)];
      setDraft(pending[pk] ?? current?.toString() ?? "");
    }
  };

  const handleKey = (e: React.KeyboardEvent, metricId: string, month: number) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    } else if (e.key === "Escape") {
      setEditing(null);
    } else if (e.key === "Tab") {
      e.preventDefault();
      // move to next cell: next month, or first month of next (editable) input
      const idx = editableInputDefs.findIndex((d) => d.id === metricId);
      let nextMetric = metricId;
      let nextMonth = month + (e.shiftKey ? -1 : 1);
      if (nextMonth > 12) {
        nextMonth = 1;
        const ni = idx + 1;
        if (ni < editableInputDefs.length) nextMetric = editableInputDefs[ni].id;
        else {
          commit();
          return;
        }
      } else if (nextMonth < 1) {
        nextMonth = 12;
        const ni = idx - 1;
        if (ni >= 0) nextMetric = editableInputDefs[ni].id;
        else {
          commit();
          return;
        }
      }
      commit({ metricId: nextMetric, month: nextMonth });
    }
  };

  const cellValue = (metricId: string, month: number): { display: string; pending: boolean } => {
    const valueType = inputDefById[metricId]?.value_type ?? null;
    const pendKey = `${metricId}|${month}`;
    const pendVal = pending[pendKey];
    if (pendVal !== undefined) {
      return { display: pendVal === "" ? "—" : formatValueByType(Number(pendVal), valueType), pending: true };
    }
    const v = entries[metricId]?.[k(year, month)];
    return {
      display: v === undefined ? "—" : formatValueByType(v, valueType),
      pending: false,
    };
  };

  // Precomputed once per relevant-state change instead of re-running
  // calcDefs.length × 12 evalFormula calls on every render (e.g. every
  // keystroke while editing an unrelated input cell, since `draft` is local
  // state that re-renders the whole grid but doesn't touch `pending`/
  // `entries` until commit).
  const calcGrid = useMemo(() => {
    const table: Record<string, (number | null)[]> = {};
    for (const def of calcDefs) {
      const row: (number | null)[] = [];
      for (let month = 1; month <= 12; month++) {
        const inputs = inputsForMonth(month);
        const rawFieldValues = rawFieldValuesByPeriod[toPeriodString(month, year)] ?? {};
        row.push(evalFormula(def.formula_expression!, inputs, [], allCalcDefs, rawFieldValues));
      }
      table[def.id] = row;
    }
    return table;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calcDefs, allCalcDefs, allInputDefs, entries, pending, year, rawFieldValuesByPeriod]);

  const pendingCount = Object.keys(pending).length;

  const save = async () => {
    const changes: { metricId: string; year: number; month: number; value: number | null }[] = [];
    for (const [pk, raw] of Object.entries(pending)) {
      const [metricId, monthStr] = pk.split("|");
      const month = Number(monthStr);
      if (raw.trim() === "") {
        changes.push({ metricId, year, month, value: null });
      } else {
        let n = Number(raw);
        if (!isNaN(n)) {
          if (inputDefById[metricId]?.value_type === "count") n = Math.round(n);
          changes.push({ metricId, year, month, value: n });
        }
      }
    }
    await onSaveBatch(changes);
    setPending({});
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => onYearChange(year - 1)}
            className="p-1.5 rounded-md hover:bg-surface text-muted-foreground hover:text-foreground transition-all"
            aria-label="Año anterior"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
          </button>
          <span className="text-sm font-medium tabular-nums w-12 text-center">{year}</span>
          <button
            onClick={() => onYearChange(year + 1)}
            className="p-1.5 rounded-md hover:bg-surface text-muted-foreground hover:text-foreground transition-all"
            aria-label="Año siguiente"
          >
            <ChevronRight size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="border border-border rounded-lg bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-muted-foreground border-b border-border">
              <th className="text-left font-normal px-4 py-3 sticky left-0 bg-card z-10 min-w-[220px]">
                Métrica
              </th>
              {months.map((m, i) => (
                <th key={i} className="text-right font-normal px-3 py-3 tabular-nums">
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inputDefs.length > 0 && (
              <>
                <tr>
                  <td colSpan={13} className="px-4 py-2 text-[11px] uppercase tracking-wide text-tertiary bg-surface/40">
                    Inputs
                  </td>
                </tr>
                {inputDefs.map((def) => {
                  const syncedFrom = sourceLabel(def.source);
                  const settingsPath = sourceSettingsPath(def.source, def.source_connection_id);
                  return (
                  <tr key={def.id} className="border-t border-border/40">
                    <td className="px-4 py-2 sticky left-0 bg-card">
                      <div className="flex items-center gap-2">
                        {onTogglePrivacy && (
                          <PrivacyToggle
                            isPublic={privacy[def.id] ?? true}
                            onChange={(next) => onTogglePrivacy(def.id, next)}
                          />
                        )}
                        <span className="text-sm">{def.name}</span>
                        {def.unit && (
                          <span className="text-xs text-muted-foreground">({def.unit})</span>
                        )}
                        {syncedFrom &&
                          (settingsPath ? (
                            <Link
                              to={settingsPath}
                              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground border border-border rounded-full px-2 py-0.5 hover:text-foreground hover:border-foreground/30 transition-colors"
                              title={`Se sincroniza desde ${syncedFrom}. Click para ir a la conexión.`}
                            >
                              <Zap size={10} strokeWidth={2} aria-hidden="true" />
                              {syncedFrom}
                            </Link>
                          ) : (
                            <span
                              className="inline-flex items-center gap-1 text-[11px] text-muted-foreground border border-border rounded-full px-2 py-0.5"
                              title={`Se sincroniza desde ${syncedFrom}.`}
                            >
                              <Zap size={10} strokeWidth={2} aria-hidden="true" />
                              {syncedFrom}
                            </span>
                          ))}
                        <button
                          onClick={() => onInfo(def)}
                          className="p-1.5 -m-1.5 text-muted-foreground hover:text-foreground"
                          aria-label={`Info sobre ${def.name}`}
                        >
                          <Info size={12} strokeWidth={1.5} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                    {months.map((_, i) => {
                      const month = i + 1;
                      const isEditing = !syncedFrom && editing?.metricId === def.id && editing?.month === month;
                      const pendKey = `${def.id}|${month}`;
                      const isPending = !syncedFrom && pending[pendKey] !== undefined;
                      const { display } = cellValue(def.id, month);
                      return (
                        <td
                          key={month}
                          className={cn(
                            "px-2 py-1 text-right tabular-nums w-20",
                            isPending && "border border-foreground"
                          )}
                        >
                          {syncedFrom ? (
                            <span className={cn("block px-1.5 py-1 text-muted-foreground", display === "—" && "text-tertiary")}>
                              {display}
                            </span>
                          ) : isEditing ? (
                            <input
                              ref={inputRef}
                              type="number"
                              step={def.value_type === "count" ? 1 : "any"}
                              value={draft}
                              onChange={(e) => setDraft(e.target.value)}
                              onBlur={() => commit()}
                              onKeyDown={(e) => handleKey(e, def.id, month)}
                              className="w-full bg-background border border-foreground rounded-sm px-1.5 py-1 text-right text-sm outline-none"
                              aria-label={def.name}
                            />
                          ) : (
                            <button
                              onClick={() => startEdit(def.id, month, entries[def.id]?.[k(year, month)])}
                              className={cn(
                                "w-full text-right px-1.5 py-1 rounded-sm hover:bg-surface transition-all inline-flex items-center justify-end gap-1",
                                display === "—" && "text-tertiary"
                              )}
                              aria-label={isPending ? `${display}, cambio sin guardar` : undefined}
                            >
                              {display}
                              {isPending && (
                                <span className="h-1 w-1 rounded-full bg-foreground" aria-hidden="true" />
                              )}
                            </button>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  );
                })}
              </>
            )}

            {calcDefs.length > 0 && (
              <>
                <tr>
                  <td colSpan={13} className="px-4 py-2 text-[11px] uppercase tracking-wide text-tertiary bg-surface/40 border-t border-border">
                    Calculadas
                  </td>
                </tr>
                {calcDefs.map((def) => (
                  <tr key={def.id} className="border-t border-border/40">
                    <td className="px-4 py-2 sticky left-0 bg-card">
                      <div className="flex items-center gap-2">
                        {onTogglePrivacy && (
                          <PrivacyToggle
                            isPublic={privacy[def.id] ?? true}
                            onChange={(next) => onTogglePrivacy(def.id, next)}
                          />
                        )}
                        <span className="text-sm">{def.name}</span>
                        <button
                          onClick={() => onInfo(def)}
                          className="p-1.5 -m-1.5 text-muted-foreground hover:text-foreground"
                          aria-label={`Info sobre ${def.name}`}
                        >
                          <Info size={12} strokeWidth={1.5} aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                    {months.map((_, i) => {
                      const month = i + 1;
                      const v = calcGrid[def.id][i];
                      return (
                        <td key={month} className="px-2 py-2 text-right tabular-nums w-20 text-muted-foreground">
                          {v === null ? "—" : formatMetricValue(v, def.unit)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </>
            )}
          </tbody>
        </table>
      </div>

      {pendingCount > 0 && (
        <div
          aria-live="polite"
          className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-foreground text-background rounded-full pl-5 pr-2 py-2 shadow-lg"
        >
          <span className="text-sm">
            {pendingCount} cambio{pendingCount === 1 ? "" : "s"} sin guardar
          </span>
          <button
            onClick={() => setPending({})}
            className="text-xs px-3 py-1 rounded-full hover:bg-background/10 transition-all"
          >
            Descartar
          </button>
          <Button
            size="sm"
            variant="secondary"
            onClick={save}
            className="rounded-full bg-background text-foreground hover:bg-background/90"
          >
            Guardar cambios
          </Button>
        </div>
      )}
    </div>
  );
}
