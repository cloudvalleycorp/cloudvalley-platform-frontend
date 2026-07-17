# Migración Supabase → GCP

Estado del inventario y plan de migración del frontend, de Supabase hacia la infraestructura GCP (auth-gateway + Cloud Functions). Este documento se actualiza a medida que existan nuevos endpoints en GCP para cada dominio.

## Hallazgo crítico — confirmar antes de seguir

El frontend **nunca llama a `supabase.auth.*`** (`src/integrations/supabase/client.ts` solo usa la anon key, sin sesión ni token custom inyectado). Todas las RLS policies del schema son `to authenticated using (auth.uid() = ...)`. Salvo que Supabase tenga **Third-Party Auth** configurado en el dashboard (fuera de este repo) para confiar en el JWT del auth-gateway, `auth.uid()` es `NULL` en cada request desde el navegador y esas policies deberían estar bloqueando todo.

Evidencia concreta: la RPC `create_startup_with_member` (llamada desde `Onboarding.tsx` al dar de alta una startup) tiene `IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'` — el alta de startups debería estar fallando siempre bajo esta hipótesis.

**Pendiente de confirmar con el equipo backend**: ¿está configurado Third-Party Auth en Supabase? Esto determina si Roadmap/DataRoom/Organizations/etc. funcionan hoy de verdad o están de facto rotos.

## Estado por dominio

| Dominio Supabase | Usado en (frontend) | Reemplazo GCP | Estado |
|---|---|---|---|
| Auth / Identidad (login, sesión, roles) | `AuthContext.tsx`, `Login.tsx`, `Onboarding.tsx` | auth-gateway (`auth-*`) | ✅ Migrado — el frontend nunca usó Supabase Auth de forma real |
| Companies / Funds / Users (identidad org) | `AdminUsers.tsx`, `AdminFunds.tsx`, `AdminCompanies.tsx`, `MyOrganization.tsx`, `OrganizationSection.tsx` | `org-manage-companies`, `org-manage-funds`, `org-manage-users`, `org-list-*`, `org-get-my-organization`, `org-request-membership`, `org-list-membership-requests`, `org-decide-membership`, `org-remove-member` | ✅ Migrado |
| Métricas | `Metrics.tsx`, `src/components/metrics/*`, tab "Métricas" de `PortfolioStartup.tsx` | — | ⏸️ Fuera de alcance (decisión explícita del producto, no tocar) |
| Organizations / Portfolio / Connections | `AdminOrganizations.tsx`, `Connections.tsx`, `OrganizationsPicker.tsx` (en `Settings.tsx`), `Portfolio*.tsx`, `InvestorPortfolio.tsx`, `InvestorCompany.tsx` | Cloud Function nueva — dominio propio, **no existe todavía** | 🔴 Bloqueado |
| Startups (CRUD, onboarding) | `Settings.tsx`, `Onboarding.tsx`, `AdminStartup.tsx`, `useStartup.ts` | Cloud Function nueva — **no existe** | 🔴 Bloqueado |
| Roadmap | `Roadmap.tsx`, `Dashboard.tsx`, `PortfolioStartup.tsx` | Cloud Function nueva — **no existe** | 🔴 Bloqueado |
| Data Room (docs + storage) | `DataRoom.tsx`, `PortfolioStartup.tsx` | Cloud Function + Cloud Storage — **no existe** | 🔴 Bloqueado |
| Admin notes | `AdminStartup.tsx` | Cloud Function nueva — **no existe** | 🔴 Bloqueado |
| Integrations (Stripe/Mercury/Amplitude) | `IntegrationsSection.tsx` + edge function `integrations` | Cloud Function nueva — **no existe** | 🔴 Bloqueado (además ya depende de Supabase Auth real vía `supabase.auth.getUser()`, ver hallazgo crítico) |
| `invite-org-viewer` (edge function) | `InviteViewerDialog.tsx` | Depende del dominio Organizations/Portfolio | 🔴 Bloqueado |

**Conclusión**: hoy no hay código de Supabase que se pueda retirar sin romper funcionalidad — lo único con reemplazo GCP (Auth/Identidad) ya está migrado en el frontend; todo lo demás no tiene backend a dónde apuntar todavía. Sacar Supabase ahora apagaría Roadmap, Data Room, Organizations/Portfolio/Connections, notas de admin e integraciones sin reemplazo.

## Inventario técnico completo

### Base de datos (20 tablas, todas con RLS)

- **Startup / producto core**: `startups`, `startup_members`, `admin_notes`, `score_snapshots`
- **Métricas**: `metric_definitions`, `metric_entries`, `metric_configs`, `metric_privacy`, `metric_source_mapping`
- **Roadmap**: `roadmap_pillars`, `roadmap_tasks`, `startup_tasks`
- **Data Room**: `documents`, `document_privacy`, `document_requests`
- **Organizaciones (portfolio)**: `organizations`, `organization_members`, `organization_invitations`, `startup_organizations`, `connection_requests`
- **Identidad (vestigial)**: `profiles`, `user_roles` — de la arquitectura Lovable/Supabase Auth original, hoy desconectados del alta real de usuarios (eso pasa por el auth-gateway)
- **Integraciones**: `startup_integrations` (secretos, solo vía edge function con service role)

**Funciones/RPC**: `has_role`, `is_startup_member`, `is_organization_member`, `is_startup_in_user_orgs`, `can_invite_to_org`, `create_startup_with_member` (RPC, llamada desde `Onboarding.tsx`), `accept_pending_invitations`, `handle_new_user` (trigger en `auth.users`, nunca se dispara hoy), `set_updated_at`.

### Storage

Un bucket privado: **`documents`**. Usado desde `DataRoom.tsx` (upload/remove/`createSignedUrl`), `Roadmap.tsx` (upload de evidencia), `PortfolioStartup.tsx` (`createSignedUrl` para investors).

### Edge Functions (`supabase/functions/`)

| Función | Invocada desde | Qué hace |
|---|---|---|
| `integrations` | `IntegrationsSection.tsx` | CRUD de conexiones Stripe/Mercury/Amplitude sobre `startup_integrations`; usa `supabase.auth.getUser()` internamente |
| `invite-org-viewer` | `InviteViewerDialog.tsx` | Invita un viewer a una organización; usa `adminClient.auth.admin.inviteUserByEmail`/`generateLink` — depende 100% de Supabase Auth nativo |
| `sync-all-integrations` | Nadie desde el frontend (cron vía pg_cron) | Sincroniza todas las integraciones conectadas |

### Realtime

Cero uso. Ningún `supabase.channel(...)` en todo el proyecto.

### Variables de entorno

```
VITE_SUPABASE_PROJECT_ID=nqkhozknxxmmzzzjenmu
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key JWT>
VITE_SUPABASE_URL=https://nqkhozknxxmmzzzjenmu.supabase.co
```

### Lovable

Ya limpiado del repo (dependencia `lovable-tagger`, `.lovable/`, meta tags de `index.html`, README genérico). No queda nada pendiente de Lovable.

## Próximos pasos

1. Confirmar con el equipo backend si Third-Party Auth está configurado en Supabase (hallazgo crítico de arriba).
2. Definir prioridad de qué dominio bloqueado consigue Cloud Function primero (Organizations/Portfolio, Startups, Roadmap o Data Room).
3. Cuando exista el primer endpoint nuevo, retomar este documento y mover esa fila de 🔴 Bloqueado a ✅ Migrado, actualizando el mapeo de archivos frontend afectados.
