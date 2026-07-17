import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, Map, BarChart3, FolderOpen, Bell, Check } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { ReadinessScore } from "@/components/ReadinessScore";
import { useAuth } from "@/contexts/AuthContext";
import { useStartup } from "@/hooks/useStartup";
import { supabase } from "@/integrations/supabase/client";
import { calculateReadinessScore, PillarBreakdown } from "@/lib/score";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";

type DocRequest = {
  id: string;
  message: string | null;
  created_at: string;
  document: { id: string; name: string; category: string } | null;
  organization: { name: string } | null;
};

export default function Dashboard() {
  const { user, role, company_id, fund_id, email } = useAuth();
  const { startup, refetch } = useStartup();
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("message") === "email_updated") {
      toast.success("Tu email fue actualizado correctamente");
      const next = new URLSearchParams(searchParams);
      next.delete("message");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const [dismissed, setDismissed] = useState(false);
  const [reopenNoMembership, setReopenNoMembership] = useState(false);
  const [score, setScore] = useState(0);
  const [pillars, setPillars] = useState<PillarBreakdown[]>([]);
  const [taskStats, setTaskStats] = useState({ done: 0, total: 0 });
  const [docStats, setDocStats] = useState({ uploaded: 0, total: 0 });
  const [mrr, setMrr] = useState<{ value: number | null; change: number | null }>({ value: null, change: null });
  const [pendingTasks, setPendingTasks] = useState<any[]>([]);
  const [profileName, setProfileName] = useState("");
  const [docRequests, setDocRequests] = useState<DocRequest[]>([]);

  useEffect(() => {
    if (!startup || !user) return;
    (async () => {
      // TODO: migrar a backend propio
      const { data: prof } = await supabase.from("profiles").select("name").eq("id", user.id).maybeSingle();
      setProfileName(prof?.name ?? "");

      const { total, pillars } = await calculateReadinessScore(startup.id);
      setScore(total);
      setPillars(pillars);

      const { count: doneCount } = await supabase
        .from("startup_tasks").select("id", { count: "exact", head: true })
        .eq("startup_id", startup.id).eq("status", "done");
      const { count: totalCount } = await supabase
        .from("startup_tasks").select("id", { count: "exact", head: true })
        .eq("startup_id", startup.id);
      setTaskStats({ done: doneCount ?? 0, total: totalCount ?? 0 });

      const { data: docs } = await supabase
        .from("documents").select("status").eq("startup_id", startup.id);
      setDocStats({
        uploaded: (docs ?? []).filter((d) => d.status !== "missing").length,
        total: (docs ?? []).length,
      });

      // Revenue: latest entry of the Revenue input metric
      const { data: revDef } = await supabase
        .from("metric_definitions").select("id").eq("input_key", "revenue").maybeSingle();
      if (revDef) {
        const { data: entries } = await supabase
          .from("metric_entries").select("value, period_month, period_year")
          .eq("startup_id", startup.id).eq("metric_id", revDef.id)
          .not("value", "is", null)
          .order("period_year", { ascending: false }).order("period_month", { ascending: false })
          .limit(2);
        if (entries && entries.length > 0) {
          const current = Number(entries[0].value);
          const prev = entries[1] ? Number(entries[1].value) : null;
          const change = prev && prev > 0 ? ((current - prev) / prev) * 100 : null;
          setMrr({ value: current, change });
        }
      }

      // Next 3 pending tasks
      const { data: pending } = await supabase
        .from("startup_tasks")
        .select("id, status, roadmap_tasks(title, criticality)")
        .eq("startup_id", startup.id).eq("status", "pending").limit(3);
      setPendingTasks(pending ?? []);

      // Pending document update requests from organizations
      const { data: reqs } = await supabase
        .from("document_requests")
        .select("id, message, created_at, document:documents(id, name, category), organization:organizations(name)")
        .eq("startup_id", startup.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });
      setDocRequests((reqs ?? []) as any);
    })();
  }, [startup?.id, user?.id]);

  const toggleTask = async (id: string) => {
    // TODO: migrar a backend propio
    await supabase.from("startup_tasks")
      .update({ status: "done", completed_at: new Date().toISOString() })
      .eq("id", id);
    if (startup) {
      const { total, pillars } = await calculateReadinessScore(startup.id);
      setScore(total);
      setPillars(pillars);
      setPendingTasks(pendingTasks.filter((t) => t.id !== id));
      setTaskStats({ done: taskStats.done + 1, total: taskStats.total });
      await refetch();
    }
  };

  const today = new Date().toLocaleDateString("es-AR", { weekday: "long", day: "numeric", month: "long" });
  const greeting = profileName ? `Hola, ${profileName.split(" ")[0]}` : "Buen día";

  const resolveRequest = async (id: string) => {
    const { error } = await supabase
      .from("document_requests")
      .update({ status: "resolved", resolved_at: new Date().toISOString() })
      .eq("id", id);
    if (error) { toast.error("No se pudo marcar como resuelto"); return; }
    setDocRequests((rs) => rs.filter((r) => r.id !== id));
    toast.success("Pedido marcado como resuelto");
  };

  // role="user" sin company asignada: mostrar el flujo "sin empresa"
  // (o un banner persistente si el usuario eligió "decidir más tarde").
  if (role === "user" && !company_id) {
    if (!dismissed || reopenNoMembership) {
      return (
        <AppLayout>
          <NoMembershipScreen
            role="user"
            email={email}
            onDismiss={() => {
              setDismissed(true);
              setReopenNoMembership(false);
            }}
          />
        </AppLayout>
      );
    }
    return (
      <AppLayout>
        <div className="max-w-6xl mx-auto px-8 py-12">
          <NoMembershipBanner role="user" onOpen={() => setReopenNoMembership(true)} />
          <div className="border border-border rounded-lg p-12 text-center text-sm text-muted-foreground bg-card">
            No hay contenido para mostrar hasta que te unas a una empresa.
          </div>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <header className="mb-10">
          <h1 className="text-3xl font-medium tracking-tight">{greeting}</h1>
          <p className="text-sm text-muted-foreground mt-1 capitalize">{today}</p>
        </header>

        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2">
            <ReadinessScore score={score} pillars={pillars} />
          </div>

          <div className="space-y-4">
            <Link to="/roadmap" className="block border border-border rounded-lg p-5 bg-card hover:border-foreground/30 transition-all duration-150 group">
              <div className="flex items-center justify-between">
                <Map size={16} strokeWidth={1.5} className="text-muted-foreground" />
                <ArrowRight size={14} strokeWidth={1.5} className="text-tertiary group-hover:text-foreground transition-all" />
              </div>
              <div className="mt-4">
                <div className="text-2xl font-medium">{taskStats.done}<span className="text-tertiary text-base">/{taskStats.total}</span></div>
                <div className="text-xs text-muted-foreground mt-0.5">Tareas completas</div>
              </div>
              <div className="h-1 w-full bg-surface rounded-full overflow-hidden mt-3">
                <div className="h-full bg-foreground" style={{ width: `${taskStats.total ? (taskStats.done / taskStats.total) * 100 : 0}%` }} />
              </div>
            </Link>

            <Link to="/metrics" className="block border border-border rounded-lg p-5 bg-card hover:border-foreground/30 transition-all duration-150 group">
              <div className="flex items-center justify-between">
                <BarChart3 size={16} strokeWidth={1.5} className="text-muted-foreground" />
                <ArrowRight size={14} strokeWidth={1.5} className="text-tertiary group-hover:text-foreground transition-all" />
              </div>
              <div className="mt-4">
                <div className="text-2xl font-medium">
                  {mrr.value != null ? `$${mrr.value.toLocaleString()}` : "—"}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Revenue mensual {mrr.change != null && (
                    <span>{mrr.change >= 0 ? "↑" : "↓"} {Math.abs(mrr.change).toFixed(1)}%</span>
                  )}
                </div>
              </div>
            </Link>

            <Link to="/data-room" className="block border border-border rounded-lg p-5 bg-card hover:border-foreground/30 transition-all duration-150 group">
              <div className="flex items-center justify-between">
                <FolderOpen size={16} strokeWidth={1.5} className="text-muted-foreground" />
                <ArrowRight size={14} strokeWidth={1.5} className="text-tertiary group-hover:text-foreground transition-all" />
              </div>
              <div className="mt-4">
                <div className="text-2xl font-medium">{docStats.uploaded}<span className="text-tertiary text-base">/{docStats.total || "—"}</span></div>
                <div className="text-xs text-muted-foreground mt-0.5">Documentos cargados</div>
              </div>
            </Link>
          </div>
        </div>

        <section className="border border-border rounded-lg p-6 bg-card">
          <h2 className="text-sm font-medium text-foreground mb-4">Próximos pasos</h2>
          {pendingTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">No hay tareas pendientes urgentes.</p>
          ) : (
            <ul className="space-y-1">
              {pendingTasks.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-2.5 border-b border-border/50 last:border-0">
                  <Checkbox onCheckedChange={() => toggleTask(t.id)} />
                  <span className="text-sm flex-1">{t.roadmap_tasks?.title}</span>
                  <span className="text-xs text-tertiary capitalize">{t.roadmap_tasks?.criticality}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {docRequests.length > 0 && (
          <section className="border border-border rounded-lg p-6 bg-card mt-6">
            <div className="flex items-center gap-2 mb-1">
              <Bell size={14} strokeWidth={1.5} className="text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">Documentos pedidos por tus inversores</h2>
            </div>
            <p className="text-xs text-muted-foreground mb-4">
              {docRequests.length} pedido{docRequests.length === 1 ? "" : "s"} pendiente{docRequests.length === 1 ? "" : "s"}. Subí el documento en el Data Room y marcá como resuelto.
            </p>
            <ul className="space-y-1">
              {docRequests.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{r.document?.name ?? "Documento"}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {r.organization?.name ?? "Una organización"} · {new Date(r.created_at).toLocaleDateString("es-AR")}
                    </div>
                    {r.message && (
                      <p className="text-xs text-muted-foreground mt-1 italic">"{r.message}"</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      to="/data-room"
                      className="text-xs text-muted-foreground hover:text-foreground transition-all"
                    >
                      Ir al data room
                    </Link>
                    <button
                      onClick={() => resolveRequest(r.id)}
                      className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-all"
                      title="Marcar resuelto"
                    >
                      <Check size={12} strokeWidth={1.5} /> Resuelto
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </AppLayout>
  );
}
