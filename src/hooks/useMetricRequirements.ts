import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleMembershipError } from "@/lib/membership";
import {
  LIST_METRIC_REQUIREMENTS_URL,
  UPSERT_METRIC_REQUIREMENT_URL,
  SET_METRIC_REQUIREMENT_MANDATORY_URL,
  DELETE_METRIC_REQUIREMENT_URL,
  type MetricRequirement,
  type UpsertMetricRequirementRequest,
  type SetMetricRequirementMandatoryRequest,
} from "@/lib/metricRequirements";

async function fetchMetricRequirements(): Promise<MetricRequirement[]> {
  const res = await fetch(LIST_METRIC_REQUIREMENTS_URL, { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.requirements) ? (data.requirements as MetricRequirement[]) : [];
}

export function useMetricRequirements() {
  const { data: requirements = [], isLoading: loading } = useQuery({
    queryKey: ["metric-requirements"],
    queryFn: fetchMetricRequirements,
  });
  return { requirements, loading };
}

/**
 * Escritura de requisitos — crear/editar la definición (upsert-metric-
 * requirement, nunca lleva query/mandatory) y marcar/desmarcar obligatorio
 * (set-metric-requirement-mandatory, único lugar donde se manda
 * target_startup_ids/effective_from) son dos endpoints separados a
 * propósito: "definir" y "exigir" son dos decisiones distintas del fondo.
 */
export function useMetricRequirementMutations() {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["metric-requirements"] });
    queryClient.invalidateQueries({ queryKey: ["metric-requirement-coverage"] });
    queryClient.invalidateQueries({ queryKey: ["portfolio-metrics-dashboard"] });
  };

  const upsertRequirement = async (body: UpsertMetricRequirementRequest): Promise<string | null> => {
    setSaving(true);
    try {
      const res = await fetch(UPSERT_METRIC_REQUIREMENT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (await handleMembershipError(res)) return null;
      const data = await res.json();
      toast.success(body.requirement_id ? "Requisito actualizado" : "Requisito creado");
      invalidate();
      return typeof data?.requirement_id === "string" ? data.requirement_id : null;
    } catch {
      toast.error("No se pudo guardar el requisito");
      return null;
    } finally {
      setSaving(false);
    }
  };

  const setMandatory = async (body: SetMetricRequirementMandatoryRequest): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch(SET_METRIC_REQUIREMENT_MANDATORY_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (await handleMembershipError(res)) return false;
      toast.success(body.mandatory ? "Requisito marcado como obligatorio" : "Requisito desmarcado");
      invalidate();
      return true;
    } catch {
      toast.error("No se pudo actualizar la obligatoriedad");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const deleteRequirement = async (requirementId: string): Promise<boolean> => {
    setSaving(true);
    try {
      const res = await fetch(DELETE_METRIC_REQUIREMENT_URL, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requirement_id: requirementId }),
      });
      if (await handleMembershipError(res)) return false;
      toast.success("Requisito eliminado");
      invalidate();
      return true;
    } catch {
      toast.error("No se pudo eliminar el requisito");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { upsertRequirement, setMandatory, deleteRequirement, saving };
}
