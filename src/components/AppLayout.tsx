import { ReactNode, useEffect, useState } from "react";
import { Navigate, useNavigate, useLocation, Link } from "react-router-dom";
import { useTheme } from "next-themes";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { LoadingState } from "@/components/LoadingState";
import { useAuth } from "@/contexts/AuthContext";
import { useStartup } from "@/hooks/useStartup";
import { CompleteProfileScreen } from "@/components/CompleteProfileScreen";
import { LogOut, Settings as SettingsIcon, UserCircle, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, loading: authLoading, isOrgViewer, isAdmin, role, company_id, company_name, fund_name, email, full_name, signOut } = useAuth();
  const { startup, loading: startupLoading } = useStartup();
  const navigate = useNavigate();
  const location = useLocation();
  const [profilePromptDismissed, setProfilePromptDismissed] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const [mountedTheme, setMountedTheme] = useState(false);

  useEffect(() => {
    setMountedTheme(true);
  }, []);

  useEffect(() => {
    // Los inversores viven en modo lectura dentro de /portfolio, pero igual
    // necesitan poder editar su perfil (/account) y la configuración de su
    // fondo (/settings) — no solo navegar el portfolio.
    const allowedForOrgViewer =
      location.pathname.startsWith("/portfolio") ||
      location.pathname === "/account" ||
      location.pathname === "/settings" ||
      location.pathname === "/conexiones";
    if (!authLoading && user && isOrgViewer && !allowedForOrgViewer) {
      navigate("/portfolio", { replace: true });
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
    </SidebarProvider>
  );
}
