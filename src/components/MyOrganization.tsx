import { useEffect, useState } from "react";
import { Copy, Check, Building2, Pencil, RefreshCw, User as UserIcon, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  MANAGE_COMPANIES_URL,
  MANAGE_FUNDS_URL,
  handleMembershipError,
} from "@/lib/membership";
import { useAuth } from "@/contexts/AuthContext";

const GET_MY_ORGANIZATION_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/get-my-organization";
const MANAGE_USERS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/manage-users";

type OrgInfo = {
  type: "company" | "fund";
  id: string;
  name: string;
  join_code: string;
  full_name?: string;
  user_id?: string;
};

type OrganizationResponse = Partial<{
  type: "company" | "fund";
  id: string;
  company_id: string;
  fund_id: string;
  name: string;
  organization_name: string;
  company_name: string;
  fund_name: string;
  join_code: string | null;
  fund_join_code: string | null;
  company_join_code: string | null;
  code: string | null;
  invite_code: string | null;
  invitation_code: string | null;
  new_join_code: string | null;
  joinCode: string | null;
  inviteCode: string | null;
  full_name: string;
  user_full_name: string;
  member_full_name: string;
  user_name: string;
  user_id: string;
  member_id: string;
}>;

const firstText = (...values: Array<string | null | undefined>) =>
  values.find((value) => typeof value === "string" && value.trim().length > 0) ?? "";

const getJoinCode = (raw: OrganizationResponse | null | undefined) =>
  firstText(
    raw?.join_code,
    raw?.fund_join_code,
    raw?.company_join_code,
    raw?.code,
    raw?.invite_code,
    raw?.invitation_code,
    raw?.new_join_code,
    raw?.joinCode,
    raw?.inviteCode
  );

export function MyOrganization({ hideProfile = false }: { hideProfile?: boolean } = {}) {
  const { refreshSession, email } = useAuth();
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [editingFullName, setEditingFullName] = useState(false);
  const [fullNameDraft, setFullNameDraft] = useState("");
  const [savingFullName, setSavingFullName] = useState(false);

  const [regenerating, setRegenerating] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(GET_MY_ORGANIZATION_URL, { credentials: "include" });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) return;
      const raw = (await res.json()) as OrganizationResponse;
      // Tolerar distintas variantes de nombres de campos entre company/fund.
      const normalized: OrgInfo = {
        type: raw.type ?? (raw.fund_id ? "fund" : "company"),
        id: firstText(raw.id, raw.company_id, raw.fund_id),
        name: firstText(raw.name, raw.organization_name, raw.company_name, raw.fund_name),
        join_code: getJoinCode(raw),
        full_name: firstText(raw.full_name, raw.user_full_name, raw.member_full_name, raw.user_name),
        user_id: raw.user_id ?? raw.member_id ?? undefined,
      };
      setOrg(normalized);
      setNameDraft(normalized.name);
      setFullNameDraft(normalized.full_name ?? "");
    } catch {
      // silencioso
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (!org) return null;

  const orgUrl = org.type === "company" ? MANAGE_COMPANIES_URL : MANAGE_FUNDS_URL;
  const idKey = org.type === "company" ? "company_id" : "fund_id";
  const labelOrg = org.type === "company" ? "empresa" : "fondo";

  const copy = async () => {
    if (!org.join_code) return;
    try {
      await navigator.clipboard.writeText(org.join_code);
      setCopied(true);
      toast.success("Código copiado");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const copyInviteLink = async () => {
    if (!org.join_code) return;
    const url = `${window.location.origin}/onboarding?code=${encodeURIComponent(org.join_code)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLink(true);
      toast.success("Enlace copiado");
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const saveName = async () => {
    const next = nameDraft.trim();
    if (!next || next === org.name) {
      setEditingName(false);
      return;
    }
    setSavingName(true);
    try {
      const res = await fetch(orgUrl, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [idKey]: org.id, name: next }),
      });
      if (await handleMembershipError(res)) return;
      toast.success(`Nombre del ${labelOrg} actualizado`);
      setEditingName(false);
      await load();
      await refreshSession();
    } finally {
      setSavingName(false);
    }
  };

  const regenerate = async () => {
    const message = org.join_code
      ? "¿Regenerar el código? El código anterior dejará de funcionar."
      : `¿Generar un código para este ${labelOrg}?`;
    if (!confirm(message)) return;
    setRegenerating(true);
    try {
      const res = await fetch(orgUrl, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "regenerate_code", [idKey]: org.id }),
      });
      if (await handleMembershipError(res)) return;
      const data = await res.json().catch(() => null);
      const nextCode = getJoinCode(data);
      if (nextCode) {
        setOrg((prev) => (prev ? { ...prev, join_code: nextCode } : prev));
      } else {
        await load();
      }
      toast.success(org.join_code ? "Código regenerado" : "Código generado");
    } finally {
      setRegenerating(false);
    }
  };

  const saveFullName = async () => {
    const next = fullNameDraft.trim();
    if (!next || next === (org.full_name ?? "")) {
      setEditingFullName(false);
      return;
    }
    setSavingFullName(true);
    try {
      const body: Record<string, unknown> = { full_name: next };
      if (org.user_id) body.user_id = org.user_id;
      else if (email) body.email = email;
      const res = await fetch(MANAGE_USERS_URL, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (await handleMembershipError(res)) return;
      toast.success("Nombre actualizado");
      setEditingFullName(false);
      await load();
    } finally {
      setSavingFullName(false);
    }
  };

  return (
    <section className="border border-border rounded-lg p-6 bg-card space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Building2 size={14} strokeWidth={1.5} className="text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground">Mi organización</h2>
        </div>

        {/* Nombre de la organización */}
        <div className="flex flex-wrap items-center gap-3">
          {editingName ? (
            <>
              <Input
                value={nameDraft}
                onChange={(e) => setNameDraft(e.target.value)}
                className="h-9 flex-1 min-w-[200px]"
                autoFocus
              />
              <Button size="sm" onClick={saveName} disabled={savingName}>
                {savingName ? "Guardando…" : "Guardar"}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingName(false);
                  setNameDraft(org.name);
                }}
              >
                Cancelar
              </Button>
            </>
          ) : (
            <>
              <div className="text-lg font-medium tracking-tight flex-1 min-w-0 truncate">
                {org.name}
              </div>
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                title="Editar nombre"
              >
                <Pencil size={12} strokeWidth={1.5} />
                Editar
              </button>
            </>
          )}
        </div>

        {/* Código de invitación */}
        <div className="mt-4 flex flex-wrap items-center gap-3">
          {org.join_code ? (
            <button
              type="button"
              onClick={copy}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-surface font-mono text-sm tracking-widest hover:border-foreground/40 transition-all"
              title="Copiar código"
            >
              <span>{org.join_code}</span>
              {copied ? (
                <Check size={14} strokeWidth={1.5} className="text-foreground" />
              ) : (
                <Copy size={14} strokeWidth={1.5} className="text-muted-foreground" />
              )}
            </button>
          ) : (
            <span className="inline-flex items-center px-3 py-1.5 rounded-md border border-border bg-muted text-xs text-muted-foreground">
              Código no disponible
            </span>
          )}
          <button
            type="button"
            onClick={regenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
            title={org.join_code ? "Regenerar código" : "Generar código"}
          >
            <RefreshCw size={12} strokeWidth={1.5} />
            {regenerating ? "Generando…" : org.join_code ? "Regenerar" : "Generar"}
          </button>
        </div>
        {org.join_code && (
          <div className="mt-3">
            <button
              type="button"
              onClick={copyInviteLink}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              {copiedLink ? (
                <Check size={12} strokeWidth={1.5} />
              ) : (
                <Link2 size={12} strokeWidth={1.5} />
              )}
              {copiedLink ? "Enlace copiado" : "Compartir enlace de invitación"}
            </button>
          </div>
        )}
        <p className="text-xs text-muted-foreground mt-3">
          Compartí este código con las personas de tu equipo para que puedan unirse.
        </p>
      </div>

      {/* Perfil */}
      {!hideProfile && (
      <div className="border-t border-border pt-6">
        <div className="flex items-center gap-2 mb-4">
          <UserIcon size={14} strokeWidth={1.5} className="text-muted-foreground" />
          <h2 className="text-sm font-medium text-foreground">Mi perfil</h2>
        </div>
        <div className="space-y-3">
          <div>
            <div className="text-xs text-muted-foreground mb-1">Email</div>
            <div className="text-sm text-foreground">{email ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground mb-1">Nombre completo</div>
            {editingFullName ? (
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  value={fullNameDraft}
                  onChange={(e) => setFullNameDraft(e.target.value)}
                  className="h-9 flex-1 min-w-[200px]"
                  autoFocus
                />
                <Button size="sm" onClick={saveFullName} disabled={savingFullName}>
                  {savingFullName ? "Guardando…" : "Guardar"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingFullName(false);
                    setFullNameDraft(org.full_name ?? "");
                  }}
                >
                  Cancelar
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <div className="text-sm text-foreground flex-1">
                  {org.full_name || <span className="text-muted-foreground">—</span>}
                </div>
                <button
                  type="button"
                  onClick={() => setEditingFullName(true)}
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                  title="Editar nombre"
                >
                  <Pencil size={12} strokeWidth={1.5} />
                  Editar
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      )}
    </section>
  );
}