import { supabase } from "@/integrations/supabase/client";

export type PillarBreakdown = {
  pillar_id: string;
  name: string;
  weight: number;
  completed: number;
  total: number;
  score: number;
};

export async function calculateReadinessScore(startupId: string): Promise<{
  total: number;
  pillars: PillarBreakdown[];
}> {
  const { data: pillars } = await supabase
    .from("roadmap_pillars")
    .select("id, name, weight, order_index")
    .order("order_index");

  if (!pillars) return { total: 0, pillars: [] };

  const breakdown: PillarBreakdown[] = [];
  let total = 0;

  for (const pillar of pillars) {
    const { data: tasks } = await supabase
      .from("roadmap_tasks")
      .select("id")
      .eq("pillar_id", pillar.id);

    const taskIds = (tasks ?? []).map((t) => t.id);
    const totalTasks = taskIds.length;

    let completed = 0;
    if (totalTasks > 0) {
      const { count } = await supabase
        .from("startup_tasks")
        .select("id", { count: "exact", head: true })
        .eq("startup_id", startupId)
        .eq("status", "done")
        .in("task_id", taskIds);
      completed = count ?? 0;
    }

    const pillarScore = totalTasks > 0 ? (completed / totalTasks) * 100 : 0;
    const weighted = (pillarScore * Number(pillar.weight)) / 100;
    total += weighted;

    breakdown.push({
      pillar_id: pillar.id,
      name: pillar.name,
      weight: Number(pillar.weight),
      completed,
      total: totalTasks,
      score: Math.round(pillarScore),
    });
  }

  const totalRounded = Math.round(total);

  // Persist
  // TODO: migrar a backend propio
  await supabase.from("startups").update({ readiness_score: totalRounded }).eq("id", startupId);
  // TODO: migrar a backend propio
  await supabase.from("score_snapshots").insert({
    startup_id: startupId,
    total_score: totalRounded,
    legal_score: breakdown.find((p) => p.name.includes("IP"))?.score ?? null,
    growth_score: breakdown.find((p) => p.name.includes("Financials"))?.score ?? null,
    dataroom_score: breakdown.find((p) => p.name.includes("Data Room"))?.score ?? null,
    pitch_score: breakdown.find((p) => p.name.includes("Pitch"))?.score ?? null,
  });

  return { total: totalRounded, pillars: breakdown };
}
