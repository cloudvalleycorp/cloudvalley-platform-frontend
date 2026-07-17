import { useEffect, useState } from "react";
import { Info, Upload, ChevronDown } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useStartup } from "@/hooks/useStartup";
import { supabase } from "@/integrations/supabase/client";
import { calculateReadinessScore } from "@/lib/score";
import { Checkbox } from "@/components/ui/checkbox";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { StageBadge } from "@/components/StageBadge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type Pillar = { id: string; name: string; weight: number; order_index: number };
type Task = {
  id: string;
  task_id: string;
  status: string;
  doc_url: string | null;
  pillar_id: string;
  title: string;
  description: string | null;
  why_it_matters: string | null;
  how_to_do_it: string | null;
  criticality: string;
  requires_doc: boolean;
};

export default function Roadmap() {
  const { startup, refetch } = useStartup();
  const [pillars, setPillars] = useState<Pillar[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activePillar, setActivePillar] = useState<string>("all");
  const [openTask, setOpenTask] = useState<Task | null>(null);
  const [score, setScore] = useState(0);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const load = async () => {
    if (!startup) return;
    // TODO: migrar a backend propio
    const { data: p } = await supabase.from("roadmap_pillars").select("*").order("order_index");
    setPillars((p ?? []) as Pillar[]);

    const { data: st } = await supabase
      .from("startup_tasks")
      .select("id, status, doc_url, task_id, roadmap_tasks(*)")
      .eq("startup_id", startup.id);

    const flattened: Task[] = (st ?? []).map((row: any) => ({
      id: row.id,
      task_id: row.task_id,
      status: row.status,
      doc_url: row.doc_url,
      pillar_id: row.roadmap_tasks.pillar_id,
      title: row.roadmap_tasks.title,
      description: row.roadmap_tasks.description,
      why_it_matters: row.roadmap_tasks.why_it_matters,
      how_to_do_it: row.roadmap_tasks.how_to_do_it,
      criticality: row.roadmap_tasks.criticality,
      requires_doc: row.roadmap_tasks.requires_doc,
    }));
    setTasks(flattened);

    setScore(startup.readiness_score);
  };

  useEffect(() => { load(); }, [startup?.id]);

  const toggle = async (task: Task) => {
    const newStatus = task.status === "done" ? "pending" : "done";
    // TODO: migrar a backend propio
    await supabase.from("startup_tasks").update({
      status: newStatus,
      completed_at: newStatus === "done" ? new Date().toISOString() : null,
    }).eq("id", task.id);
    setTasks(tasks.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    if (startup) {
      const { total } = await calculateReadinessScore(startup.id);
      setScore(total);
      await refetch();
    }
  };

  const handleUpload = async (task: Task, file: File) => {
    if (!startup) return;
    const path = `${startup.id}/roadmap/${task.task_id}-${file.name}`;
    const { error } = await supabase.storage.from("documents").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); return; }
    const { data: urlData } = supabase.storage.from("documents").createSignedUrl ?
      await supabase.storage.from("documents").createSignedUrl(path, 60 * 60 * 24 * 365) :
      { data: { signedUrl: path } } as any;
    // TODO: migrar a backend propio
    await supabase.from("startup_tasks").update({ doc_url: urlData?.signedUrl ?? path }).eq("id", task.id);
    toast.success("Documento subido");
    load();
  };

  const filtered = activePillar === "all" ? tasks : tasks.filter((t) => t.pillar_id === activePillar);
  const grouped = pillars.map((p) => ({
    ...p,
    items: filtered.filter((t) => t.pillar_id === p.id),
  })).filter((p) => p.items.length > 0);

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-8 py-12">
        <header className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-medium tracking-tight">Fundraising Roadmap</h1>
            <div className="flex items-center gap-2 mt-2">
              <StageBadge stage={startup?.stage} />
              <span className="text-xs text-muted-foreground">Readiness {score}/100</span>
            </div>
          </div>
        </header>

        {/* Pillar tabs */}
        <div className="flex gap-1 border-b border-border mb-8 overflow-x-auto">
          <button
            onClick={() => setActivePillar("all")}
            className={cn(
              "px-3 py-2 text-sm transition-all duration-150 border-b-2 -mb-px whitespace-nowrap",
              activePillar === "all" ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            Todos
          </button>
          {pillars.map((p) => (
            <button
              key={p.id}
              onClick={() => setActivePillar(p.id)}
              className={cn(
                "px-3 py-2 text-sm transition-all duration-150 border-b-2 -mb-px whitespace-nowrap",
                activePillar === p.id ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              )}
            >
              {p.name}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          {grouped.map((p) => {
            const done = p.items.filter((t) => t.status === "done").length;
            const isCollapsed = collapsed.has(p.id);
            return (
              <section key={p.id} className="border border-border rounded-lg bg-card">
                <button
                  className="w-full px-6 py-4 flex items-center justify-between text-left"
                  onClick={() => {
                    const next = new Set(collapsed);
                    next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                    setCollapsed(next);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3">
                      <h2 className="text-base font-medium">{p.name}</h2>
                      <span className="text-xs text-tertiary">peso {p.weight}</span>
                    </div>
                    <div className="flex items-center gap-3 mt-2">
                      <div className="text-xs text-muted-foreground">{done}/{p.items.length}</div>
                      <div className="h-0.5 flex-1 max-w-xs bg-surface rounded-full overflow-hidden">
                        <div className="h-full bg-foreground transition-all duration-150" style={{ width: `${(done / p.items.length) * 100}%` }} />
                      </div>
                    </div>
                  </div>
                  <ChevronDown size={16} strokeWidth={1.5} className={cn("text-muted-foreground transition-transform", isCollapsed && "-rotate-90")} />
                </button>
                {!isCollapsed && (
                  <ul className="border-t border-border">
                    {p.items.map((t) => (
                      <li key={t.id} className="flex items-center gap-3 px-6 py-3 border-b border-border/50 last:border-0 group">
                        <Checkbox checked={t.status === "done"} onCheckedChange={() => toggle(t)} />
                        <span className={cn("flex-1 text-sm", t.status === "done" && "text-tertiary line-through")}>{t.title}</span>
                        <span className={cn(
                          "text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded border",
                          t.criticality === "critical" ? "border-foreground text-foreground" : "border-border text-muted-foreground"
                        )}>{t.criticality}</span>
                        {t.requires_doc && (
                          <label className="cursor-pointer text-muted-foreground hover:text-foreground transition-all" title="Subir documento">
                            <Upload size={14} strokeWidth={1.5} />
                            <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && handleUpload(t, e.target.files[0])} />
                          </label>
                        )}
                        <button onClick={() => setOpenTask(t)} className="text-muted-foreground hover:text-foreground transition-all">
                          <Info size={14} strokeWidth={1.5} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      </div>

      <Sheet open={!!openTask} onOpenChange={(o) => !o && setOpenTask(null)}>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>{openTask?.title}</SheetTitle>
            <SheetDescription>{openTask?.description}</SheetDescription>
          </SheetHeader>
          {openTask && (
            <div className="mt-6 space-y-6">
              {openTask.why_it_matters && (
                <div>
                  <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Por qué importa</h4>
                  <p className="text-sm">{openTask.why_it_matters}</p>
                </div>
              )}
              {openTask.how_to_do_it && (
                <div>
                  <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Cómo hacerlo</h4>
                  <p className="text-sm">{openTask.how_to_do_it}</p>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </AppLayout>
  );
}
