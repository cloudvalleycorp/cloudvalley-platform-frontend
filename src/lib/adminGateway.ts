import { toast } from "sonner";

/** Reports gateway error responses via toast. Returns true if the response was an error. */
export async function handleGatewayError(res: Response): Promise<boolean> {
  if (res.status === 403) {
    toast.error("No autorizado");
    return true;
  }
  if (res.status === 400) {
    try {
      const body = await res.json();
      toast.error(body?.error ?? "Solicitud inválida");
    } catch {
      toast.error("Solicitud inválida");
    }
    return true;
  }
  if (!res.ok) {
    toast.error(`Error ${res.status}`);
    return true;
  }
  return false;
}
