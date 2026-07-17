import { cn } from "@/lib/utils";

const labels: Record<string, string> = {
  pre_seed: "Pre-Seed",
  seed: "Seed",
  series_a: "Serie A",
};

export function StageBadge({ stage, className }: { stage?: string | null; className?: string }) {
  if (!stage) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-surface text-foreground",
        className
      )}
    >
      {labels[stage] ?? stage}
    </span>
  );
}
