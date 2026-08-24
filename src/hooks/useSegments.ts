import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleMembershipError } from "@/lib/membership";
import {
  LIST_SEGMENTS_URL,
  UPSERT_SEGMENT_URL,
  DELETE_SEGMENT_URL,
  type Segment,
  type UpsertSegmentRequest,
} from "@/lib/portfolioIntelligence";

async function fetchSegments(): Promise<Segment[]> {
  const res = await fetch(LIST_SEGMENTS_URL, { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.segments) ? (data.segments as Segment[]) : [];
}

export function useSegments() {
  const { data: segments = [], isLoading: loading } = useQuery({
    queryKey: ["segments"],
    queryFn: fetchSegments,
  });
  return { segments, loading };
}

export function useSegmentMutations() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["segments"] });
    queryClient.invalidateQueries({ queryKey: ["portfolio-metrics-dashboard"] });
    queryClient.invalidateQueries({ queryKey: ["portfolio-tasks"] });
    queryClient.invalidateQueries({ queryKey: ["reporting-status"] });
  };

  const upsertSegment = async (body: UpsertSegmentRequest): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch(UPSERT_SEGMENT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (await handleMembershipError(res)) return false;
      toast.success(body.segment_id ? "Segmento actualizado" : "Segmento creado");
      invalidate();
      return true;
    } catch {
      toast.error("No se pudo guardar el segmento");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteSegment = async (segmentId: string): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch(DELETE_SEGMENT_URL, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ segment_id: segmentId }),
      });
      if (await handleMembershipError(res)) return false;
      toast.success("Segmento eliminado");
      invalidate();
      return true;
    } catch {
      toast.error("No se pudo eliminar el segmento");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { upsertSegment, deleteSegment, saving };
}
