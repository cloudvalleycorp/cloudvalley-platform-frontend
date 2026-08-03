import { memo, type ReactNode } from "react";
import { Info, ArrowUp, ArrowDown } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import { formatMetricValue } from "@/lib/metrics";

type Props = {
  name: string;
  unit: string | null;
  // Shown under the name — CalculatedMetricsGrid passes the formula text,
  // ReportSectionView doesn't have an equivalent to show.
  subtitle?: string | null;
  // Slot for PrivacyToggle — only the founder-facing grid passes one.
  privacyToggle?: ReactNode;
  onInfo: () => void;
  current: number | null;
  missing: string[];
  // Custom missing-state copy (e.g. "Cargá X para ver esta métrica.") — falls
  // back to the generic message when omitted.
  missingMessage?: ReactNode;
  error?: string | null;
  change: number | null;
  sparkData: { v: number }[];
};

export const MetricValueCard = memo(function MetricValueCard({
  name,
  unit,
  subtitle,
  privacyToggle,
  onInfo,
  current,
  missing,
  missingMessage,
  error,
  change,
  sparkData,
}: Props) {
  return (
    <div className="border border-border rounded-lg bg-card p-5">
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {privacyToggle}
            <h3 className="text-sm font-medium text-muted-foreground">{name}</h3>
          </div>
          {subtitle && <p className="text-xs text-muted-foreground/70 mt-0.5">{subtitle}</p>}
        </div>
        <button
          onClick={onInfo}
          className="p-1.5 -m-1.5 text-muted-foreground hover:text-foreground"
          aria-label={`Info sobre ${name}`}
        >
          <Info size={14} strokeWidth={1.5} aria-hidden="true" />
        </button>
      </div>

      <div className="mt-4" aria-live="polite">
        {error ? (
          <div className="border border-dashed border-destructive/40 rounded-md p-3 mt-1">
            <p className="text-xs text-destructive">{error}</p>
          </div>
        ) : missing.length > 0 ? (
          <div className="border border-dashed border-border rounded-md p-3 mt-1">
            <p className="text-xs text-muted-foreground">{missingMessage ?? "Métrica no disponible."}</p>
          </div>
        ) : (
          <>
            <div className="text-3xl font-medium tracking-tight">{formatMetricValue(current, unit)}</div>
            {change != null && (
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                {change >= 0 ? (
                  <ArrowUp size={12} strokeWidth={1.5} aria-hidden="true" />
                ) : (
                  <ArrowDown size={12} strokeWidth={1.5} aria-hidden="true" />
                )}
                {Math.abs(change).toFixed(1)}% vs mes anterior
              </div>
            )}
          </>
        )}
      </div>

      {!error && missing.length === 0 && (
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
});
