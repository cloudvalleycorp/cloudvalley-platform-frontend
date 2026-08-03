import { MONTH_LABELS } from "@/lib/metricPeriod";
import { cn } from "@/lib/utils";

type Period = { month: number; year: number };

type Props = {
  period: Period;
  onChange: (period: Period) => void;
  className?: string;
};

// Shared by Metrics.tsx, ReportEditor.tsx, and InvestorCompany.tsx — always
// "last 12 months from today", regardless of which one is currently selected.
export function PeriodSelect({ period, onChange, className }: Props) {
  const now = new Date();
  return (
    <select
      value={`${period.year}-${period.month}`}
      onChange={(e) => {
        const [y, m] = e.target.value.split("-").map(Number);
        onChange({ month: m, year: y });
      }}
      className={cn("border border-border rounded-md px-3 py-1.5 text-sm bg-background h-9", className)}
      aria-label="Seleccionar período"
    >
      {Array.from({ length: 12 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - i);
        return (
          <option key={i} value={`${d.getFullYear()}-${d.getMonth() + 1}`}>
            {MONTH_LABELS[d.getMonth()]} {d.getFullYear()}
          </option>
        );
      })}
    </select>
  );
}
