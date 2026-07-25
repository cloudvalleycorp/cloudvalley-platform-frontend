import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { BackLink } from "@/components/BackLink";
import { LoadingState } from "@/components/LoadingState";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { handleMembershipError } from "@/lib/membership";
import { LIST_FINANCIAL_METRICS_URL, type FinancialMetricDef } from "@/lib/financialData";
import { LIST_CONNECTIONS_URL, type Connection } from "@/lib/connections";
import {
  GET_FINANCIAL_REPORT_URL,
  UPDATE_FINANCIAL_REPORT_URL,
  SHARE_FINANCIAL_REPORT_URL,
  UNSHARE_FINANCIAL_REPORT_URL,
  LIST_FINANCIAL_REPORT_SHARES_URL,
  type ReportSection,
  type ReportShare,
} from "@/lib/financialReports";
import { toast } from "sonner";
import { ChevronUp, ChevronDown, X, Plus, Save } from "lucide-react";

export default function ReportEditor() {
  const { reportId } = useParams<{ reportId: string }>();
  const { user, loading, role, company_id, is_owner } = useAuth();
  const navigate = useNavigate();

  const [loadingReport, setLoadingReport] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [name, setName] = useState("");
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [saving, setSaving] = useState(false);

  const [metrics, setMetrics] = useState<FinancialMetricDef[]>([]);
  const metricById = useMemo(() => Object.fromEntries(metrics.map((m) => [m.metric_id, m])), [metrics]);

  const [connections, setConnections] = useState<Connection[]>([]);
  const [shares, setShares] = useState<ReportShare[]>([]);
  const [sharingId, setSharingId] = useState<string | null>(null);

  useEffect(() => {
    if (!reportId || !company_id) return;
    setLoadingReport(true);
    (async () => {
      try {
        const [reportRes, metricsRes, connectionsRes, sharesRes] = await Promise.all([
          fetch(`${GET_FINANCIAL_REPORT_URL}?report_id=${encodeURIComponent(reportId)}`, { credentials: "include" }),
          fetch(`${LIST_FINANCIAL_METRICS_URL}?company_id=${encodeURIComponent(company_id)}`, { credentials: "include" }),
          fetch(LIST_CONNECTIONS_URL, { credentials: "include" }),
          fetch(`${LIST_FINANCIAL_REPORT_SHARES_URL}?company_id=${encodeURIComponent(company_id)}`, { credentials: "include" }),
        ]);
        if (reportRes.status === 404) {
          setNotFound(true);
          return;
        }
        if (reportRes.ok) {
          const data = await reportRes.json();
          setName(data.name ?? "");
          setSections(Array.isArray(data.sections) ? data.sections : []);
        } else {
          setNotFound(true);
        }
        if (metricsRes.ok) {
          const data = await metricsRes.json();
          setMetrics(Array.isArray(data?.metrics) ? data.metrics : []);
        }
        if (connectionsRes.ok) {
          const data = await connectionsRes.json();
          const list: Connection[] = Array.isArray(data?.connections) ? data.connections : [];
          setConnections(list.filter((c) => c.status === "connected"));
        }
        if (sharesRes.ok) {
          const data = await sharesRes.json();
          setShares(Array.isArray(data?.shares) ? data.shares : []);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoadingReport(false);
      }
    })();
  }, [reportId, company_id]);

  const addSection = () => {
    setSections((s) => [...s, { title: "Nueva sección", subtitle: null, blocks: [] }]);
  };
  const removeSection = (i: number) => {
    setSections((s) => s.filter((_, idx) => idx !== i));
  };
  const moveSection = (i: number, dir: -1 | 1) => {
    setSections((s) => {
      const next = [...s];
      const j = i + dir;
      if (j < 0 || j >= next.length) return s;
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };
  const updateSection = (i: number, patch: Partial<ReportSection>) => {
    setSections((s) => s.map((sec, idx) => (idx === i ? { ...sec, ...patch } : sec)));
  };

  const addBlock = (sectionIndex: number, metricId: string) => {
    setSections((s) =>
      s.map((sec, idx) => {
        if (idx !== sectionIndex) return sec;
        if (sec.blocks.some((b) => b.metric_id === metricId)) return sec;
        return { ...sec, blocks: [...sec.blocks, { metric_id: metricId }] };
      })
    );
  };
  const removeBlock = (sectionIndex: number, blockIndex: number) => {
    setSections((s) =>
      s.map((sec, idx) => (idx === sectionIndex ? { ...sec, blocks: sec.blocks.filter((_, bi) => bi !== blockIndex) } : sec))
    );
  };
  const moveBlock = (sectionIndex: number, blockIndex: number, dir: -1 | 1) => {
    setSections((s) =>
      s.map((sec, idx) => {
        if (idx !== sectionIndex) return sec;
        const next = [...sec.blocks];
        const j = blockIndex + dir;
        if (j < 0 || j >= next.length) return sec;
        [next[blockIndex], next[j]] = [next[j], next[blockIndex]];
        return { ...sec, blocks: next };
      })
    );
  };

  const save = async () => {
    if (!reportId) return;
    if (!name.trim()) {
      toast.error("El reporte necesita un nombre");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(UPDATE_FINANCIAL_REPORT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, name: name.trim(), sections }),
      });
      if (await handleMembershipError(res)) return;
      toast.success("Reporte guardado");
    } catch {
      toast.error("No se pudo guardar el reporte");
    } finally {
      setSaving(false);
    }
  };

  const isShared = (connectionId: string) => shares.some((s) => s.connection_id === connectionId && s.report_id === reportId);

  const toggleShare = async (connection: Connection, next: boolean) => {
    if (!reportId) return;
    setSharingId(connection.connection_id);
    try {
      const url = next ? SHARE_FINANCIAL_REPORT_URL : UNSHARE_FINANCIAL_REPORT_URL;
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, connection_id: connection.connection_id }),
      });
      if (await handleMembershipError(res)) return;
      setShares((s) =>
        next
          ? [...s, { report_id: reportId, report_name: name, connection_id: connection.connection_id, counterpart_name: connection.counterpart_name }]
          : s.filter((sh) => !(sh.connection_id === connection.connection_id && sh.report_id === reportId))
      );
      toast.success(next ? `Compartido con ${connection.counterpart_name}` : `Ya no se comparte con ${connection.counterpart_name}`);
    } catch {
      toast.error("No se pudo actualizar el compartido");
    } finally {
      setSharingId(null);
    }
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (role !== "user") return <Navigate to="/dashboard" replace />;
  if (!company_id) return <Navigate to="/reporting" replace />;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-8 py-12 space-y-8">
        <BackLink to="/reporting" label="Volver a Reporting" />

        {loadingReport ? (
          <LoadingState />
        ) : notFound ? (
          <div className="text-sm text-muted-foreground">No se encontró el reporte.</div>
        ) : (
          <>
            <PageHeader
              title={is_owner ? "Editar reporte" : "Reporte"}
              subtitle={
                is_owner ? (
                  <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-2 max-w-sm" />
                ) : (
                  name
                )
              }
              action={
                is_owner && (
                  <Button onClick={save} disabled={saving}>
                    <Save size={14} className="mr-1" /> {saving ? "Guardando…" : "Guardar"}
                  </Button>
                )
              }
            />

            <div className="space-y-6">
              {sections.map((section, si) => (
                <div key={si} className="border border-border rounded-lg bg-card p-5">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div className="flex-1 space-y-2">
                      {is_owner ? (
                        <>
                          <Input
                            value={section.title}
                            onChange={(e) => updateSection(si, { title: e.target.value })}
                            className="font-medium"
                            placeholder="Título de la sección"
                          />
                          <Textarea
                            value={section.subtitle ?? ""}
                            onChange={(e) => updateSection(si, { subtitle: e.target.value || null })}
                            placeholder="Subtítulo (opcional)"
                            rows={1}
                            className="text-sm"
                          />
                        </>
                      ) : (
                        <>
                          <h3 className="font-medium">{section.title}</h3>
                          {section.subtitle && <p className="text-sm text-muted-foreground">{section.subtitle}</p>}
                        </>
                      )}
                    </div>
                    {is_owner && (
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="sm" variant="ghost" disabled={si === 0} onClick={() => moveSection(si, -1)}>
                          <ChevronUp size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" disabled={si === sections.length - 1} onClick={() => moveSection(si, 1)}>
                          <ChevronDown size={14} />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => removeSection(si)}>
                          <X size={14} />
                        </Button>
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    {section.blocks.map((block, bi) => {
                      const def = metricById[block.metric_id];
                      return (
                        <div key={bi} className="flex items-center justify-between gap-2 border border-border/60 rounded-md px-3 py-2">
                          <span className="text-sm truncate">
                            {def?.name ?? block.metric_id}
                            {def?.unit && <span className="text-xs text-muted-foreground"> ({def.unit})</span>}
                          </span>
                          {is_owner && (
                            <div className="flex items-center gap-1 shrink-0">
                              <Button size="sm" variant="ghost" disabled={bi === 0} onClick={() => moveBlock(si, bi, -1)}>
                                <ChevronUp size={12} />
                              </Button>
                              <Button size="sm" variant="ghost" disabled={bi === section.blocks.length - 1} onClick={() => moveBlock(si, bi, 1)}>
                                <ChevronDown size={12} />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-destructive" onClick={() => removeBlock(si, bi)}>
                                <X size={12} />
                              </Button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {section.blocks.length === 0 && (
                      <p className="text-xs text-muted-foreground py-2">Sin métricas todavía.</p>
                    )}
                  </div>

                  {is_owner && (
                    <div className="mt-3">
                      <Select value="" onValueChange={(metricId) => addBlock(si, metricId)}>
                        <SelectTrigger className="h-9">
                          <SelectValue placeholder="+ Agregar métrica a esta sección" />
                        </SelectTrigger>
                        <SelectContent>
                          {metrics
                            .filter((m) => !section.blocks.some((b) => b.metric_id === m.metric_id))
                            .map((m) => (
                              <SelectItem key={m.metric_id} value={m.metric_id}>
                                {m.name}
                              </SelectItem>
                            ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              ))}

              {is_owner && (
                <Button variant="outline" onClick={addSection}>
                  <Plus size={14} className="mr-1" /> Agregar sección
                </Button>
              )}

              {sections.length === 0 && !is_owner && (
                <div className="text-sm text-muted-foreground text-center py-8">Este reporte todavía no tiene secciones.</div>
              )}
            </div>

            {is_owner && (
              <section className="pt-6 border-t border-border">
                <h3 className="text-xs font-medium text-foreground uppercase tracking-wide mb-3">Compartir con</h3>
                {connections.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Todavía no tenés conexiones activas con ningún fondo.</p>
                ) : (
                  <div className="space-y-2">
                    {connections.map((c) => (
                      <div key={c.connection_id} className="flex items-center justify-between border border-border rounded-md px-4 py-2.5">
                        <span className="text-sm">{c.counterpart_name}</span>
                        <Switch
                          checked={isShared(c.connection_id)}
                          disabled={sharingId === c.connection_id}
                          onCheckedChange={(checked) => toggleShare(c, checked)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
