import { useState } from "react";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PeriodSelect } from "@/components/metrics/PeriodSelect";
import type { MetricDef } from "@/lib/metrics";
import type { MetricScenario } from "@/lib/financialData";
import { toPeriodString } from "@/lib/metricPeriod";

const SCENARIO_LABELS: Record<Exclude<MetricScenario, "actual">, string> = { forecast: "Forecast", budget: "Presupuesto" };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  inputDefs: MetricDef[];
  onSubmit: (periodStr: string, values: Record<string, number>, scenario: MetricScenario) => Promise<boolean>;
};

// Carga de escenarios (forecast/budget) — separado de InputsPanel/AnnualGrid
// a propósito: esos leen y escriben "actual" vía list-financial-records, que
// hoy NO filtra por escenario (solo submit-financial-record/evaluate-metrics
// lo soportan, ver Notas del handoff de backend). Mezclar la carga de
// escenarios en la grilla de "actual" mostraría un campo que, al guardar,
// "desaparece" (la grilla nunca lo va a leer de vuelta) — un callejón sin
// salida. Este diálogo es honesto sobre eso: lo cargado acá se lee después
// solo desde la comparación de Overview (evaluate-metrics + values_actual),
// nunca en la grilla mensual/anual.
export function ScenarioEntryDialog({ open, onOpenChange, inputDefs, onSubmit }: Props) {
  const now = new Date();
  const [scenario, setScenario] = useState<Exclude<MetricScenario, "actual">>("forecast");
  const [period, setPeriod] = useState({ month: now.getMonth() + 1, year: now.getFullYear() });
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setScenario("forecast");
    setValues({});
  };

  const handleSubmit = async () => {
    const parsed: Record<string, number> = {};
    for (const d of inputDefs) {
      if (!d.input_key) continue;
      const raw = values[d.input_key];
      if (raw === undefined || raw.trim() === "") continue;
      const n = Number(raw);
      if (!Number.isNaN(n)) parsed[d.input_key] = n;
    }
    if (Object.keys(parsed).length === 0) return;
    setSaving(true);
    const ok = await onSubmit(toPeriodString(period.month, period.year), parsed, scenario);
    setSaving(false);
    if (ok) {
      reset();
      onOpenChange(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
      title="Cargar escenario"
      description="Los valores de forecast/presupuesto se guardan aparte de tus datos reales y se pueden comparar desde Overview — nunca pisan lo ya cargado."
      contentClassName="sm:max-w-lg"
      submitLabel="Guardar escenario"
      onSubmit={handleSubmit}
      busy={saving}
    >
      <div className="flex items-center gap-3">
        <FormField label="Escenario" className="flex-1">
          <Select value={scenario} onValueChange={(v) => setScenario(v as Exclude<MetricScenario, "actual">)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SCENARIO_LABELS) as Exclude<MetricScenario, "actual">[]).map((s) => (
                <SelectItem key={s} value={s}>
                  {SCENARIO_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Período" className="flex-1">
          <PeriodSelect period={period} onChange={setPeriod} className="w-full" />
        </FormField>
      </div>

      <div className="space-y-2 pt-2 border-t border-border">
        {inputDefs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay campos de entrada para cargar.</p>
        ) : (
          inputDefs.map((d) => (
            <div key={d.id} className="flex items-center gap-3">
              <label htmlFor={`scenario-${d.id}`} className="text-sm text-muted-foreground flex-1 truncate">
                {d.name}
              </label>
              <Input
                id={`scenario-${d.id}`}
                type="number"
                step="any"
                className="w-32 h-8 text-sm"
                value={values[d.input_key ?? ""] ?? ""}
                onChange={(e) => setValues((prev) => ({ ...prev, [d.input_key ?? ""]: e.target.value }))}
              />
            </div>
          ))
        )}
      </div>
    </FormDialog>
  );
}
