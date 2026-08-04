import { useMemo, useState } from "react";
import { DollarSign, Hash, Percent, Plus, Search as SearchIcon } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { DataTableToolbar } from "@/components/DataTableToolbar";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { sourceLabel, type MetricDef } from "@/lib/metrics";

const TYPE_LABELS: Record<MetricDef["metric_type"], string> = {
  input: "Input",
  calculated: "Calculada",
};

function valueTypeIcon(valueType: MetricDef["value_type"]) {
  if (valueType === "money") return DollarSign;
  if (valueType === "percentage") return Percent;
  return Hash;
}

type Props = {
  metrics: MetricDef[];
  categories: { id: string; label: string }[];
  onSelect: (m: MetricDef) => void;
  onCreateNew: () => void;
};

// La vista de lista del editor estilo AppSheet: buscar/filtrar, click en una
// fila abre el panel de esa métrica (MetricPropertyPanel, renderizado por el
// caller). Los mismos datos que ya lee list-metrics en modo "data" — esto es
// una forma nueva de navegarlos, no una superficie de datos nueva.
export function MetricsManager({ metrics, categories, onSelect, onCreateNew }: Props) {
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [originFilter, setOriginFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const origins = useMemo(() => {
    const set = new Set<string>();
    for (const m of metrics) {
      if (m.metric_type === "input") set.add(m.source && m.source !== "manual_form" ? m.source : "manual_form");
    }
    return Array.from(set);
  }, [metrics]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return metrics.filter((m) => {
      if (q && !m.name.toLowerCase().includes(q) && !(m.input_key ?? "").toLowerCase().includes(q)) return false;
      if (typeFilter !== "all" && m.metric_type !== typeFilter) return false;
      if (originFilter !== "all") {
        const origin = m.metric_type === "input" ? (m.source && m.source !== "manual_form" ? m.source : "manual_form") : null;
        if (origin !== originFilter) return false;
      }
      if (categoryFilter !== "all" && m.category !== categoryFilter) return false;
      return true;
    });
  }, [metrics, search, typeFilter, originFilter, categoryFilter]);

  const columns: DataTableColumn<MetricDef>[] = [
    {
      header: "Nombre",
      cell: (m) => {
        const Icon = valueTypeIcon(m.value_type);
        return (
          <span className="flex items-center gap-2 min-w-0">
            <Icon size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
            <span className="truncate">{m.name}</span>
          </span>
        );
      },
    },
    { header: "Unidad", cell: (m) => <span className="text-muted-foreground">{m.unit || "—"}</span> },
    { header: "Tipo", cell: (m) => TYPE_LABELS[m.metric_type] },
    {
      header: "Origen",
      cell: (m) => (m.metric_type === "calculated" ? <span className="text-muted-foreground">—</span> : sourceLabel(m.source) ?? "Manual"),
    },
    {
      header: "Categoría",
      cell: (m) => <span className="text-muted-foreground">{categories.find((c) => c.id === m.category)?.label ?? m.category}</span>,
    },
  ];

  return (
    <div>
      <DataTableToolbar
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Buscar métrica…"
        filters={
          <>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="input">Input</SelectItem>
                <SelectItem value="calculated">Calculada</SelectItem>
              </SelectContent>
            </Select>
            <Select value={originFilter} onValueChange={setOriginFilter}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los orígenes</SelectItem>
                {origins.map((o) => (
                  <SelectItem key={o} value={o}>
                    {o === "manual_form" ? "Manual" : (sourceLabel(o) ?? o)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="h-9 w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        }
        actions={
          <Button onClick={onCreateNew}>
            <Plus size={14} className="mr-1.5" /> Agregar métrica
          </Button>
        }
      />

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(m) => m.id}
        onRowClick={onSelect}
        emptyLabel={
          metrics.length === 0 ? (
            <EmptyState bordered={false} title="Todavía no hay métricas." />
          ) : (
            <EmptyState
              bordered={false}
              icon={SearchIcon}
              title="Ninguna métrica coincide con la búsqueda o los filtros."
            />
          )
        }
      />
    </div>
  );
}
