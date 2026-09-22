import { ReactNode, useEffect, useState } from "react";
import { Navigate, useNavigate, useLocation, Link, matchPath } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { LoadingState } from "@/components/LoadingState";
import { useAuth } from "@/contexts/AuthContext";
import { CompleteProfileScreen } from "@/components/CompleteProfileScreen";
import { LogOut, Settings as SettingsIcon, Moon, Sun, Sparkles, Search, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlatformAgentPanel } from "@/components/ai/PlatformAgentPanel";
import type { PlatformAgentSurface, PlatformAgentMetricFields } from "@/lib/aiInsights";
import { FORMULA_SYNTAX } from "@/lib/formulaEngine";
import { toPeriodString } from "@/lib/metricPeriod";
import { GlobalSearch, useGlobalSearchShortcut } from "@/components/investor/GlobalSearch";
import { AssistantContextProvider } from "@/contexts/AssistantContext";
import { useStartup } from "@/hooks/useStartup";

// Superficie por ruta portfolio-wide — todas comparten UNA sola
// conversación continua (ver key={assistantCompanyId ?? "portfolio"} más
// abajo, sin cambios respecto de antes del rediseño): navegar entre
// Overview/Portfolio/Reporting/Data Room/Tasks no reinicia el historial,
// solo cambia el surface que se manda en cada turno como pista de dónde
// está parado el investor. Company Workspace (/companies/:id) sigue
// teniendo su propio hilo por empresa, aparte.
const PORTFOLIO_WIDE_SURFACE_BY_PATH: { prefix: string; surface: PlatformAgentSurface }[] = [
  { prefix: "/overview", surface: "investor_overview" },
  { prefix: "/reporting", surface: "investor_reporting" },
  { prefix: "/data-room", surface: "investor_data_room" },
  { prefix: "/tasks", surface: "investor_tasks" },
];

function portfolioWideSurfaceForPath(pathname: string): PlatformAgentSurface {
  const match = PORTFOLIO_WIDE_SURFACE_BY_PATH.find((s) => pathname.startsWith(s.prefix));
  return match?.surface ?? "investor_portfolio";
}

// Mismo patrón que PORTFOLIO_WIDE_SURFACE_BY_PATH, del lado founder —
// refactor de Dashboard/Roadmap/Data Room (2026-09-04): el Asistente antes
// solo existía para role="investor", ahora también se habilita para
// role="user" (founder) en estas rutas, mismo componente y misma posición
// en el header.
//
// /metrics cubre también /metrics/:metricId (mismo componente Metrics.tsx
// para las dos rutas, ver App.tsx) — el prefijo alcanza. /reporting en
// cambio necesita match exacto: /reporting/:reportId es ReportEditor, una
// pantalla distinta con su Asistente propio (surface "report_editor") que
// NO se consolidó acá — su contexto (reportId/período/métrica con el panel
// de info abierto) es demasiado específico del editor como para resolverlo
// solo por URL sin acoplar este layout a su estado interno. Todo lo demás
// (Overview/Fuentes/Salud/Explorador de Metrics, y la lista de Reporting)
// si se consolidó: ver 2026-09-06 más abajo.
const FOUNDER_SURFACE_BY_PATH: { prefix: string; surface: PlatformAgentSurface; exact?: boolean }[] = [
  { prefix: "/roadmap", surface: "founder_roadmap" },
  { prefix: "/data-room", surface: "founder_data_room" },
  { prefix: "/metrics", surface: "metrics" },
  { prefix: "/reporting", surface: "reporting_list", exact: true },
];

function founderSurfaceForPath(pathname: string): PlatformAgentSurface {
  const match = FOUNDER_SURFACE_BY_PATH.find((s) => (s.exact ? pathname === s.prefix : pathname.startsWith(s.prefix)));
  return match?.surface ?? "founder_dashboard";
}

// Contrato 2026-09-06: el Asistente pasó a vivir SOLO en el header para
// founder — Metrics.tsx y Reporting.tsx (la lista, no ReportEditor) ya no
// arman su propio botón/panel, ver AssistantContext.tsx para cómo un
// componente anidado (ej. el detalle de una métrica) sigue pudiendo abrirlo.
// Antes de esto cada pantalla tenía el suyo (bug real encontrado en vivo
// 2026-09-05: /metrics y /reporting llegaron a mostrar DOS botones
// "Asistente" a la vez, el del header con la superficie equivocada porque
// FOUNDER_SURFACE_BY_PATH todavía no las cubría). /reporting/:reportId
// (ReportEditor) es la única excepción: sigue con su propio panel, no entra
// acá — ver el comentario de FOUNDER_SURFACE_BY_PATH.
function founderHeaderAssistantAvailable(pathname: string): boolean {
  if (pathname.startsWith("/dashboard")) return true;
  return FOUNDER_SURFACE_BY_PATH.some((s) => (s.exact ? pathname === s.prefix : pathname.startsWith(s.prefix)));
}

export function AppLayout({ children }: { children: ReactNode }) {
  const {
    user,
    loading: authLoading,
    isOrgViewer,
    isAdmin,
    role,
    company_id,
    company_name,
    fund_name,
    email,
    full_name,
    signOut,
    portfolio_company_ids,
    portfolio_company_names,
    avatar_url,
  } = useAuth();
  // Logo real de la startup en el header — solo existe para role="user"
  // (el fondo del investor todavía no tiene su propio logo, ver plan de
  // rediseño), useStartup ya no dispara si no aplica (enabled interno).
  const { startup } = useStartup();
  const orgLogoUrl = role === "user" ? startup?.logo_url ?? null : null;
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const [profilePromptDismissed, setProfilePromptDismissed] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState(false);
  // Global, no por-página — pero el contexto que le manda al agente SÍ
  // depende de dónde se lo abre: parado en el detalle de una company puntual
  // (/companies/:id) le manda esa company (surface investor_company); en
  // cualquier otra pantalla portfolio-wide de investor (Overview, Portfolio,
  // Reporting, Data Room, Tasks, Requisitos, Conexiones) es cross-company
  // (una de las surfaces de PORTFOLIO_WIDE_SURFACE_BY_PATH, companyId null).
  // Resuelto por URL, no por props del children — así no hay que enchufar
  // el botón pantalla por pantalla.
  const [assistantOpen, setAssistantOpen] = useState(false);
  // Draft de una métrica en edición sin guardar (MetricPropertyPanel.tsx,
  // vía AssistantContext) — se pasa al panel del header mientras dura esa
  // apertura puntual, se limpia al cerrar para no filtrarse a la próxima.
  const [assistantMetricFields, setAssistantMetricFields] = useState<PlatformAgentMetricFields | undefined>(undefined);
  const companyDetailMatch = matchPath("/companies/:companyId", location.pathname);
  // Founder en /metrics/:metricId (Metrics.tsx, surface "metrics" desde
  // 2026-09-06) — mismo criterio que companyDetailMatch: resuelto por URL,
  // no por props, así Metrics.tsx no necesita mantener su propio panel solo
  // para poder mandar qué métrica está abierta.
  const metricDetailMatch = matchPath("/metrics/:metricId", location.pathname);
  const assistantCompanyId =
    role === "user" ? company_id ?? null : companyDetailMatch?.params.companyId ?? null;
  const assistantSurface: PlatformAgentSurface =
    role === "admin"
      ? "admin_dashboard"
      : role === "user"
        ? founderSurfaceForPath(location.pathname)
        : assistantCompanyId
          ? "investor_company"
          : portfolioWideSurfaceForPath(location.pathname);
  // El del header es EL único Asistente del investor en toda la app, y desde
  // 2026-09-06 también el único del founder salvo ReportEditor (que sigue
  // con el suyo, ver comentario de FOUNDER_SURFACE_BY_PATH) — cubre
  // Dashboard/Roadmap/Data Room/Métricas/Reporting(lista). Admin se suma
  // 2026-09-21 (Fase 11 del plan de Admin, backend confirmado Bloque 6) —
  // una sola superficie ("admin_dashboard") en todas sus pantallas, sin
  // company_id (domain:"admin" lo maneja usePlatformAgent.ts).
  const showHeaderAssistant =
    role === "investor" || role === "admin" || (role === "user" && founderHeaderAssistantAvailable(location.pathname));

  // Global Search (⌘K) — investor, founder y (desde 2026-09-21, Fase 7 del
  // plan de Admin) admin. MVP client-side, ver GlobalSearch.tsx — con 0
  // companies de portfolio (caso founder) degrada bien: solo indexa los
  // atajos de navegación fijos, sin sección de empresas. Admin pide sus
  // propias listas perezosamente adentro de GlobalSearch (no hay fetch de
  // companies/users/funds acá arriba para ese rol).
  const [searchOpen, setSearchOpen] = useState(false);
  useGlobalSearchShortcut(role === "investor" || role === "user" || role === "admin" ? setSearchOpen : () => {});
  const searchCompanies = (portfolio_company_ids ?? []).map((id, i) => ({
    id,
    name: portfolio_company_names?.[i] ?? "—",
  }));

  useEffect(() => {
    setMountedTheme(true);
  }, []);

  useEffect(() => {
    // Los inversores viven en modo lectura dentro de estas pantallas, pero
    // igual necesitan poder editar su perfil (/account) y la configuración
    // de su fondo (/settings) — no solo navegar el portfolio. /reporting y
    // /data-room son las mismas rutas del founder, role-branched
    // internamente (ver Reporting.tsx/DataRoom.tsx) — no hacen falta acá
    // como excepción, ya las cubre startsWith implícito... salvo que si
    // están explícitas es más legible, así que se listan igual.
    const allowedForOrgViewer =
      location.pathname.startsWith("/overview") ||
      location.pathname.startsWith("/portfolio") ||
      location.pathname.startsWith("/companies") ||
      location.pathname.startsWith("/reporting") ||
      location.pathname.startsWith("/data-room") ||
      location.pathname.startsWith("/tasks") ||
      location.pathname === "/account" ||
      location.pathname === "/settings" ||
      location.pathname === "/conexiones" ||
      location.pathname === "/requisitos" ||
      location.pathname === "/analiticas"; // ruta vieja, redirige sola (ver App.tsx)
    if (!authLoading && user && isOrgViewer && !allowedForOrgViewer) {
      navigate("/overview", { replace: true });
    }
    // Los usuarios sin company_id ahora ven la pantalla "sin empresa" dentro del
    // Dashboard en lugar de ser redirigidos al onboarding público.
  }, [authLoading, user, isOrgViewer, location.pathname, navigate]);

  if (authLoading) {
    return <LoadingState variant="fullScreen" />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Alguien que se sumó vía invitación (accept-invite no pide nombre, ver
  // CodeInvite) todavía no tiene full_name — antes de mostrarle el resto de
  // la plataforma, pedírselo con la misma estética que el onboarding de
  // autoservicio, no un popup.
  if (!full_name?.trim() && !profilePromptDismissed) {
    return <CompleteProfileScreen onSkip={() => setProfilePromptDismissed(true)} />;
  }

  const orgLabel = role === "user" ? company_name : role === "investor" ? fund_name : null;
  const displayName = full_name?.trim() || email || "Mi cuenta";

  return (
    <AssistantContextProvider
      value={{
        openAssistant: (opts) => {
          setAssistantMetricFields(opts?.metricFields);
          setAssistantOpen(true);
        },
      }}
    >
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-3 focus:py-2 focus:rounded-md focus:bg-foreground focus:text-background focus:text-sm"
      >
        Saltar al contenido
      </a>
      <div className="app-shell min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="sticky top-0 z-40 h-14 flex items-center justify-between border-b border-border bg-background/95 backdrop-blur px-4 gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="md:hidden">
                <SidebarTrigger />
              </div>
              <Link to="/" className="md:hidden inline-flex items-center gap-2 text-base font-medium tracking-tight text-foreground shrink-0">
                <img src="/logo.svg" alt="" className="h-6 w-6 shrink-0" />
                CloudValley
              </Link>
              {orgLabel && (
                <span className="flex items-center gap-2 min-w-0">
                  <span className="text-muted-foreground/50 md:hidden">/</span>
                  <Avatar className="h-6 w-6 rounded-md shrink-0 hidden md:flex">
                    <AvatarImage src={orgLogoUrl ?? undefined} alt="" />
                    <AvatarFallback className="rounded-md text-[10px] font-semibold">
                      <Building2 size={12} strokeWidth={1.5} />
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm font-medium text-foreground truncate min-w-0">{orgLabel}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(role === "investor" || role === "user" || role === "admin") && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSearchOpen(true)}
                  aria-label="Buscar (Ctrl/Cmd K)"
                  className="text-muted-foreground hover:text-foreground"
                >
                  <Search size={14} className="sm:mr-1.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Buscar</span>
                </Button>
              )}
              {showHeaderAssistant && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setAssistantOpen(true)}
                  aria-label="Asistente"
                  className="border-primary/40 bg-primary-subtle text-primary-dark hover:bg-primary-subtle/70 gap-1.5"
                >
                  <Sparkles size={14} aria-hidden="true" />
                  <span className="hidden sm:inline">Asistente</span>
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="text-muted-foreground hover:text-foreground"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                aria-label={mountedTheme && resolvedTheme === "dark" ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
              >
                {mountedTheme && resolvedTheme === "dark" ? (
                  <Sun size={16} strokeWidth={1.5} />
                ) : (
                  <Moon size={16} strokeWidth={1.5} />
                )}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2 pl-1.5 pr-2.5 text-muted-foreground hover:text-foreground">
                    <Avatar className="h-6 w-6">
                      <AvatarImage src={avatar_url ?? undefined} alt="" />
                      <AvatarFallback className="text-[10px] font-semibold">
                        {displayName.trim().slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="hidden md:inline text-sm max-w-[180px] truncate">{displayName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex items-center gap-2.5">
                    <Avatar className="h-8 w-8 shrink-0">
                      <AvatarImage src={avatar_url ?? undefined} alt="" />
                      <AvatarFallback className="text-[11px] font-semibold">
                        {displayName.trim().slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="min-w-0 flex flex-col gap-0.5">
                      <span className="truncate text-sm font-normal">{displayName}</span>
                      {full_name && email && (
                        <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
                      )}
                    </span>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/settings")}>
                    <SettingsIcon size={14} strokeWidth={1.5} className="mr-2" />
                    Configuración
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                    <LogOut size={14} strokeWidth={1.5} className="mr-2" />
                    Cerrar sesión
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto focus:outline-none">{children}</main>
        </div>
      </div>

      {(role === "investor" || role === "user" || role === "admin") && (
        <GlobalSearch
          open={searchOpen}
          onOpenChange={setSearchOpen}
          companies={searchCompanies}
          role={role}
          companyId={company_id}
        />
      )}

      {showHeaderAssistant && (
        <PlatformAgentPanel
          key={assistantCompanyId ?? "portfolio"}
          open={assistantOpen}
          onOpenChange={(o) => {
            setAssistantOpen(o);
            // Un metricFields de un draft puntual (MetricPropertyPanel.tsx)
            // no debe sobrevivir a este cierre — la próxima apertura, desde
            // donde sea, arranca limpia.
            if (!o) setAssistantMetricFields(undefined);
          }}
          companyId={assistantCompanyId}
          surface={assistantSurface}
          metricFields={assistantMetricFields}
          uiContext={{
            // Solo se resuelve para founder en /metrics/:metricId — el resto
            // de las superficies (incluida investor) no lo necesitaban antes
            // y siguen sin necesitarlo.
            selectedMetricId: role === "user" ? (metricDetailMatch?.params.metricId ?? null) : null,
            selectedCategoryId: null,
            selectedReportId: null,
            // "Ahora mismo" siempre — mismo valor que mandaban los paneles
            // propios de Metrics.tsx/Reporting.tsx (ninguno rastreaba período
            // navegado, ni siquiera Explorador pese a tener su propio
            // año/mes en pantalla), así que no se pierde precisión real acá.
            currentPeriodId: toPeriodString(new Date().getMonth() + 1, new Date().getFullYear()),
            // Confirmado por backend: el agente resuelve comparaciones de
            // portfolio incluso en investor_company sin mandar nada
            // distinto acá — no hace falta poblar estos campos solo para
            // habilitar esa pregunta.
            selectedCompanyIds: null,
            selectedMetricIds: null,
            selectedRange: null,
            selectedSegmentId: null,
          }}
          // Antes solo lo mandaban los PlatformAgentPanel propios de cada
          // página (retirados de Metrics.tsx/Reporting.tsx/
          // MetricPropertyPanel.tsx, ver comentario de
          // FOUNDER_SURFACE_BY_PATH — ReportEditor.tsx es la única excepción
          // que sigue con el suyo) — el del header lo manda siempre ahora: es
          // inofensivo en superficies que no lo usan.
          formulaSyntax={FORMULA_SYNTAX}
          // Mismo motivo: los paneles propios recargaban solo sus datos
          // locales (financial.reload/reloadSources/loadReports) al
          // escribir. El del header no tiene esas funciones de cada página
          // — invalida todo lo cacheado por React Query en su lugar, que
          // logra el mismo resultado (la pantalla activa vuelve a pedir sus
          // datos) sin acoplar este layout al estado interno de cada una.
          onAgentWrote={() => queryClient.invalidateQueries()}
        />
      )}
    </SidebarProvider>
    </AssistantContextProvider>
  );
}
