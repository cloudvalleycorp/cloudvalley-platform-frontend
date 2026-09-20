import { useState } from "react";
import { toast } from "sonner";
import { handleMembershipError } from "@/lib/membership";
import { DELETE_STARTUP_TASK_URL } from "@/lib/roadmap";

// Cancelar una tarea que un fondo le pidió a una startup puntual (Fase 10
// del rediseño investor). Deliberadamente NO está atado a un query cache
// propio — cada caller (InvestorTasks.tsx, tab Tasks de InvestorCompany.tsx)
// invalida la query que le corresponde después de un true, porque cancelar
// solo afecta a la company que llamó (una tarea pedida a varias startups a
// la vez sigue existiendo para las demás, confirmado por backend).
export function useDeleteStartupTask() {
  const [deleting, setDeleting] = useState(false);

  const deleteTask = async (companyId: string, startupTaskId: string): Promise<boolean> => {
    setDeleting(true);
    try {
      const res = await fetch(DELETE_STARTUP_TASK_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, startup_task_id: startupTaskId }),
      });
      if (await handleMembershipError(res)) return false;
      toast.success("Pedido cancelado");
      return true;
    } catch {
      toast.error("No se pudo cancelar el pedido");
      return false;
    } finally {
      setDeleting(false);
    }
  };

  return { deleteTask, deleting };
}
