import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, Minus, Settings2 } from "lucide-react";
import { SectionNum } from "@/components/dashboard/SectionNum";
import { SectionCard } from "@/components/SectionCard";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatMetricValue, percentChange, type MetricDef } from "@/lib/metrics";
import { DASHBOARD_KPI_MAX, defaultDashboardKpiIds, orderKpiIds, type KpiSaveOutcome } from "@/lib/dashboardKpis";
import { cn } from "@/lib/utils";

// up=true: subir es buena noticia. up=false: subir es mala (burn). Solo aplica
// a métricas estándar, que tienen clave conocida. Las métricas propias no tienen
// dirección: su variación va en gris, sin inventar si es buena o mala.
const GOOD_DIRECTION_UP: Record<string, boolean> = {
  arr: true,
  mrr: true,
  revenue: true,
  growth: true,
  gross_margin: true,
  cash: true,
  runway: true,
  burn: false,
};

type Props = {
  metrics: MetricDef[];
  selectedIds: string[];
  values: Record<string, Record<string, number>>;
  loading: boolean;
  monthLabel: string;
  saving: boolean;
  onChangeSelected: (ids: string[]) => Promise<KpiSaveOutcome>;
};

function KpiTile({ metric, series, monthLabel }: { metric: MetricDef; series: Record<string, number>; monthLabel: string }) {
  const periods = Object.keys(series).sort();
  const current = periods.length > 0 ? series[periods[periods.length - 1]] : null;
  const prev = periods.length > 1 ? series[periods[periods.length - 2]] : null;
  const change = current == null ? null : percentChange(current, prev ?? null);
  const goodUp = metric.standard_key ? (GOOD_DIRECTION_UP[metric.standard_key] ?? true) : null;
  const isGood = change == null || change === 0 || goodUp == null ? null : (change > 0) === goodUp;

  return (
    <div className="border border-border rounded-lg bg-card p-4 min-h-[112px] min-w-0 flex flex-col justify-between">
      <span className="text-xs font-medium text-muted-foreground truncate">{metric.name}</span>
      <div>
        {current == null ? (
          <p className="text-sm text-muted-foreground">
            Sin dato en {monthLabel}.{" "}
            <Link to="/metrics?tab=sources" className="text-primary-dark hover:underline">
              Cargalo en Fuentes
            </Link>{" "}
            para que aparezca.
          </p>
        ) : (
          <div className="text-xl font-medium tabular-nums">{formatMetricValue(current, metric.unit)}</div>
        )}
        {change == null ? (
          current != null && (
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Minus size={12} strokeWidth={1.5} aria-hidden="true" /> Sin comparación
            </div>
          )
        ) : change === 0 ? (
          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Minus size={12} strokeWidth={1.5} aria-hidden="true" /> Sin cambios
          </div>
        ) : (
          <div
            className={cn(
              "text-xs font-medium flex items-center gap-1 mt-0.5",
              isGood === true && "text-success-dark",
              isGood === false && "text-destructive-dark",
              isGood === null && "text-muted-foreground"
            )}
          >
            {change > 0 ? (
              <ArrowUpRight size={12} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <ArrowDownRight size={12} strokeWidth={1.5} aria-hidden="true" />
            )}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  );
}

type OptionGroupProps = {
  title: string;
  list: MetricDef[];
  draft: string[];
  full: boolean;
  onToggle: (id: string, checked: boolean) => void;
};

function KpiOptionGroup({ title, list, draft, full, onToggle }: OptionGroupProps) {
  if (list.length === 0) return null;
  return (
    <div className="space-y-1">
      <p className="pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{title}</p>
      {list.map((m) => {
        const checked = draft.includes(m.id);
        const disabled = !checked && full;
        return (
          <label
            key={m.id}
            className={cn(
              "flex items-center gap-3 rounded-md px-2 py-2 text-sm",
              disabled ? "opacity-50" : "cursor-pointer hover:bg-surface"
            )}
          >
            <Checkbox checked={checked} disabled={disabled} onCheckedChange={(v) => onToggle(m.id, v === true)} />
            <span className="min-w-0 truncate">{m.name}</span>
            {m.unit && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{m.unit}</span>}
          </label>
        );
      })}
    </div>
  );
}

type PickerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metrics: MetricDef[];
  selectedIds: string[];
  defaultIds: string[];
  saving: boolean;
  onSave: (ids: string[]) => Promise<KpiSaveOutcome>;
};

function KpiPickerDialog({ open, onOpenChange, metrics, selectedIds, defaultIds, saving, onSave }: PickerProps) {
  const [draft, setDraft] = useState<string[]>(selectedIds);
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Cada vez que se abre, el borrador arranca de lo guardado: cancelar no deja
  // cambios a medio hacer.
  useEffect(() => {
    if (open) {
      setDraft(selectedIds);
      setQuery("");
      setError(null);
    }
  }, [open, selectedIds]);

  const handleSave = async () => {
    setError(null);
    // Mismo orden que Métricas: los estándar en orden canónico, los propios después.
    const outcome = await onSave(orderKpiIds(draft, defaultIds));
    if (outcome.ok === true) {
      onOpenChange(false);
      return;
    }
    const { invalidIds, message } = outcome;
    if (invalidIds.length > 0) {
      // Las métricas que ya no existen salen del borrador; el usuario revisa y
      // guarda de nuevo, nunca se guarda una selección distinta a la que vio.
      const names = invalidIds.map((id) => metrics.find((m) => m.id === id)?.name ?? "una métrica sin nombre");
      setDraft((prev) => prev.filter((id) => !invalidIds.includes(id)));
      setError(`Estas métricas ya no existen o están archivadas, así que las quitamos de la selección: ${names.join(", ")}. Revisá y guardá de nuevo.`);
      return;
    }
    setError(message);
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return metrics.filter((m) => !q || m.name.toLowerCase().includes(q));
  }, [metrics, query]);
  const standard = filtered.filter((m) => m.metric_class === "standard");
  const custom = filtered.filter((m) => m.metric_class !== "standard");
  const full = draft.length >= DASHBOARD_KPI_MAX;

  const toggle = (id: string, checked: boolean) => {
    setDraft((prev) => {
      if (checked) return prev.includes(id) || prev.length >= DASHBOARD_KPI_MAX ? prev : [...prev, id];
      return prev.filter((x) => x !== id);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Elegí los KPIs de tu startup</DialogTitle>
          <DialogDescription>
            Podés mostrar hasta {DASHBOARD_KPI_MAX}. La selección es de tu startup: la ven todos los miembros del equipo.
          </DialogDescription>
        </DialogHeader>
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar métrica" aria-label="Buscar métrica" />
        <p className="text-xs text-muted-foreground">
          Elegiste {draft.length} de {DASHBOARD_KPI_MAX}.
        </p>
        <p aria-live="polite" className="text-sm text-destructive-dark empty:hidden">
          {error}
        </p>
        <div className="max-h-[50vh] overflow-y-auto pr-1">
          <KpiOptionGroup title="Estándar" list={standard} draft={draft} full={full} onToggle={toggle} />
          <KpiOptionGroup title="Propias" list={custom} draft={draft} full={full} onToggle={toggle} />
          {filtered.length === 0 && (
            <p className="py-6 text-center text-sm text-muted-foreground">Ninguna métrica coincide con la búsqueda.</p>
          )}
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-between">
          <Button variant="ghost" onClick={() => setDraft(defaultIds)}>
            Restablecer
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={draft.length === 0 || saving}>
              {saving ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function CompanyHealthStrip({ metrics, selectedIds, values, loading, monthLabel, saving, onChangeSelected }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const byId = useMemo(() => new Map(metrics.map((m) => [m.id, m])), [metrics]);
  const tiles = selectedIds.map((id) => byId.get(id)).filter((m): m is MetricDef => m !== undefined);
  const defaultIds = useMemo(() => defaultDashboardKpiIds(metrics), [metrics]);

  return (
    <SectionCard
      padding="sm"
      title={
        <span className="flex items-center gap-2">
          <SectionNum n={1} />
          Cómo estamos
        </span>
      }
      action={
        <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
          <Settings2 size={12} className="mr-1.5" aria-hidden="true" />
          KPIs ({tiles.length}/{DASHBOARD_KPI_MAX})
        </Button>
      }
    >
      {loading ? (
        <div aria-live="polite">
          <span className="sr-only">Cargando KPIs…</span>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="border border-dashed border-border rounded-lg h-28 animate-pulse bg-surface/50" />
            ))}
          </div>
        </div>
      ) : tiles.length === 0 ? (
        <EmptyState
          bordered={false}
          icon={Settings2}
          title="Todavía no elegiste KPIs para esta startup."
          description="Elegí las métricas que querés ver de un vistazo. Podés usar las estándar o las que creaste."
          action={{ label: "Elegir KPIs", onClick: () => setPickerOpen(true) }}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tiles.map((m) => (
            <KpiTile key={m.id} metric={m} series={values[m.id] ?? {}} monthLabel={monthLabel} />
          ))}
        </div>
      )}
      <KpiPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        metrics={metrics}
        selectedIds={selectedIds}
        defaultIds={defaultIds}
        saving={saving}
        onSave={onChangeSelected}
      />
    </SectionCard>
  );
}
