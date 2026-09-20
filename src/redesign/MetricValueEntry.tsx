import { useState } from "react";
import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { sourceLabel } from "@/lib/metrics";
import type { RecordItem } from "./model";

export function MetricValueEntry({ item, onSave, onOpenSource, onAsk }: { item: RecordItem; onSave: (item: RecordItem) => void; onOpenSource?: (id: string) => void; onAsk?: (context: { period: string; scenario: string; pendingValue?: string }) => void }) {
  const [period, setPeriod] = useState("2026-08");
  const [scenario, setScenario] = useState("actual");
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const calculated = item.fields?.metric_type === "calculated" || ["arr", "runway", "margin"].includes(item.id);
  const context = `${period}:${scenario}`;
  const savedValue = item.entries?.[context] ?? "";
  const value = drafts[context] ?? savedValue;
  const dirty = value !== savedValue;
  const syncedFrom = sourceLabel(String(item.fields?.source || (item.id === "mrr" ? "stripe" : "manual_form")));
  const sourceId = String(item.fields?.source_connection_id || (item.id === "mrr" ? "stripe" : ""));
  const readOnly = !!syncedFrom && scenario === "actual";
  const resetDraft = () => setDrafts(current => { const next = { ...current }; delete next[context]; return next; });
  const changeContext = (month: string, kind: string) => { setPeriod(month); setScenario(kind); setError(""); };
  const commit = () => {
    if (readOnly) return;
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period) || !value.trim() || (item.fields?.value_type !== "text" && !Number.isFinite(Number(value)))) { setError("Elegí un período e ingresá un valor válido."); return; }
    if (item.fields?.value_type === "count" && !Number.isInteger(Number(value))) { setError("Esta métrica requiere un número entero."); return; }
    onSave({ ...item, value: period === "2026-08" && scenario === "actual" ? value : item.value, entries: { ...item.entries, [context]: value } });
    resetDraft();
  };
  if (calculated) return <p className="rd-info-note">El valor se obtiene de la consulta de cálculo. Editá la configuración para cambiarla; esta demo no ejecuta cálculos del backend.</p>;
  return <div className="rd-mapped-form">
    <h3>Valores por período</h3>{onAsk && <Button variant="ghost" onClick={() => onAsk({ period, scenario, pendingValue: dirty ? value : undefined })}>Consultar este valor al asistente</Button>}
    <FormField label="Período" htmlFor="entry-period"><Input id="entry-period" type="month" value={period} onChange={e => changeContext(e.target.value, scenario)} /></FormField>
    <FormField label="Escenario" htmlFor="entry-scenario"><select id="entry-scenario" value={scenario} onChange={e => changeContext(period, e.target.value)}><option value="actual">Real</option><option value="forecast">Forecast</option><option value="budget">Presupuesto</option></select></FormField>
    {readOnly ? <div className="rd-mapped-form"><p className="rd-info-note">El valor real se sincroniza desde {syncedFrom}. Corregilo en la fuente.</p><p>Valor del período: <strong>{savedValue || (period === "2026-08" ? item.value : "Sin datos")}</strong></p>{sourceId && onOpenSource && <Button variant="outline" onClick={() => onOpenSource(sourceId)}>Ver fuente: {syncedFrom}</Button>}</div> : <>
    <FormField label={item.fields?.unit ? `Valor (${item.fields.unit})` : "Valor"} htmlFor="entry-value"><Input id="entry-value" type={item.fields?.value_type === "text" ? "text" : "number"} step={item.fields?.value_type === "count" ? 1 : "any"} value={value} aria-invalid={!!error} aria-describedby={error ? "entry-error" : undefined} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } if (e.key === "Escape" && dirty) { e.preventDefault(); e.stopPropagation(); resetDraft(); setError(""); } }} onChange={e => { setDrafts(current => ({ ...current, [context]: e.target.value })); setError(""); }} />{error && <p id="entry-error" role="alert" className="rd-field-error">{error}</p>}</FormField>
    {dirty && <p role="status" className="rd-muted">Valor sin guardar. Enter guarda; Escape descarta esta edición.</p>}
    <div className="rd-value-actions"><Button onClick={commit} disabled={!dirty}>Guardar valor</Button>{dirty && <Button variant="ghost" onClick={() => { resetDraft(); setError(""); }}>Descartar edición</Button>}{savedValue !== "" && <Button variant="outline" onClick={() => { const entries = { ...item.entries }; delete entries[context]; onSave({ ...item, entries, value: period === "2026-08" && scenario === "actual" ? "—" : item.value }); resetDraft(); setError(""); }}>Borrar valor de este período</Button>}</div>
    </>}
    <p className="rd-muted">Forecast y presupuesto se guardan por separado del valor real.</p>
  </div>;
}
