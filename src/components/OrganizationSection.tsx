import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Users, UserMinus, LogOut, Bell, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/LoadingState";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DECIDE_MEMBERSHIP_URL,
  LIST_MEMBERSHIP_REQUESTS_URL,
  LIST_USERS_URL,
  REMOVE_MEMBER_URL,
  handleMembershipError,
  type MembershipRequest,
} from "@/lib/membership";
import { useAuth } from "@/contexts/AuthContext";

const MANAGE_USERS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/manage-users";

type OrgMember = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: "admin" | "user" | "investor" | string;
  is_active?: boolean;
  is_owner?: boolean;
  company_id?: string | null;
  company_name?: string | null;
  fund_id?: string | null;
  fund_name?: string | null;
};

const roleLabel = (r: string) => {
  if (r === "admin") return "Admin";
  if (r === "investor") return "Inversor";
  if (r === "user") return "Miembro";
  return r;
};

export function OrganizationSection() {
  const { user_id, company_name, fund_name, role, is_owner, refreshSession } = useAuth();
  const navigate = useNavigate();

  const [requests, setRequests] = useState<MembershipRequest[]>([]);
  const [busyRequest, setBusyRequest] = useState<string | null>(null);

  const [members, setMembers] = useState<OrgMember[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [removeTarget, setRemoveTarget] = useState<OrgMember | null>(null);
  const [removing, setRemoving] = useState(false);
  const [ownerBusyId, setOwnerBusyId] = useState<string | null>(null);

  const orgName = role === "investor" ? fund_name : company_name;

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(LIST_MEMBERSHIP_REQUESTS_URL, { credentials: "include" });
        if (await handleMembershipError(res)) return;
        const data = await res.json();
        setRequests(Array.isArray(data?.requests) ? data.requests : []);
      } catch {
        toast.error("No se pudieron cargar las solicitudes");
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      setLoadingMembers(true);
      try {
        const res = await fetch(LIST_USERS_URL, { credentials: "include" });
        if (await handleMembershipError(res)) {
          setMembers([]);
          return;
        }
        const data = await res.json();
        setMembers(Array.isArray(data?.users) ? data.users : []);
      } catch {
        setMembers([]);
        toast.error("No se pudieron cargar los miembros");
      } finally {
        setLoadingMembers(false);
      }
    })();
  }, []);

  const decide = async (request_id: string, decision: "approve" | "reject") => {
    setBusyRequest(request_id);
    try {
      const res = await fetch(DECIDE_MEMBERSHIP_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id, decision }),
      });
      if (await handleMembershipError(res)) return;
      setRequests((rs) => rs.filter((r) => r.request_id !== request_id));
      toast.success(decision === "approve" ? "Solicitud aprobada" : "Solicitud rechazada");
      // Refrescamos miembros al aprobar (el nuevo aparece en la lista).
      if (decision === "approve") {
        try {
          const res2 = await fetch(LIST_USERS_URL, { credentials: "include" });
          if (res2.ok) {
            const data = await res2.json();
            setMembers(Array.isArray(data?.users) ? data.users : []);
          }
        } catch {
          // silent
        }
      }
    } catch {
      toast.error("No se pudo procesar la solicitud");
    } finally {
      setBusyRequest(null);
    }
  };

  const removeMember = async () => {
    if (!removeTarget) return;
    const leavingSelf = removeTarget.user_id === user_id;
    setRemoving(true);
    try {
      const res = await fetch(REMOVE_MEMBER_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: removeTarget.user_id }),
      });
      if (await handleMembershipError(res)) return;
      if (leavingSelf) {
        // We no longer belong here — refresh the session so company_id/fund_id
        // clears, then send them where NoMembershipScreen picks up.
        toast.success(`Saliste de ${role === "investor" ? "la organización" : "la startup"}`);
        await refreshSession();
        navigate("/", { replace: true });
        return;
      }
      setMembers((ms) => ms.filter((m) => m.user_id !== removeTarget.user_id));
      toast.success("Miembro eliminado");
      setRemoveTarget(null);
    } catch {
      toast.error(leavingSelf ? "No se pudo salir" : "No se pudo quitar al miembro");
    } finally {
      setRemoving(false);
    }
  };

  const toggleOwner = async (member: OrgMember, nextIsOwner: boolean) => {
    setOwnerBusyId(member.user_id);
    try {
      const res = await fetch(MANAGE_USERS_URL, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: member.user_id, is_owner: nextIsOwner }),
      });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) {
        let msg = "No se pudo actualizar.";
        try {
          const data = await res.json();
          msg = data?.error ?? msg;
        } catch {
          // keep default message
        }
        toast.error(msg);
        return;
      }
      setMembers((ms) =>
        ms.map((m) => (m.user_id === member.user_id ? { ...m, is_owner: nextIsOwner } : m))
      );
      toast.success(nextIsOwner ? "Ahora es owner" : "Ya no es owner");
      // Si me cambié el owner a mí mismo, la sesión (y el gating del resto de la
      // UI) queda desactualizada hasta refrescarla.
      if (member.user_id === user_id) await refreshSession();
    } catch {
      toast.error("No se pudo actualizar. Revisá tu conexión.");
    } finally {
      setOwnerBusyId(null);
    }
  };

  return (
    <section className="border border-border rounded-lg bg-card overflow-hidden">
      <div className="px-6 pt-6 pb-4 border-b border-border">
        <div className="flex items-center gap-2">
          <Users size={14} strokeWidth={1.5} className="text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground">
            {role === "investor" ? "Organización" : "Startup"}
          </h2>
        </div>
        {orgName && (
          <p className="text-xs text-muted-foreground mt-1 ml-6">{orgName}</p>
        )}
      </div>

      {requests.length > 0 && (
        <div className="px-6 py-5 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <Bell size={12} strokeWidth={1.5} className="text-muted-foreground" />
            <h3 className="text-xs font-medium text-foreground uppercase tracking-wide">
              Solicitudes pendientes ({requests.length})
            </h3>
          </div>
          <ul className="space-y-1">
            {requests.map((r) => (
              <li
                key={r.request_id}
                className="flex items-start gap-3 py-3 border-b border-border/50 last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{r.full_name || r.email}</div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">
                    {r.email} · {new Date(r.requested_at).toLocaleDateString("es-AR")}
                  </div>
                </div>
                {is_owner && (
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyRequest === r.request_id}
                      onClick={() => decide(r.request_id, "reject")}
                    >
                      Rechazar
                    </Button>
                    <Button
                      size="sm"
                      disabled={busyRequest === r.request_id}
                      onClick={() => decide(r.request_id, "approve")}
                    >
                      Aprobar
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="px-6 py-5">
        <h3 className="text-xs font-medium text-foreground uppercase tracking-wide mb-3">
          Miembros {members.length > 0 && `(${members.length})`}
        </h3>
        {!loadingMembers && members.length > 0 && !members.some((m) => m.is_owner) && (
          <p className="text-xs text-muted-foreground mb-3 border border-border rounded-md px-3 py-2 bg-muted/40">
            Todavía no hay ningún owner asignado — nadie puede aprobar solicitudes, invitar por
            mail ni editar {role === "investor" ? "esta organización" : "esta startup"} hasta que
            un admin de CloudValley le asigne el rol a alguien.
          </p>
        )}
        {loadingMembers ? (
          <LoadingState />
        ) : members.length === 0 ? (
          <p className="text-sm text-muted-foreground">No hay miembros para mostrar.</p>
        ) : (
          <ul className="space-y-1">
            {members.map((m) => {
              const isMe = m.user_id === user_id;
              return (
                <li
                  key={m.user_id}
                  className="flex items-center gap-3 py-3 border-b border-border/50 last:border-0"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">
                        {m.full_name || m.email}
                      </span>
                      {isMe && (
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          Vos
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {m.email}
                    </div>
                  </div>
                  {m.is_owner && (
                    <Badge className="shrink-0 gap-1 text-[10px] font-medium">
                      <Crown size={10} strokeWidth={1.5} />
                      Owner
                    </Badge>
                  )}
                  <Badge variant="secondary" className="shrink-0 text-[10px] font-medium">
                    {roleLabel(m.role)}
                  </Badge>
                  {is_owner && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground hover:text-foreground"
                      disabled={ownerBusyId === m.user_id}
                      onClick={() => toggleOwner(m, !m.is_owner)}
                      title={m.is_owner ? "Quitar owner" : "Hacer owner"}
                    >
                      <Crown size={14} strokeWidth={1.5} fill={m.is_owner ? "currentColor" : "none"} />
                    </Button>
                  )}
                  {!isMe && is_owner && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setRemoveTarget(m)}
                      title={`Quitar de la ${role === "investor" ? "organización" : "startup"}`}
                    >
                      <UserMinus size={14} strokeWidth={1.5} />
                    </Button>
                  )}
                  {isMe && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setRemoveTarget(m)}
                      title={`Salir de ${role === "investor" ? "la organización" : "la startup"}`}
                    >
                      <LogOut size={14} strokeWidth={1.5} />
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {removeTarget?.user_id === user_id
                ? `Salir de ${role === "investor" ? "la organización" : "la startup"}`
                : "Quitar miembro"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget?.user_id === user_id ? (
                <>
                  ¿Salir de {role === "investor" ? "esta organización" : "esta startup"}? Vas a perder acceso
                  hasta que te unas de nuevo o crees una propia.
                </>
              ) : (
                <>
                  ¿Quitar a{" "}
                  <span className="text-foreground font-medium">
                    {removeTarget?.full_name || removeTarget?.email}
                  </span>{" "}
                  de la {role === "investor" ? "organización" : "startup"}? Podrá volver a solicitar unirse más
                  tarde.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={removing}
              onClick={(e) => {
                e.preventDefault();
                removeMember();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing
                ? "Procesando…"
                : removeTarget?.user_id === user_id
                  ? "Salir"
                  : "Quitar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}