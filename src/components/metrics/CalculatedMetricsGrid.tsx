import { Info, ArrowUp, ArrowDown } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { PrivacyToggle } from "@/components/privacy/PrivacyToggle";
import { evalFormula, requiredInputs, formatMetricValue, type MetricDef, type InputsMap } from "@/lib/metrics";

type Props = {
  metrics: MetricDef[];
  currentInputs: InputsMap;
  prevInputs: InputsMap;
  historyInputs: InputsMap[]; // last 6 months including current, oldest first
  inputDefs: MetricDef[]; // to render friendly missing-input names
  onInfo: (m: MetricDef) => void;
  privacy?: Record<string, boolean>;
  onTogglePrivacy?: (metricId: string, next: boolean) => Promise<void>;
};

export function CalculatedMetricsGrid({
  metrics,
  currentInputs,
  prevInputs,
  historyInputs,
  inputDefs,
  onInfo,
  privacy,
  onTogglePrivacy,
}: Props) {
  const inputNameByKey = Object.fromEntries(
    inputDefs.map((d) => [d.input_key!, d.name])
  );

  if (metrics.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium mb-3">Métricas calculadas</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {metrics.map((m) => {
          const expr = m.formula_expression!;
          const current = evalFormula(expr, currentInputs);
          const prev = evalFormula(expr, prevInputs);
          const change =
            current != null && prev != null && prev !== 0
              ? ((current - prev) / Math.abs(prev)) * 100
              : null;
          const sparkData = historyInputs.map((inp) => ({
            v: evalFormula(expr, inp) ?? 0,
          }));
          const required = requiredInputs(expr);
          const missing = required.filter(
            (k) => currentInputs[k] === undefined
          );

          return (
            <div key={m.id} className="border border-border rounded-lg bg-card p-5">
              <div className="flex items-start justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {onTogglePrivacy && (
                      <PrivacyToggle
                        isPublic={privacy?.[m.id] ?? true}
                        onChange={(next) => onTogglePrivacy(m.id, next)}
                      />
                    )}
                    <h3 className="text-sm font-medium text-muted-foreground">{m.name}</h3>
                  </div>
                  {m.formula && (
                    <p className="text-xs text-muted-foreground/70 mt-0.5">{m.formula}</p>
                  )}
                </div>
                <button
                  onClick={() => onInfo(m)}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Info size={14} strokeWidth={1.5} />
                </button>
              </div>

              <div className="mt-4">
                {missing.length > 0 ? (
                  <div className="border border-dashed border-border rounded-md p-3 mt-1">
                    <p className="text-xs text-muted-foreground">
                      Cargá{" "}
                      <span className="text-foreground font-medium">
                        {missing.map((k) => inputNameByKey[k] ?? k).join(" y ")}
                      </span>{" "}
                      para ver esta métrica.
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="text-3xl font-medium tracking-tight">
                      {formatMetricValue(current, m.unit)}
                    </div>
                    {change != null && (
                      <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                        {change >= 0 ? (
                          <ArrowUp size={12} strokeWidth={1.5} />
                        ) : (
                          <ArrowDown size={12} strokeWidth={1.5} />
                        )}
                        {Math.abs(change).toFixed(1)}% vs mes anterior
                      </div>
                    )}
                  </>
                )}
              </div>

              {missing.length === 0 && (
                <div className="mt-4 h-10">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sparkData}>
                      <Line
                        type="monotone"
                        dataKey="v"
                        stroke="hsl(var(--foreground))"
                        strokeWidth={1}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}