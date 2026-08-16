import { useState } from "react";
import { toast } from "sonner";
import { handleMembershipError } from "@/lib/membership";
import {
  SUGGEST_METRIC_LINKS_URL,
  LINK_METRIC_TO_REQUIREMENT_URL,
  UNLINK_METRIC_FROM_REQUIREMENT_URL,
  SET_METRIC_APPLICABILITY_URL,
  type SuggestedMetricLinkCandidate,
} from "@/lib/metricRequirements";

export async function fetchSuggestedLinks(requirementId: string): Promise<SuggestedMetricLinkCandidate[]> {
  const res = await fetch(`${SUGGEST_METRIC_LINKS_URL}?requirement_id=${encodeURIComponent(requirementId)}`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.candidates) ? data.candidates : [];
}

/**
 * Acciones de la startup sobre un requisito fund_required: vincular una
 * métrica propia (cumplimiento), desvincular, o marcar/limpiar "no
 * aplicable". Nunca edita ni borra el requisito en sí — ese endpoint ni
 * siquiera existe del lado startup, ver metricRequirements.ts.
 */
export function useMetricRequirementFulfillment(onDone: () => void) {
  const [saving, setSaving] = useState(false);

  const linkMetric = async (requirementId: string, ownMetricId: string): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch(LINK_METRIC_TO_REQUIREMENT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement_id: requirementId, own_metric_id: ownMetricId }),
      });
      if (await handleMembershipError(res)) return false;
      const data = await res.json();
      toast.success(
        data?.definition_conflict
          ? "Métrica vinculada — ojo, la unidad no coincide exactamente con la del pedido"
          : "Métrica vinculada"
      );
      onDone();
      return true;
    } catch {
      toast.error("No se pudo vincular la métrica");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const unlinkMetric = async (requirementId: string): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch(UNLINK_METRIC_FROM_REQUIREMENT_URL, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement_id: requirementId }),
      });
      if (await handleMembershipError(res)) return false;
      toast.success("Métrica desvinculada");
      onDone();
      return true;
    } catch {
      toast.error("No se pudo desvincular");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const setApplicability = async (
    requirementId: string,
    status: "not_applicable" | "clear",
    reason?: string
  ): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch(SET_METRIC_APPLICABILITY_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement_id: requirementId, status, ...(reason ? { reason } : {}) }),
      });
      if (await handleMembershipError(res)) return false;
      toast.success(status === "not_applicable" ? "Marcada como no aplicable" : "Vuelve a estar activa");
      onDone();
      return true;
    } catch {
      toast.error("No se pudo actualizar");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { linkMetric, unlinkMetric, setApplicability, saving };
}
