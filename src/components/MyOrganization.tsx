import { useEffect, useState } from "react";
import { Copy, Check, Building2, Pencil, RefreshCw, User as UserIcon, Link2, Rocket } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  MANAGE_COMPANIES_URL,
  MANAGE_FUNDS_URL,
  handleMembershipError,
  entityWords,
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
  industry: string;
  website: string;
  target_raise_usd: number | null;
  cohort_number: number | null;
  cohort_year: number | null;
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
  industry: string | null;
  website: string | null;
  target_raise_usd: number | null;
  cohort_number: number | null;
  cohort_year: number | null;
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
  const { refreshSession, email, role } = useAuth();
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

  const [editingDetails, setEditingDetails] = useState(false);
  const [industryDraft, setIndustryDraft] = useState("");
  const [websiteDraft, setWebsiteDraft] = useState("");
  const [targetDraft, setTargetDraft] = useState("");
  const [cohortNumberDraft, setCohortNumberDraft] = useState("");
  const [cohortYearDraft, setCohortYearDraft] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(GET_MY_ORGANIZATION_URL, { credentials: "include" });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) {
        toast.error(`No se pudo cargar tu ${role === "user" ? "startup" : "organización"} (${res.status})`);
        return;
      }
      const raw = (await res.json()) as OrganizationResponse;
      // Tolerar distintas variantes de nombres de campos entre company/fund.
      const normalized: OrgInfo = {
        type: raw.type ?? (raw.fund_id ? "fund" : "company"),
        id: firstText(raw.id, raw.company_id, raw.fund_id),
        name: firstText(raw.name, raw.organization_name, raw.company_name, raw.fund_name),
        join_code: getJoinCode(raw),
        full_name: firstText(raw.full_name, raw.user_full_name, raw.member_full_name, raw.user_name),
        user_id: raw.user_id ?? raw.member_id ?? undefined,
        industry: raw.industry ?? "",
        website: raw.website ?? "",
        target_raise_usd: raw.target_raise_usd ?? null,
        cohort_number: raw.cohort_number ?? null,
        cohort_year: raw.cohort_year ?? null,
      };
      setOrg(normalized);
      setNameDraft(normalized.name);
      setFullNameDraft(normalized.full_name ?? "");
      setIndustryDraft(normalized.industry);
      setWebsiteDraft(normalized.website);
      setTargetDraft(normalized.target_raise_usd?.toString() ?? "");
      setCohortNumberDraft(normalized.cohort_number?.toString() ?? "");
      setCohortYearDraft(normalized.cohort_year?.toString() ?? "");
    } catch {
      toast.error(role === "user" ? "No se pudo cargar tu startup" : "No se pudo cargar tu organización");
    }
  };

  useEffect(() => {
    void load();
  }, []);

  if (!org) return null;

  const orgUrl = org.type === "company" ? MANAGE_COMPANIES_URL : MANAGE_FUNDS_URL;
  const idKey = org.type === "company" ? "company_id" : "fund_id";
  const w = entityWords(org.type === "fund");

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
      toast.success(`Nombre ${w.ofThe} ${w.noun} actualizado`);
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
      : `¿Generar un código para ${w.demonstrative} ${w.noun}?`;
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

  const saveDetails = async () => {
    setSavingDetails(true);
    try {
      const res = await fetch(orgUrl, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          [idKey]: org.id,
          name: org.name,
          industry: industryDraft.trim() || null,
          website: websiteDraft.trim() || null,
          target_raise_usd: targetDraft ? Number(targetDraft) : null,
          cohort_number: cohortNumberDraft ? Number(cohortNumberDraft) : null,
          cohort_year: cohortYearDraft ? Number(cohortYearDraft) : null,
        }),
      });
      if (await handleMembershipError(res)) return;
      toast.success("Detalles actualizados");
      setEditingDetails(false);
      await load();
    } finally {
      setSavingDetails(false);
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
          <h2 className="text-sm font-medium text-foreground">
            {org.type === "company" ? "Mi startup" : "Mi organización"}
          </h2>
        </div>

        {/* Nombre */}
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
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md border border-border bg-surface font-mono text-sm tracking-widest hover:border-foreground/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
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

      {/* Detalles de la startup (solo startups) */}
      {org.type === "company" && (
        <div className="border-t border-border pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Rocket size={14} strokeWidth={1.5} className="text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">Detalles de la startup</h2>
            </div>
            {!editingDetails && (
              <button
                type="button"
                onClick={() => setEditingDetails(true)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <Pencil size={12} strokeWidth={1.5} />
                Editar
              </button>
            )}
          </div>

          {editingDetails ? (
            <div className="space-y-3">
              <div>
                <span className="text-xs text-muted-foreground mb-1 block">Industria</span>
                <Input value={industryDraft} onChange={(e) => setIndustryDraft(e.target.value)} className="h-9" />
              </div>
              <div>
                <span className="text-xs text-muted-foreground mb-1 block">Website</span>
                <Input
                  type="url"
                  placeholder="https://"
                  value={websiteDraft}
                  onChange={(e) => setWebsiteDraft(e.target.value)}
                  className="h-9"
                />
              </div>
              <div>
                <span className="text-xs text-muted-foreground mb-1 block">Objetivo de ronda (USD)</span>
                <Input
                  type="number"
                  value={targetDraft}
                  onChange={(e) => setTargetDraft(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-muted-foreground mb-1 block">Nº de cohort</span>
                  <Input
                    type="number"
                    min="1"
                    value={cohortNumberDraft}
                    onChange={(e) => setCohortNumberDraft(e.target.value)}
                    className="h-9"
                  />
                </div>
                <div>
                  <span className="text-xs text-muted-foreground mb-1 block">Año del cohort</span>
                  <Input
                    type="number"
                    min="2000"
                    max="2100"
                    value={cohortYearDraft}
                    onChange={(e) => setCohortYearDraft(e.target.value)}
                    className="h-9"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={saveDetails} disabled={savingDetails}>
                  {savingDetails ? "Guardando…" : "Guardar cambios"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingDetails(false);
                    setIndustryDraft(org.industry);
                    setWebsiteDraft(org.website);
                    setTargetDraft(org.target_raise_usd?.toString() ?? "");
                    setCohortNumberDraft(org.cohort_number?.toString() ?? "");
                    setCohortYearDraft(org.cohort_year?.toString() ?? "");
                  }}
                >
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Industria</dt>
                <dd className="text-foreground">{org.industry || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Website</dt>
                <dd className="text-foreground truncate">{org.website || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Objetivo de ronda</dt>
                <dd className="text-foreground">
                  {org.target_raise_usd != null ? `USD ${org.target_raise_usd.toLocaleString()}` : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Cohort</dt>
                <dd className="text-foreground">
                  {org.cohort_number != null ? `#${org.cohort_number}${org.cohort_year ? ` · ${org.cohort_year}` : ""}` : "—"}
                </dd>
              </div>
            </dl>
          )}
        </div>
      )}

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