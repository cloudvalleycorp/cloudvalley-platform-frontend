import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { StageBadge } from "@/components/StageBadge";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LineChart, Line, ResponsiveContainer } from "recharts";
import {
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Filter,
  Info,
  Bell,
  LogOut,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { evalFormula, formatMetricValue, requiredInputs, type InputsMap, type MetricDef } from "@/lib/metrics";
import { MetricInfoSheet, type MetricHistoryPoint } from "@/components/metrics/MetricInfoSheet";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Check, X as XIcon } from "lucide-react";

type Org = { id: string; name: string };

type ConnReq = {
  id: string;
  startup_id: string;
  organization_id: string;
  status: string;
  message: string | null;
  created_at: string;
  startup?: { name: string; stage: string | null; business_model: string | null; industry: string | null; readiness_score: number };
};

type StartupRow = {
  id: string;
  name: string;
  stage: string | null;
  business_model: string | null;
  industry: string | null;
  readiness_score: number;
  batch: string | null;
  year: number | null;
  organization_id: string;
  updated_at: string | null;
};

type SortKey =
  | "name"
  | "stage"
  | "business_model"
  | "batch"
  | "year"
  | "readiness_score"
  | "updated_at"
  | string; // metric_id

const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function fmtRel(date: string | null): string {
  if (!date) return "—";
  const d = new Date(date);
  const diffMs = Date.now() - d.getTime();
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (days < 1) return "hoy";
  if (days < 2) return "ayer";
  if (days < 30) return `hace ${days}d`;
  if (days < 365) return `hace ${Math.floor(days / 30)}m`;
  return `hace ${Math.floor(days / 365)}a`;
}

export default function Portfolio() {
  const { user, loading, isOrgViewer, signOut } = useAuth();
  const navigate = useNavigate();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [rows, setRows] = useState<StartupRow[]>([]);
  const [fetched, setFetched] = useState(false);
  const [tab, setTab] = useState<"portfolio" | "requests">("portfolio");
  const [connReqs, setConnReqs] = useState<ConnReq[]>([]);

  // Filters
  const [yearFilter, setYearFilter] = useState<Set<number>>(new Set());
  const [batchFilter, setBatchFilter] = useState<Set<string>>(new Set());
  const [metricCols, setMetricCols] = useState<MetricDef[]>([]); // selected metric columns

  // Catalog
  const [allMetrics, setAllMetrics] = useState<MetricDef[]>([]);
  // metricValues[metric_id][startup_id] = { value, period_year, period_month, isPrivate }
  const [metricValues, setMetricValues] = useState<
    Record<string, Record<string, { value: number; year: number; month: number }>>
  >({});
  const [privateMatrix, setPrivateMatrix] = useState<
    Record<string, Set<string>> // metric_id -> set of startup_ids that marked it private
  >({});

  // Sorting
  const [sort, setSort] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "name",
    dir: "asc",
  });

  useEffect(() => {
    if (!user || !isOrgViewer) return;
    (async () => {
      const { data: memberships } = await supabase
        .from("organization_members")
        .select("organization_id, organizations(id, name)")
        .eq("user_id", user.id);

      const myOrgs: Org[] = (memberships ?? [])
        .map((m: any) => m.organizations)
        .filter(Boolean);
      setOrgs(myOrgs);

      // Get all startup_organizations links + nested startup data
      const { data: links } = await supabase
        .from("startup_organizations")
        .select("organization_id, batch, year, startups(id, name, stage, business_model, industry, readiness_score, updated_at)")
        .in("organization_id", myOrgs.map((o) => o.id));

      const flat: StartupRow[] = (links ?? []).map((l: any) => ({
        id: l.startups.id,
        name: l.startups.name,
        stage: l.startups.stage,
        business_model: l.startups.business_model,
        industry: l.startups.industry,
        readiness_score: l.startups.readiness_score,
        batch: l.batch,
        year: l.year,
        organization_id: l.organization_id,
        updated_at: l.startups.updated_at,
      }));
      setRows(flat);

      // Fetch metric definitions catalog
      const { data: defs } = await supabase
        .from("metric_definitions")
        .select("*")
        .order("order_index");
      setAllMetrics((defs ?? []) as MetricDef[]);

      setFetched(true);

      // Fetch pending connection requests for these orgs
      const { data: reqs } = await supabase
        .from("connection_requests")
        .select("id, startup_id, organization_id, status, message, created_at, startups(name, stage, business_model, industry, readiness_score)")
        .in("organization_id", myOrgs.map((o) => o.id))
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      setConnReqs(((reqs ?? []) as any[]).map((r) => ({ ...r, startup: r.startups })));
    })();
  }, [user, isOrgViewer]);

  const refetchRequests = async () => {
    const orgIds = orgs.map((o) => o.id);
    if (orgIds.length === 0) return;
    const { data: reqs } = await supabase
      .from("connection_requests")
      .select("id, startup_id, organization_id, status, message, created_at, startups(name, stage, business_model, industry, readiness_score)")
      .in("organization_id", orgIds)
      .eq("status", "pending")
      .order("created_at", { ascending: false });
    setConnReqs(((reqs ?? []) as any[]).map((r) => ({ ...r, startup: r.startups })));
  };

  const acceptRequest = async (req: ConnReq, batch: string, year: number | null) => {
    if (!user) return;
    // TODO: migrar a backend propio
    const { error: linkErr } = await supabase.from("startup_organizations").insert({
      startup_id: req.startup_id,
      organization_id: req.organization_id,
      batch: batch || null,
      year: year ?? null,
    });
    if (linkErr) {
      toast.error("No se pudo aceptar la solicitud");
      return;
    }
    const { error } = await supabase
      .from("connection_requests")
      .update({ status: "accepted", responded_by: user.id, responded_at: new Date().toISOString(), batch: batch || null, year: year ?? null })
      .eq("id", req.id);
    if (error) {
      toast.error("Solicitud aceptada pero hubo un error al actualizar el estado");
    } else {
      toast.success(`${req.startup?.name} agregada al portfolio`);
    }
    refetchRequests();
    // also reload portfolio rows
    const { data: links } = await supabase
      .from("startup_organizations")
      .select("organization_id, batch, year, startups(id, name, stage, business_model, industry, readiness_score, updated_at)")
      .in("organization_id", orgs.map((o) => o.id));
    setRows((links ?? []).map((l: any) => ({
      id: l.startups.id,
      name: l.startups.name,
      stage: l.startups.stage,
      business_model: l.startups.business_model,
      industry: l.startups.industry,
      readiness_score: l.startups.readiness_score,
      batch: l.batch,
      year: l.year,
      organization_id: l.organization_id,
      updated_at: l.startups.updated_at,
    })));
  };

  const rejectRequest = async (req: ConnReq) => {
    if (!user) return;
    const { error } = await supabase
      .from("connection_requests")
      .update({ status: "rejected", responded_by: user.id, responded_at: new Date().toISOString() })
      .eq("id", req.id);
    if (error) {
      toast.error("No se pudo rechazar");
      return;
    }
    toast.success("Solicitud rechazada");
    refetchRequests();
  };

  // Whenever metricCols change, fetch latest entry per startup for each selected metric
  useEffect(() => {
    if (rows.length === 0 || metricCols.length === 0) {
      setMetricValues({});
      setPrivateMatrix({});
      return;
    }
    (async () => {
      const startupIds = rows.map((r) => r.id);
      const metricIds = metricCols.map((m) => m.id);

      // Fetch privacy rows (only public-marked-as-false matters here; defaults are public)
      const { data: priv } = await supabase
        .from("metric_privacy")
        .select("metric_id, startup_id, is_public")
        .in("startup_id", startupIds)
        .in("metric_id", metricIds)
        .eq("is_public", false);
      const privMap: Record<string, Set<string>> = {};
      for (const p of priv ?? []) {
        privMap[p.metric_id] ??= new Set();
        privMap[p.metric_id].add(p.startup_id);
      }
      setPrivateMatrix(privMap);

      // Fetch entries (RLS will already hide private ones for org_viewer)
      const { data: ents } = await supabase
        .from("metric_entries")
        .select("metric_id, startup_id, value, period_year, period_month")
        .in("startup_id", startupIds)
        .in("metric_id", metricIds);
      const valMap: Record<string, Record<string, { value: number; year: number; month: number }>> = {};
      for (const e of ents ?? []) {
        if (e.value === null || e.value === undefined) continue;
        const key = e.period_year * 100 + e.period_month;
        valMap[e.metric_id] ??= {};
        const existing = valMap[e.metric_id][e.startup_id];
        const existingKey = existing ? existing.year * 100 + existing.month : -1;
        if (key > existingKey) {
          valMap[e.metric_id][e.startup_id] = {
            value: Number(e.value),
            year: e.period_year,
            month: e.period_month,
          };
        }
      }
      setMetricValues(valMap);
    })();
  }, [metricCols, rows]);

  const yearOptions = useMemo(() => {
    const ys = new Set<number>();
    for (const r of rows) if (r.year) ys.add(r.year);
    return Array.from(ys).sort((a, b) => b - a);
  }, [rows]);

  const batchOptions = useMemo(() => {
    const bs = new Set<string>();
    for (const r of rows) if (r.batch) bs.add(r.batch);
    return Array.from(bs).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (yearFilter.size > 0 && (!r.year || !yearFilter.has(r.year))) return false;
      if (batchFilter.size > 0 && (!r.batch || !batchFilter.has(r.batch))) return false;
      return true;
    });
  }, [rows, yearFilter, batchFilter]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const dir = sort.dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      let av: any;
      let bv: any;
      if (
        sort.key === "name" ||
        sort.key === "stage" ||
        sort.key === "business_model" ||
        sort.key === "batch"
      ) {
        av = (a as any)[sort.key] ?? "";
        bv = (b as any)[sort.key] ?? "";
        return av.toString().localeCompare(bv.toString()) * dir;
      }
      if (sort.key === "year" || sort.key === "readiness_score") {
        av = (a as any)[sort.key] ?? -Infinity;
        bv = (b as any)[sort.key] ?? -Infinity;
        return (av - bv) * dir;
      }
      if (sort.key === "updated_at") {
        av = a.updated_at ? new Date(a.updated_at).getTime() : 0;
        bv = b.updated_at ? new Date(b.updated_at).getTime() : 0;
        return (av - bv) * dir;
      }
      // metric column
      av = metricValues[sort.key]?.[a.id]?.value ?? -Infinity;
      bv = metricValues[sort.key]?.[b.id]?.value ?? -Infinity;
      return (av - bv) * dir;
    });
    return arr;
  }, [filtered, sort, metricValues]);

  const toggleSort = (key: SortKey) => {
    setSort((s) =>
      s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }
    );
  };

  const clearFilters = () => {
    setYearFilter(new Set());
    setBatchFilter(new Set());
    setMetricCols([]);
  };

  const hasFilters = yearFilter.size > 0 || batchFilter.size > 0 || metricCols.length > 0;

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isOrgViewer) return <Navigate to="/dashboard" replace />;

  const orgNames = orgs.map((o) => o.name).join(" · ") || "Tu organización";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-medium tracking-tight">CloudValley</span>
            <span className="text-tertiary">·</span>
            <span className="text-sm text-muted-foreground">{orgNames}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <button
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground transition-all duration-150 p-1"
              title="Cerrar sesión"
            >
              <LogOut size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-medium tracking-tight mb-2">Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} startup{rows.length === 1 ? "" : "s"} vinculadas
          </p>
        </div>

        <div className="flex gap-1 border-b border-border">
          {[
            { id: "portfolio" as const, label: "Portfolio" },
            { id: "requests" as const, label: `Solicitudes${connReqs.length ? ` (${connReqs.length})` : ""}` },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={cn(
                "px-3 py-2 text-sm transition-all border-b-2 -mb-px",
                tab === t.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "requests" ? (
          <RequestsList requests={connReqs} orgs={orgs} onAccept={acceptRequest} onReject={rejectRequest} />
        ) : (
        <>
        {/* Filters bar */}
        <div className="flex flex-wrap items-center gap-2">
          <MultiSelectPopover
            label="Año"
            options={yearOptions.map((y) => ({ value: y.toString(), label: y.toString() }))}
            selected={new Set(Array.from(yearFilter).map(String))}
            onToggle={(v) => {
              const next = new Set(yearFilter);
              const num = Number(v);
              if (next.has(num)) next.delete(num);
              else next.add(num);
              setYearFilter(next);
            }}
          />
          <MultiSelectPopover
            label="Batch"
            options={batchOptions.map((b) => ({ value: b, label: b }))}
            selected={batchFilter}
            onToggle={(v) => {
              const next = new Set(batchFilter);
              if (next.has(v)) next.delete(v);
              else next.add(v);
              setBatchFilter(next);
            }}
          />
          <MultiSelectPopover
            label="Métrica"
            options={allMetrics.map((m) => ({ value: m.id, label: m.name }))}
            selected={new Set(metricCols.map((m) => m.id))}
            onToggle={(v) => {
              const exists = metricCols.find((m) => m.id === v);
              if (exists) setMetricCols(metricCols.filter((m) => m.id !== v));
              else {
                const def = allMetrics.find((m) => m.id === v);
                if (def) setMetricCols([...metricCols, def]);
              }
            }}
          />
          {hasFilters && (
            <button
              onClick={clearFilters}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-all px-2 py-1.5"
            >
              <X size={12} strokeWidth={1.5} /> Limpiar filtros
            </button>
          )}
        </div>

        {/* Table */}
        <div className="border border-border rounded-lg bg-card overflow-hidden">
          {!fetched ? (
            <div className="p-8 text-center text-sm text-muted-foreground">Cargando…</div>
          ) : sorted.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">
              {rows.length === 0
                ? "Todavía no hay startups vinculadas a tus organizaciones."
                : "No hay resultados con los filtros actuales."}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-muted-foreground border-b border-border">
                    <SortableHead label="Startup" sortKey="name" sort={sort} onClick={toggleSort} />
                    <SortableHead label="Etapa" sortKey="stage" sort={sort} onClick={toggleSort} />
                    <SortableHead label="Modelo" sortKey="business_model" sort={sort} onClick={toggleSort} />
                    <SortableHead label="Batch" sortKey="batch" sort={sort} onClick={toggleSort} />
                    <SortableHead label="Año" sortKey="year" sort={sort} onClick={toggleSort} />
                    <SortableHead
                      label="Readiness"
                      sortKey="readiness_score"
                      sort={sort}
                      onClick={toggleSort}
                      align="right"
                    />
                    <SortableHead
                      label="Última actividad"
                      sortKey="updated_at"
                      sort={sort}
                      onClick={toggleSort}
                    />
                    {metricCols.map((m) => (
                      <SortableHead
                        key={m.id}
                        label={m.name}
                        sortKey={m.id}
                        sort={sort}
                        onClick={toggleSort}
                        align="right"
                      />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((s) => (
                    <tr
                      key={`${s.id}-${s.organization_id}`}
                      onClick={() => navigate(`/portfolio/${s.organization_id}/${s.id}`)}
                      className="border-b border-border/50 last:border-0 hover:bg-surface transition-all duration-150 cursor-pointer"
                    >
                      <td className="px-5 py-4 font-medium">{s.name}</td>
                      <td className="px-5 py-4">
                        <StageBadge stage={s.stage} />
                      </td>
                      <td className="px-5 py-4 text-muted-foreground capitalize">
                        {s.business_model?.replace("_", " ") ?? "—"}
                      </td>
                      <td className="px-5 py-4 text-muted-foreground">{s.batch ?? "—"}</td>
                      <td className="px-5 py-4 text-muted-foreground tabular-nums">
                        {s.year ?? "—"}
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums">{s.readiness_score}</td>
                      <td className="px-5 py-4 text-muted-foreground">{fmtRel(s.updated_at)}</td>
                      {metricCols.map((m) => {
                        const isPrivate = privateMatrix[m.id]?.has(s.id) ?? false;
                        const cell = metricValues[m.id]?.[s.id];
                        return (
                          <td key={m.id} className="px-5 py-4 text-right tabular-nums">
                            {isPrivate ? (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span className="text-tertiary cursor-help">—</span>
                                </TooltipTrigger>
                                <TooltipContent className="text-xs">
                                  La startup mantiene esta métrica privada
                                </TooltipContent>
                              </Tooltip>
                            ) : cell ? (
                              formatMetricValue(cell.value, m.unit)
                            ) : (
                              <span className="text-tertiary">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        </>
        )}
      </main>

    </div>
  );
}

function RequestsList({
  requests,
  orgs,
  onAccept,
  onReject,
}: {
  requests: ConnReq[];
  orgs: Org[];
  onAccept: (r: ConnReq, batch: string, year: number | null) => Promise<void>;
  onReject: (r: ConnReq) => Promise<void>;
}) {
  if (requests.length === 0) {
    return (
      <div className="border border-border rounded-lg bg-card p-8 text-center text-sm text-muted-foreground">
        No tenés solicitudes pendientes.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {requests.map((r) => (
        <RequestRow key={r.id} req={r} orgs={orgs} onAccept={onAccept} onReject={onReject} />
      ))}
    </div>
  );
}

function RequestRow({
  req,
  orgs,
  onAccept,
  onReject,
}: {
  req: ConnReq;
  orgs: Org[];
  onAccept: (r: ConnReq, batch: string, year: number | null) => Promise<void>;
  onReject: (r: ConnReq) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [batch, setBatch] = useState("");
  const [year, setYear] = useState<string>(new Date().getFullYear().toString());
  const [busy, setBusy] = useState(false);

  const orgName = orgs.find((o) => o.id === req.organization_id)?.name ?? "—";

  return (
    <div className="border border-border rounded-lg bg-card p-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{req.startup?.name ?? "—"}</span>
            <StageBadge stage={req.startup?.stage ?? null} />
            <span className="text-xs text-muted-foreground capitalize">
              {req.startup?.business_model?.replace("_", " ") ?? "—"}
              {req.startup?.industry ? ` · ${req.startup.industry}` : ""}
            </span>
          </div>
          <div className="text-xs text-tertiary mt-1">
            Para {orgName} · Readiness {req.startup?.readiness_score ?? 0} · {new Date(req.created_at).toLocaleDateString()}
          </div>
          {req.message && <p className="text-sm text-muted-foreground mt-2">{req.message}</p>}
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button size="sm">
                <Check size={14} strokeWidth={1.5} /> Aceptar
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-72">
              <div className="space-y-3">
                <div>
                  <label className="text-xs text-muted-foreground">Batch / Cohort</label>
                  <Input
                    value={batch}
                    onChange={(e) => setBatch(e.target.value)}
                    placeholder="ej: Batch 3"
                    className="mt-1 h-9"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Año</label>
                  <Input
                    type="number"
                    value={year}
                    onChange={(e) => setYear(e.target.value)}
                    className="mt-1 h-9"
                  />
                </div>
                <Button
                  className="w-full"
                  size="sm"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    await onAccept(req, batch.trim(), year ? Number(year) : null);
                    setBusy(false);
                    setOpen(false);
                  }}
                >
                  {busy ? "Aceptando…" : "Confirmar"}
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <Button size="sm" variant="ghost" onClick={() => onReject(req)}>
            <XIcon size={14} strokeWidth={1.5} /> Rechazar
          </Button>
        </div>
      </div>
    </div>
  );
}

function SortableHead({
  label,
  sortKey,
  sort,
  onClick,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; dir: "asc" | "desc" };
  onClick: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  return (
    <th
      className={cn(
        "font-normal px-5 py-3 whitespace-nowrap select-none",
        align === "right" ? "text-right" : "text-left"
      )}
    >
      <button
        onClick={() => onClick(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-all",
          active && "text-foreground"
        )}
      >
        {label}
        {active ? (
          sort.dir === "asc" ? (
            <ArrowUp size={11} strokeWidth={1.5} />
          ) : (
            <ArrowDown size={11} strokeWidth={1.5} />
          )
        ) : (
          <ChevronsUpDown size={11} strokeWidth={1.5} className="opacity-40" />
        )}
      </button>
    </th>
  );
}

function MultiSelectPopover({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: { value: string; label: string }[];
  selected: Set<string>;
  onToggle: (v: string) => void;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "inline-flex items-center gap-2 px-3 py-1.5 text-xs border border-border rounded-md bg-background hover:bg-surface transition-all",
            selected.size > 0 && "border-foreground"
          )}
        >
          <Filter size={12} strokeWidth={1.5} />
          {label}
          {selected.size > 0 && (
            <span className="bg-foreground text-background rounded-full px-1.5 py-px text-[10px] tabular-nums">
              {selected.size}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56 p-1">
        {options.length === 0 ? (
          <div className="px-3 py-2 text-xs text-muted-foreground">Sin opciones</div>
        ) : (
          <ul className="max-h-72 overflow-auto">
            {options.map((o) => {
              const isOn = selected.has(o.value);
              return (
                <li key={o.value}>
                  <button
                    onClick={() => onToggle(o.value)}
                    className="w-full text-left flex items-center gap-2 px-2 py-1.5 text-sm rounded-sm hover:bg-surface transition-all"
                  >
                    <span
                      className={cn(
                        "h-3 w-3 rounded-sm border border-border flex items-center justify-center",
                        isOn && "bg-foreground border-foreground"
                      )}
                    >
                      {isOn && <span className="h-1.5 w-1.5 rounded-sm bg-background" />}
                    </span>
                    {o.label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}

/* -------------------- Drawer -------------------- */

type DrawerTab = "metrics" | "roadmap" | "dataroom";

const drawerCategories = [
  { id: "revenue", label: "Revenue" },
  { id: "acquisition", label: "Acquisition" },
  { id: "retention", label: "Retention" },
  { id: "cash_efficiency", label: "Cash & Efficiency" },
];
const monthShort = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
const dpKey = (m: number, y: number) => `${y}-${m}`;
const dpPrev = (m: number, y: number) => (m === 1 ? { m: 12, y: y - 1 } : { m: m - 1, y });

function StartupDrawer({
  startup,
  onClose,
  allMetrics,
}: {
  startup: StartupRow | null;
  onClose: () => void;
  allMetrics: MetricDef[];
}) {
  const [tab, setTab] = useState<DrawerTab>("metrics");
  const [activeCat, setActiveCat] = useState<string>("revenue");

  // entries: metric_id -> "y-m" -> value (only public ones, RLS filtered)
  const [entries, setEntries] = useState<Record<string, Record<string, number>>>({});
  // active metric configs for this startup
  const [activeMetricIds, setActiveMetricIds] = useState<Set<string>>(new Set());
  const [openInfo, setOpenInfo] = useState<MetricDef | null>(null);

  // roadmap
  const [pillars, setPillars] = useState<
    { id: string; name: string; total: number; done: number }[]
  >([]);

  // documents
  const [docs, setDocs] = useState<
    { id: string; name: string; category: string; status: string; file_url: string | null }[]
  >([]);
  const [requestedDocIds, setRequestedDocIds] = useState<Set<string>>(new Set());
  const [requestingDoc, setRequestingDoc] = useState<string | null>(null);
  const [requestMsg, setRequestMsg] = useState("");

  useEffect(() => {
    if (!startup) return;
    setTab("metrics");
    setActiveCat("revenue");
    setOpenInfo(null);
    setRequestingDoc(null);
    setRequestMsg("");
    (async () => {
      // Active metrics for this startup
      const { data: cfgs } = await supabase
        .from("metric_configs")
        .select("metric_id")
        .eq("startup_id", startup.id)
        .eq("is_active", true);
      setActiveMetricIds(new Set((cfgs ?? []).map((c: any) => c.metric_id)));

      // Fetch all metric_entries for this startup that we can see (RLS filters private ones)
      const { data: ents } = await supabase
        .from("metric_entries")
        .select("metric_id, value, period_year, period_month")
        .eq("startup_id", startup.id);
      const map: Record<string, Record<string, number>> = {};
      for (const e of ents ?? []) {
        if (e.value === null || e.value === undefined) continue;
        map[e.metric_id] ??= {};
        map[e.metric_id][dpKey(e.period_month, e.period_year)] = Number(e.value);
      }
      setEntries(map);

      // Roadmap progress per pillar
      const { data: pillarsData } = await supabase
        .from("roadmap_pillars")
        .select("id, name")
        .order("order_index");
      const { data: tasksData } = await supabase
        .from("roadmap_tasks")
        .select("id, pillar_id");
      const { data: stData } = await supabase
        .from("startup_tasks")
        .select("task_id, status")
        .eq("startup_id", startup.id);

      const taskPillar: Record<string, string> = {};
      for (const t of tasksData ?? []) taskPillar[t.id] = t.pillar_id;
      const pillarTotals: Record<string, { total: number; done: number }> = {};
      for (const p of pillarsData ?? []) pillarTotals[p.id] = { total: 0, done: 0 };
      for (const st of stData ?? []) {
        const pid = taskPillar[st.task_id];
        if (!pid || !pillarTotals[pid]) continue;
        pillarTotals[pid].total += 1;
        if (st.status === "done") pillarTotals[pid].done += 1;
      }
      setPillars(
        (pillarsData ?? []).map((p: any) => ({
          id: p.id,
          name: p.name,
          total: pillarTotals[p.id]?.total ?? 0,
          done: pillarTotals[p.id]?.done ?? 0,
        }))
      );

      // Docs (RLS filters private)
      const { data: docsData } = await supabase
        .from("documents")
        .select("id, name, category, status, file_url")
        .eq("startup_id", startup.id);
      setDocs((docsData ?? []) as any);

      // Requests this org already made for this startup (any user in org)
      const { data: reqs } = await supabase
        .from("document_requests")
        .select("document_id, status")
        .eq("startup_id", startup.id)
        .eq("organization_id", startup.organization_id)
        .eq("status", "pending");
      setRequestedDocIds(new Set((reqs ?? []).map((r: any) => r.document_id)));
    })();
  }, [startup, allMetrics]);

  // Derived: active metric defs visible to this org viewer
  const visibleMetrics = useMemo(
    () => allMetrics.filter((m) => activeMetricIds.has(m.id)),
    [allMetrics, activeMetricIds]
  );
  const inputDefsAll = useMemo(
    () => visibleMetrics.filter((m) => m.metric_type === "input"),
    [visibleMetrics]
  );
  const inputDefsCat = useMemo(
    () => inputDefsAll.filter((m) => m.category === activeCat),
    [inputDefsAll, activeCat]
  );
  const calcDefsCat = useMemo(
    () => visibleMetrics.filter((m) => m.metric_type === "calculated" && m.category === activeCat),
    [visibleMetrics, activeCat]
  );

  // Period: latest period across any entry
  const latestPeriod = useMemo(() => {
    let best = { m: new Date().getMonth() + 1, y: new Date().getFullYear(), key: -1 };
    for (const mid of Object.keys(entries)) {
      for (const k of Object.keys(entries[mid])) {
        const [y, mo] = k.split("-").map(Number);
        const score = y * 100 + mo;
        if (score > best.key) best = { m: mo, y, key: score };
      }
    }
    return best.key === -1 ? { m: best.m, y: best.y } : { m: best.m, y: best.y };
  }, [entries]);

  const inputsForPeriod = (m: number, y: number): InputsMap => {
    const result: InputsMap = {};
    const pk = dpKey(m, y);
    for (const def of inputDefsAll) {
      if (!def.input_key) continue;
      const v = entries[def.id]?.[pk];
      if (v !== undefined) result[def.input_key] = v;
    }
    return result;
  };

  const currentInputs = inputsForPeriod(latestPeriod.m, latestPeriod.y);
  const prev = dpPrev(latestPeriod.m, latestPeriod.y);
  const prevInputs = inputsForPeriod(prev.m, prev.y);

  const sparkFor = (def: MetricDef): { v: number }[] => {
    const arr: { v: number }[] = [];
    let m = latestPeriod.m, y = latestPeriod.y;
    for (let i = 0; i < 6; i++) {
      let v: number | null = null;
      if (def.metric_type === "input" && def.input_key) {
        const raw = entries[def.id]?.[dpKey(m, y)];
        if (raw !== undefined) v = raw;
      } else if (def.formula_expression) {
        v = evalFormula(def.formula_expression, inputsForPeriod(m, y));
      }
      arr.unshift({ v: v ?? 0 });
      const p = dpPrev(m, y);
      m = p.m; y = p.y;
    }
    return arr;
  };

  // History for the open info sheet
  const infoHistory = useMemo<MetricHistoryPoint[]>(() => {
    if (!openInfo) return [];
    const out: MetricHistoryPoint[] = [];
    let m = latestPeriod.m, y = latestPeriod.y;
    for (let i = 0; i < 12; i++) {
      let v: number | null = null;
      if (openInfo.metric_type === "input" && openInfo.input_key) {
        const raw = entries[openInfo.id]?.[dpKey(m, y)];
        if (raw !== undefined) v = raw;
      } else if (openInfo.formula_expression) {
        v = evalFormula(openInfo.formula_expression, inputsForPeriod(m, y));
      }
      if (v !== null && v !== undefined) out.unshift({ year: y, month: m, value: v });
      const p = dpPrev(m, y);
      m = p.m; y = p.y;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openInfo, entries, inputDefsAll, latestPeriod]);

  const requestUpdate = async (doc: { id: string; name: string }) => {
    if (!startup) return;
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    // TODO: migrar a backend propio
    const { error } = await supabase.from("document_requests").insert({
      startup_id: startup.id,
      document_id: doc.id,
      organization_id: startup.organization_id,
      requested_by: u.user.id,
      message: requestMsg || null,
    });
    if (error) {
      toast.error("No se pudo enviar el pedido");
      return;
    }
    setRequestedDocIds((s) => new Set([...s, doc.id]));
    setRequestingDoc(null);
    setRequestMsg("");
    toast.success(`Pedido enviado a ${startup.name}`);
  };

  return (
    <>
    <Sheet open={!!startup} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        {startup && (
          <div className="flex flex-col gap-6">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-2xl font-medium tracking-tight">{startup.name}</h2>
                <StageBadge stage={startup.stage} />
              </div>
              <p className="text-sm text-muted-foreground mt-1 capitalize">
                {startup.business_model?.replace("_", " ") ?? "—"} · {startup.industry ?? "—"}
                {startup.batch ? ` · ${startup.batch}` : ""}
                {startup.year ? ` · ${startup.year}` : ""}
              </p>
              <p className="text-xs text-tertiary mt-1">
                Período más reciente: {monthShort[latestPeriod.m - 1]} {latestPeriod.y}
              </p>
            </div>

            <div className="flex gap-1 border-b border-border">
              {[
                { id: "metrics" as const, label: "Métricas" },
                { id: "roadmap" as const, label: "Roadmap" },
                { id: "dataroom" as const, label: "Data Room" },
              ].map((t) => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "px-3 py-2 text-sm transition-all border-b-2 -mb-px",
                    tab === t.id
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  )}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {tab === "metrics" && (
              <div className="space-y-6">
                <div className="flex gap-1 border-b border-border">
                  {drawerCategories.map((c) => (
                    <button
                      key={c.id}
                      onClick={() => setActiveCat(c.id)}
                      className={cn(
                        "px-3 py-2 text-xs transition-all border-b-2 -mb-px",
                        activeCat === c.id
                          ? "border-foreground text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>

                {inputDefsCat.length === 0 && calcDefsCat.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-6 text-center">
                    No hay métricas públicas en esta categoría.
                  </p>
                ) : (
                  <>
                    {inputDefsCat.length > 0 && (
                      <div>
                        <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Inputs</h3>
                        <div className="grid grid-cols-2 gap-3">
                          {inputDefsCat.map((def) => {
                            const val = def.input_key ? currentInputs[def.input_key] : undefined;
                            const prevVal = def.input_key ? prevInputs[def.input_key] : undefined;
                            const change = val != null && prevVal != null && prevVal !== 0
                              ? ((val - prevVal) / Math.abs(prevVal)) * 100 : null;
                            return (
                              <button
                                key={def.id}
                                onClick={() => setOpenInfo(def)}
                                className="text-left border border-border rounded-lg p-4 bg-card hover:border-foreground/30 transition-all"
                              >
                                <div className="flex items-start justify-between">
                                  <div className="text-xs text-muted-foreground">{def.name}</div>
                                  <Info size={12} strokeWidth={1.5} className="text-tertiary" />
                                </div>
                                <div className="text-xl font-medium tracking-tight mt-1">
                                  {val != null ? formatMetricValue(val, def.unit) : "—"}
                                </div>
                                {change != null && (
                                  <div className="text-[11px] text-muted-foreground mt-0.5">
                                    {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}% vs mes anterior
                                  </div>
                                )}
                                {(() => {
                                  const sp = sparkFor(def);
                                  return sp.length >= 2 ? (
                                    <div className="h-8 mt-2">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={sp}>
                                          <Line type="monotone" dataKey="v" stroke="hsl(var(--foreground))" strokeWidth={1} dot={false} />
                                        </LineChart>
                                      </ResponsiveContainer>
                                    </div>
                                  ) : null;
                                })()}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {calcDefsCat.length > 0 && (
                      <div>
                        <h3 className="text-xs uppercase tracking-wide text-muted-foreground mb-3">Calculadas</h3>
                        <div className="grid grid-cols-2 gap-3">
                          {calcDefsCat.map((def) => {
                            const expr = def.formula_expression!;
                            const val = evalFormula(expr, currentInputs);
                            const prevV = evalFormula(expr, prevInputs);
                            const change = val != null && prevV != null && prevV !== 0
                              ? ((val - prevV) / Math.abs(prevV)) * 100 : null;
                            const required = requiredInputs(expr);
                            const missing = required.filter((k) => currentInputs[k] === undefined);
                            return (
                              <button
                                key={def.id}
                                onClick={() => setOpenInfo(def)}
                                className="text-left border border-border rounded-lg p-4 bg-card hover:border-foreground/30 transition-all"
                              >
                                <div className="flex items-start justify-between">
                                  <div>
                                    <div className="text-xs text-muted-foreground">{def.name}</div>
                                    {def.formula && (
                                      <div className="text-[10px] text-tertiary mt-0.5 font-mono truncate">{def.formula}</div>
                                    )}
                                  </div>
                                  <Info size={12} strokeWidth={1.5} className="text-tertiary shrink-0" />
                                </div>
                                {missing.length > 0 ? (
                                  <div className="text-[11px] text-muted-foreground mt-2">
                                    Falta data del founder
                                  </div>
                                ) : (
                                  <>
                                    <div className="text-xl font-medium tracking-tight mt-1">
                                      {formatMetricValue(val, def.unit)}
                                    </div>
                                    {change != null && (
                                      <div className="text-[11px] text-muted-foreground mt-0.5">
                                        {change >= 0 ? "↑" : "↓"} {Math.abs(change).toFixed(1)}% vs mes anterior
                                      </div>
                                    )}
                                    {(() => {
                                      const sp = sparkFor(def);
                                      return sp.length >= 2 ? (
                                        <div className="h-8 mt-2">
                                          <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={sp}>
                                              <Line type="monotone" dataKey="v" stroke="hsl(var(--foreground))" strokeWidth={1} dot={false} />
                                            </LineChart>
                                          </ResponsiveContainer>
                                        </div>
                                      ) : null;
                                    })()}
                                  </>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {tab === "roadmap" && (
              <div className="space-y-4">
                <div className="border border-border rounded-lg p-4">
                  <div className="text-xs text-muted-foreground">Readiness Score</div>
                  <div className="text-3xl font-medium tracking-tight mt-1 tabular-nums">
                    {startup.readiness_score}
                    <span className="text-sm text-muted-foreground">/100</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {pillars.map((p) => {
                    const pct = p.total === 0 ? 0 : (p.done / p.total) * 100;
                    return (
                      <div key={p.id}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span>{p.name}</span>
                          <span className="text-muted-foreground tabular-nums text-xs">
                            {p.done}/{p.total}
                          </span>
                        </div>
                        <div className="h-1 bg-surface rounded-full overflow-hidden">
                          <div
                            className="h-full bg-foreground transition-all"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {tab === "dataroom" && (
              <div className="space-y-3">
                <p className="text-xs text-muted-foreground">
                  Solo lectura. Podés pedirle al founder que actualice un documento y le aparece en su dashboard.
                </p>
                {docs.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No hay documentos visibles.</p>
                ) : (
                  <div className="space-y-2">
                    {docs.map((d) => {
                      const requested = requestedDocIds.has(d.id);
                      const isOpen = requestingDoc === d.id;
                      return (
                        <div key={d.id} className="border border-border rounded-md">
                          <div className="flex items-center gap-3 p-3">
                            <div
                              className={cn(
                                "h-2 w-2 rounded-full shrink-0",
                                d.status === "verified"
                                  ? "bg-foreground"
                                  : d.status === "uploaded"
                                  ? "bg-muted-foreground"
                                  : "bg-tertiary"
                              )}
                            />
                            <span className="flex-1 text-sm">{d.name}</span>
                            <span className="text-xs text-tertiary capitalize">{d.status}</span>
                            {requested ? (
                              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                                <Bell size={11} strokeWidth={1.5} /> Pedido enviado
                              </span>
                            ) : (
                              <button
                                onClick={() => { setRequestingDoc(d.id); setRequestMsg(""); }}
                                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-all"
                              >
                                <Bell size={11} strokeWidth={1.5} /> Solicitar actualización
                              </button>
                            )}
                          </div>
                          {isOpen && (
                            <div className="border-t border-border p-3 space-y-2">
                              <Textarea
                                value={requestMsg}
                                onChange={(e) => setRequestMsg(e.target.value)}
                                placeholder="Mensaje opcional para el founder…"
                                rows={2}
                                className="text-sm"
                              />
                              <div className="flex justify-end gap-2">
                                <Button size="sm" variant="ghost" onClick={() => setRequestingDoc(null)}>
                                  Cancelar
                                </Button>
                                <Button size="sm" onClick={() => requestUpdate(d)}>
                                  Enviar pedido
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
    <MetricInfoSheet metric={openInfo} onClose={() => setOpenInfo(null)} history={infoHistory} />
    </>
  );
}
