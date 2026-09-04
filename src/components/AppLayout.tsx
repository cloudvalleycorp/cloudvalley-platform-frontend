import { ReactNode, useEffect, useState } from "react";
import { Navigate, useNavigate, useLocation, Link, matchPath } from "react-router-dom";
import { useTheme } from "next-themes";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { LoadingState } from "@/components/LoadingState";
import { useAuth } from "@/contexts/AuthContext";
import { CompleteProfileScreen } from "@/components/CompleteProfileScreen";
import { LogOut, Settings as SettingsIcon, UserCircle, Moon, Sun, Sparkles, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PlatformAgentPanel } from "@/components/ai/PlatformAgentPanel";
import type { PlatformAgentSurface } from "@/lib/aiInsights";
import { GlobalSearch, useGlobalSearchShortcut } from "@/components/investor/GlobalSearch";

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
// role="user" (founder) en estas 3 rutas, mismo componente y misma posición
// en el header.
const FOUNDER_SURFACE_BY_PATH: { prefix: string; surface: PlatformAgentSurface }[] = [
  { prefix: "/roadmap", surface: "founder_roadmap" },
  { prefix: "/data-room", surface: "founder_data_room" },
];

function founderSurfaceForPath(pathname: string): PlatformAgentSurface {
  const match = FOUNDER_SURFACE_BY_PATH.find((s) => pathname.startsWith(s.prefix));
  return match?.surface ?? "founder_dashboard";
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
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
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
  const companyDetailMatch = matchPath("/companies/:companyId", location.pathname);
  const assistantCompanyId =
    role === "user" ? company_id ?? null : companyDetailMatch?.params.companyId ?? null;
  const assistantSurface: PlatformAgentSurface =
    role === "user"
      ? founderSurfaceForPath(location.pathname)
      : assistantCompanyId
        ? "investor_company"
        : portfolioWideSurfaceForPath(location.pathname);

  // Global Search (⌘K) — investor y founder, mismo criterio de alcance que
  // el Asistente (antes investor-only). MVP client-side, ver GlobalSearch.tsx
  // — con 0 companies de portfolio (caso founder) degrada bien: solo indexa
  // los atajos de navegación fijos, sin sección de empresas.
  const [searchOpen, setSearchOpen] = useState(false);
  useGlobalSearchShortcut(role === "investor" || role === "user" ? setSearchOpen : () => {});
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
    <SidebarProvider>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-3 focus:py-2 focus:rounded-md focus:bg-foreground focus:text-background focus:text-sm"
      >
        Saltar al contenido
      </a>
      <div className="min-h-screen flex w-full bg-background">
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
                <span className="text-sm text-foreground truncate min-w-0">
                  <span className="text-muted-foreground/50 mr-2 md:hidden">/</span>
                  {orgLabel}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {(role === "investor" || role === "user") && (
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
              {(role === "investor" || role === "user") && (
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
                  <Button variant="ghost" size="sm" className="gap-2 text-muted-foreground hover:text-foreground">
                    <UserCircle size={18} strokeWidth={1.5} />
                    <span className="hidden md:inline text-sm max-w-[180px] truncate">{displayName}</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="truncate text-sm">{displayName}</span>
                    {full_name && email && (
                      <span className="truncate text-xs font-normal text-muted-foreground">{email}</span>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("/account")}>
                    <UserCircle size={14} strokeWidth={1.5} className="mr-2" />
                    Actualizar mis datos
                  </DropdownMenuItem>
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

      {(role === "investor" || role === "user") && (
        <GlobalSearch
          open={searchOpen}
          onOpenChange={setSearchOpen}
          companies={searchCompanies}
          role={role}
          companyId={company_id}
        />
      )}

      {(role === "investor" || role === "user") && (
        <PlatformAgentPanel
          key={assistantCompanyId ?? "portfolio"}
          open={assistantOpen}
          onOpenChange={setAssistantOpen}
          companyId={assistantCompanyId}
          surface={assistantSurface}
          uiContext={{
            selectedMetricId: null,
            selectedCategoryId: null,
            selectedReportId: null,
            currentPeriodId: null,
            // Confirmado por backend: el agente resuelve comparaciones de
            // portfolio incluso en investor_company sin mandar nada
            // distinto acá — no hace falta poblar estos campos solo para
            // habilitar esa pregunta.
            selectedCompanyIds: null,
            selectedMetricIds: null,
            selectedRange: null,
            selectedSegmentId: null,
          }}
        />
      )}
    </SidebarProvider>
  );
}
