type Tone = "primary" | "success" | "warning" | "danger" | "muted";

const TONE_STROKE: Record<Tone, string> = {
  primary: "hsl(var(--primary))",
  success: "hsl(var(--success))",
  warning: "hsl(var(--warning))",
  danger: "hsl(var(--destructive))",
  muted: "hsl(var(--muted-foreground))",
};

/**
 * Anillo de cobertura (% cumplido) — mismo lenguaje visual en toda la
 * sección de Métricas del fondo: tarjetas de requisito, header de columna
 * del dashboard comparativo. Colores salen de los tokens semánticos ya
 * verificados (success/warning/destructive), nunca un hex nuevo.
 */
export function CoverageRing({
  percent,
  size = 40,
  strokeWidth = 3.5,
  label,
  tone = "primary",
  className,
}: {
  percent: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  tone?: Tone;
  className?: string;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, percent));
  const offset = c - (clamped / 100) * c;

  return (
    <div
      className={className}
      style={{ width: size, height: size, position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
      role="img"
      aria-label={`${Math.round(clamped)}% de cobertura`}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(var(--border))" strokeWidth={strokeWidth} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={TONE_STROKE[tone]}
          strokeWidth={strokeWidth}
          strokeDasharray={c}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .3s ease" }}
        />
      </svg>
      {label && (
        <span
          className="absolute text-[10px] font-medium text-foreground"
          style={{ fontVariantNumeric: "tabular-nums" }}
          aria-hidden="true"
        >
          {label}
        </span>
      )}
    </div>
  );
}

/** Umbral compartido: verde ≥80%, ámbar 40-79%, rojo &lt;40% (solo si hay algo que cubrir). */
export function coverageTone(percent: number, targetCount: number): Tone {
  if (targetCount === 0) return "muted";
  if (percent >= 80) return "success";
  if (percent >= 40) return "warning";
  return "danger";
}
