type Pillar = { name: string; score: number };

export function ReadinessScore({ score, pillars }: { score: number; pillars: Pillar[] }) {
  return (
    <div className="border border-border rounded-lg bg-card p-8">
      <div className="flex items-baseline gap-2">
        <span className="text-6xl font-medium tracking-tight text-foreground">{score}</span>
        <span className="text-2xl text-tertiary">/100</span>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Readiness score</p>

      <div className="mt-8 space-y-4">
        {pillars.map((p) => (
          <div key={p.name}>
            <div className="flex justify-between text-xs mb-1.5">
              <span className="text-muted-foreground">{p.name}</span>
              <span className="text-foreground tabular-nums">{p.score}%</span>
            </div>
            <div className="h-1 w-full bg-surface rounded-full overflow-hidden">
              <div
                className="h-full bg-foreground transition-all duration-150"
                style={{ width: `${p.score}%` }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
