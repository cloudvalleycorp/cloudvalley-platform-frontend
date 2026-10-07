import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DASHBOARD_KPI_MAX, orderKpiIds, type KpiSaveOutcome } from "@/lib/dashboardKpis";
import type { MetricDef } from "@/lib/metrics";
import { cn } from "@/lib/utils";

// Selector de KPIs compartido por el Dashboard ("Cómo estamos") y Métricas >
// Overview ("KPIs principales") — misma preferencia de backend, mismo picker:
// estándar y propias, buscador, tope de DASHBOARD_KPI_MAX. Antes Overview
// tenía su propio dropdown limitado a los 8 KPIs estándar (sin poder elegir
// métricas propias como el Dashboard sí permite) — inconsistencia real
// encontrada en vivo 2026-10-07, se unifica acá.

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

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  metrics: MetricDef[];
  selectedIds: string[];
  defaultIds: string[];
  saving: boolean;
  onSave: (ids: string[]) => Promise<KpiSaveOutcome>;
};

export function KpiPickerDialog({ open, onOpenChange, metrics, selectedIds, defaultIds, saving, onSave }: Props) {
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
    // Mismo orden en los 2 lugares: los estándar en orden canónico, los propios después.
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
