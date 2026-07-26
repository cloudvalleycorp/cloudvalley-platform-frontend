import { Info, ArrowUp, ArrowDown } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { evalFormula, requiredInputs, formatMetricValue, type MetricDef, type InputsMap } from "@/lib/metrics";
import type { ReportSection } from "@/lib/financialReports";

type Props = {
  section: ReportSection;
  metricById: Record<string, MetricDef>;
  currentInputs: InputsMap;
  prevInputs: InputsMap;
  historyInputs: InputsMap[];
  onInfo: (m: MetricDef) => void;
};

// A report block can be an input or a calculated metric — unlike Growth
// Tracker (which splits them into a list + a grid), a report renders blocks
// as one grid in the exact order the owner arranged them, so both types
// share this one card shape.
export function ReportSectionView({ section, metricById, currentInputs, prevInputs, historyInputs, onInfo }: Props) {
  const resolvedBlocks = section.blocks.map((b) => metricById[b.metric_id]).filter((d): d is MetricDef => !!d);

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">{section.title}</h3>
        {section.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{section.subtitle}</p>}
      </div>
      {resolvedBlocks.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin métricas en esta sección.</p>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {resolvedBlocks.map((def) => (
            <MetricBlockCard
              key={def.id}
              def={def}
              currentInputs={currentInputs}
              prevInputs={prevInputs}
              historyInputs={historyInputs}
              onInfo={onInfo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MetricBlockCard({
  def,
  currentInputs,
  prevInputs,
  historyInputs,
  onInfo,
}: {
  def: MetricDef;
  currentInputs: InputsMap;
  prevInputs: InputsMap;
  historyInputs: InputsMap[];
  onInfo: (m: MetricDef) => void;
}) {
  const expr = def.metric_type === "calculated" ? def.formula_expression : null;

  const valueFor = (inputs: InputsMap): number | null => {
    if (expr) return evalFormula(expr, inputs);
    return def.input_key ? inputs[def.input_key] ?? null : null;
  };

  const current = valueFor(currentInputs);
  const prev = valueFor(prevInputs);
  const change = current != null && prev != null && prev !== 0 ? ((current - prev) / Math.abs(prev)) * 100 : null;
  const sparkData = historyInputs.map((inp) => ({ v: valueFor(inp) ?? 0 }));
  const missing = expr
    ? requiredInputs(expr).filter((k) => currentInputs[k] === undefined)
    : def.input_key && currentInputs[def.input_key] === undefined
      ? [def.input_key]
      : [];

  return (
    <div className="border border-border rounded-lg bg-card p-5">
      <div className="flex items-start justify-between">
        <h4 className="text-sm font-medium text-muted-foreground">{def.name}</h4>
        <button onClick={() => onInfo(def)} className="text-muted-foreground hover:text-foreground" aria-label={`Info sobre ${def.name}`}>
          <Info size={14} strokeWidth={1.5} />
        </button>
      </div>
      <div className="mt-4">
        {missing.length > 0 ? (
          <div className="border border-dashed border-border rounded-md p-3 mt-1">
            <p className="text-xs text-muted-foreground">Métrica no disponible.</p>
          </div>
        ) : (
          <>
            <div className="text-3xl font-medium tracking-tight">{formatMetricValue(current, def.unit)}</div>
            {change != null && (
              <div className="text-xs text-muted-foreground mt-1 inline-flex items-center gap-1">
                {change >= 0 ? <ArrowUp size={12} strokeWidth={1.5} /> : <ArrowDown size={12} strokeWidth={1.5} />}
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
              <Line type="monotone" dataKey="v" stroke="hsl(var(--foreground))" strokeWidth={1} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
