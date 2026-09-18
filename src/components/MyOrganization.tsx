import { useEffect, useState } from "react";
import { Copy, Check, Building2, Pencil, RefreshCw, Link2, Rocket, Mail } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/FormActions";
import { FormField } from "@/components/FormField";
import { LoadingCard } from "@/components/LoadingCard";
import { ImageUploadField } from "@/components/ImageUploadField";
import {
  MANAGE_COMPANIES_URL,
  MANAGE_FUNDS_URL,
  handleMembershipError,
  entityWords,
} from "@/lib/membership";
import { useAuth } from "@/contexts/AuthContext";
import { useStartup } from "@/hooks/useStartup";
import { useImageUpload } from "@/hooks/useImageUpload";
import { API_BASE_URL } from "@/lib/apiConfig";

const GET_MY_ORGANIZATION_URL = `${API_BASE_URL}/get-my-organization`;
const INVITE_MEMBER_BY_EMAIL_URL = `${API_BASE_URL}/invite-member-by-email`;

type OrgInfo = {
  type: "company" | "fund";
  id: string;
  name: string;
  join_code: string;
  is_owner: boolean;
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
  is_owner: boolean;
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

export function MyOrganization() {
  const { refreshSession, role, company_id } = useAuth();
  // logo_url/vertical/linkedin_url/website_url viven en get-company-profile,
  // no en get-my-organization (endpoint que arma el resto de este
  // componente) — se leen del hook que ya usa el resto de la app para lo
  // mismo, en vez de duplicar el fetch acá. Solo aplica a startups: el
  // backend de logo/vertical es company_id-only, no hay equivalente de
  // fondo todavía.
  const { startup, refetch: refetchStartup } = useStartup();
  const { upload: uploadLogo, uploading: uploadingLogo } = useImageUpload({ kind: "logo", companyId: company_id ?? "" });
  const [org, setOrg] = useState<OrgInfo | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [savingName, setSavingName] = useState(false);

  const [regenerating, setRegenerating] = useState(false);

  const [inviteEmail, setInviteEmail] = useState("");
  const [invitingByEmail, setInvitingByEmail] = useState(false);
  const [inviteEmailNote, setInviteEmailNote] = useState<string | null>(null);
  // 30s anti-spam cooldown after each attempt — in-memory only, backend enforces
  // its own 429 regardless, this is just to stop accidental double-clicks.
  const [inviteRetryAt, setInviteRetryAt] = useState(0);
  const [, tickInviteRetry] = useState(0);

  const [editingDetails, setEditingDetails] = useState(false);
  const [industryDraft, setIndustryDraft] = useState("");
  const [websiteDraft, setWebsiteDraft] = useState("");
  const [targetDraft, setTargetDraft] = useState("");
  const [cohortNumberDraft, setCohortNumberDraft] = useState("");
  const [cohortYearDraft, setCohortYearDraft] = useState("");
  const [verticalDraft, setVerticalDraft] = useState("");
  const [linkedinDraft, setLinkedinDraft] = useState("");
  const [websiteUrlDraft, setWebsiteUrlDraft] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);

  useEffect(() => {
    setVerticalDraft(startup?.vertical ?? "");
    setLinkedinDraft(startup?.linkedin_url ?? "");
    setWebsiteUrlDraft(startup?.website_url ?? "");
  }, [startup]);

  const handleLogoSelect = async (file: File) => {
    const ok = await uploadLogo(file);
    if (ok) refetchStartup();
  };

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
        is_owner: !!raw.is_owner,
        industry: raw.industry ?? "",
        website: raw.website ?? "",
        target_raise_usd: raw.target_raise_usd ?? null,
        cohort_number: raw.cohort_number ?? null,
        cohort_year: raw.cohort_year ?? null,
      };
      setOrg(normalized);
      setNameDraft(normalized.name);
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

  useEffect(() => {
    if (inviteRetryAt <= Date.now()) return;
    const id = setInterval(() => tickInviteRetry((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, [inviteRetryAt]);

  if (!org) return <LoadingCard lines={3} />;

  const inviteRetrySecondsLeft = Math.max(0, Math.ceil((inviteRetryAt - Date.now()) / 1000));

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

  const inviteByEmail = async () => {
    const next = inviteEmail.trim();
    if (!next || inviteRetrySecondsLeft > 0) return;
    setInvitingByEmail(true);
    setInviteEmailNote(null);
    try {
      const res = await fetch(INVITE_MEMBER_BY_EMAIL_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: next }),
      });
      if (res.status === 401) {
        window.location.assign("/login");
        return;
      }
      if (!res.ok) {
        let message = "No se pudo enviar la invitación.";
        try {
          const data = await res.json();
          message = data?.error ?? message;
        } catch {
          // keep default message
        }
        setInviteEmailNote(message);
        // 429 means "wait before trying again" — start the same cooldown as a
        // successful send so the button doesn't just invite another 429.
        if (res.status === 429) setInviteRetryAt(Date.now() + 30_000);
        return;
      }
      const data = await res.json().catch(() => null);
      toast.success(data?.message ?? "Si los datos son válidos, se envió la invitación.");
      setInviteEmail("");
      setInviteRetryAt(Date.now() + 30_000);
    } catch {
      setInviteEmailNote("No se pudo enviar la invitación. Revisá tu conexión.");
    } finally {
      setInvitingByEmail(false);
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
          ...(org.type === "company"
            ? {
                vertical: verticalDraft.trim() || null,
                linkedin_url: linkedinDraft.trim() || null,
                website_url: websiteUrlDraft.trim() || null,
              }
            : {}),
        }),
      });
      if (await handleMembershipError(res)) return;
      toast.success("Detalles actualizados");
      setEditingDetails(false);
      await load();
      if (org.type === "company") refetchStartup();
    } finally {
      setSavingDetails(false);
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
        {editingName ? (
          <div className="space-y-2">
            <Input
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              className="h-9"
              autoFocus
            />
            <FormActions
              onCancel={() => {
                setEditingName(false);
                setNameDraft(org.name);
              }}
              onSubmit={saveName}
              busy={savingName}
            />
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <div className="text-lg font-medium tracking-tight flex-1 min-w-0 truncate">
              {org.name}
            </div>
            {org.is_owner && (
              <button
                type="button"
                onClick={() => setEditingName(true)}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                title="Editar nombre"
              >
                <Pencil size={12} strokeWidth={1.5} />
                Editar
              </button>
            )}
          </div>
        )}

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
          {org.is_owner && (
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
          )}
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

        {org.is_owner && (
          <div className="mt-4 pt-4 border-t border-border">
            <p className="text-xs text-muted-foreground mb-2">O invitá directamente por email:</p>
            <div className="flex flex-wrap gap-2">
              <Input
                type="email"
                placeholder="email@ejemplo.com"
                aria-label="Email de la persona a invitar"
                value={inviteEmail}
                onChange={(e) => {
                  setInviteEmail(e.target.value);
                  setInviteEmailNote(null);
                }}
                className="h-9 flex-1 min-w-[180px]"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={inviteByEmail}
                disabled={invitingByEmail || !inviteEmail.trim() || inviteRetrySecondsLeft > 0}
              >
                <Mail size={12} strokeWidth={1.5} className="mr-1.5" />
                {invitingByEmail
                  ? "Enviando…"
                  : inviteRetrySecondsLeft > 0
                    ? `Esperá ${inviteRetrySecondsLeft}s`
                    : "Invitar por email"}
              </Button>
            </div>
            {inviteEmailNote && (
              <p className="text-xs text-muted-foreground mt-2" aria-live="polite">{inviteEmailNote}</p>
            )}
          </div>
        )}
      </div>

      {/* Detalles de la startup (solo startups) */}
      {org.type === "company" && (
        <div className="border-t border-border pt-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Rocket size={14} strokeWidth={1.5} className="text-muted-foreground" />
              <h2 className="text-sm font-medium text-foreground">Detalles de la startup</h2>
            </div>
            {!editingDetails && org.is_owner && (
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

          <div className="mb-4">
            <ImageUploadField
              imageUrl={startup?.logo_url ?? null}
              fallback={org.name.trim().slice(0, 2).toUpperCase()}
              shape="square"
              size={56}
              uploading={uploadingLogo}
              onSelect={handleLogoSelect}
              hint="PNG, JPG o WEBP, hasta 5MB."
            />
          </div>

          {editingDetails ? (
            <div className="space-y-3">
              <FormField label="Industria">
                <Input value={industryDraft} onChange={(e) => setIndustryDraft(e.target.value)} className="h-9" />
              </FormField>
              <FormField label="Vertical">
                <Input
                  placeholder="Ej: Fintech B2B"
                  value={verticalDraft}
                  onChange={(e) => setVerticalDraft(e.target.value)}
                  className="h-9"
                />
              </FormField>
              <FormField label="Website">
                <Input
                  type="url"
                  placeholder="https://"
                  value={websiteDraft}
                  onChange={(e) => setWebsiteDraft(e.target.value)}
                  className="h-9"
                />
              </FormField>
              <FormField label="Sitio web (público)">
                <Input
                  type="url"
                  placeholder="https://tuempresa.com"
                  value={websiteUrlDraft}
                  onChange={(e) => setWebsiteUrlDraft(e.target.value)}
                  className="h-9"
                />
              </FormField>
              <FormField label="LinkedIn">
                <Input
                  placeholder="linkedin.com/company/tu-startup"
                  value={linkedinDraft}
                  onChange={(e) => setLinkedinDraft(e.target.value)}
                  className="h-9"
                />
              </FormField>
              <FormField label="Objetivo de ronda (USD)">
                <Input
                  type="number"
                  value={targetDraft}
                  onChange={(e) => setTargetDraft(e.target.value)}
                  className="h-9"
                />
              </FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Nº de cohort">
                  <Input
                    type="number"
                    min="1"
                    value={cohortNumberDraft}
                    onChange={(e) => setCohortNumberDraft(e.target.value)}
                    className="h-9"
                  />
                </FormField>
                <FormField label="Año del cohort">
                  <Input
                    type="number"
                    min="2000"
                    max="2100"
                    value={cohortYearDraft}
                    onChange={(e) => setCohortYearDraft(e.target.value)}
                    className="h-9"
                  />
                </FormField>
              </div>
              <FormActions
                onCancel={() => {
                  setEditingDetails(false);
                  setIndustryDraft(org.industry);
                  setWebsiteDraft(org.website);
                  setTargetDraft(org.target_raise_usd?.toString() ?? "");
                  setCohortNumberDraft(org.cohort_number?.toString() ?? "");
                  setCohortYearDraft(org.cohort_year?.toString() ?? "");
                  setVerticalDraft(startup?.vertical ?? "");
                  setLinkedinDraft(startup?.linkedin_url ?? "");
                  setWebsiteUrlDraft(startup?.website_url ?? "");
                }}
                onSubmit={saveDetails}
                submitLabel="Guardar cambios"
                busy={savingDetails}
              />
            </div>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Industria</dt>
                <dd className="text-foreground">{org.industry || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Vertical</dt>
                <dd className="text-foreground">{startup?.vertical || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Website</dt>
                <dd className="text-foreground truncate">{org.website || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Sitio web</dt>
                <dd className="text-foreground truncate">{startup?.website_url || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">LinkedIn</dt>
                <dd className="text-foreground truncate">{startup?.linkedin_url || "—"}</dd>
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
    </section>
  );
}