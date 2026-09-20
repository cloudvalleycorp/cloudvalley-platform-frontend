import {
  LayoutDashboard,
  Map,
  BarChart3,
  FolderOpen,
  Shield,
  Network,
  Building2,
  Users,
  Landmark,
  DollarSign,
  FileBarChart,
  Compass,
  ListTodo,
  SlidersHorizontal,
  ChevronDown,
  type LucideIcon,
} from "lucide-react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { LIST_CONNECTIONS_URL, type Connection } from "@/lib/connections";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings as SettingsIcon, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useStartup } from "@/hooks/useStartup";
import { StageBadge } from "./StageBadge";
import { cn } from "@/lib/utils";
import { parseMetricsTab, metricsTabUrl, type MetricsTab } from "@/lib/metricsNavigation";

// Pie del sidebar (avatar + nombre + rol), mismo dato que ya arma el menú
// del topbar en AppLayout.tsx — acá es un atajo más corto (sin nombre de
// pantalla completo) para que la identidad de quien está logueado también
// quede fija en la nav, como en el mockup aprobado ("sidebar-foot").
function SidebarUserFooter() {
  const { full_name, email, avatar_url, role_title, role, fund_name, signOut } = useAuth();
  const navigate = useNavigate();
  const displayName = full_name?.trim() || email || "Mi cuenta";
  const subLabel =
    role_title?.trim() ||
    (role === "investor" ? fund_name ?? "Inversor" : role === "admin" ? "Admin" : "Founder");
  return (
    <SidebarFooter className="border-t border-sidebar-border p-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="flex items-center gap-2.5 w-full rounded-md p-1.5 text-left hover:bg-sidebar-accent transition-colors">
            <Avatar className="h-8 w-8 shrink-0">
              <AvatarImage src={avatar_url ?? undefined} alt="" />
              <AvatarFallback className="text-[11px] font-semibold">
                {displayName.trim().slice(0, 2).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-medium truncate">{displayName}</span>
              <span className="block text-[11px] text-muted-foreground truncate">{subLabel}</span>
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-56">
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
    </SidebarFooter>
  );
}

// `end: false` para las secciones que tienen sub-rutas propias (/metrics/:id,
// /reporting/:id, /portfolio/:id) — si no, el ítem solo se marca activo en la
// URL exacta y se apaga apenas entrás al detalle de una métrica, un reporte o
// una empresa del portfolio.
const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, end: true },
  { title: "Roadmap", url: "/roadmap", icon: Map, end: true },
  { title: "Reporting", url: "/reporting", icon: FileBarChart, end: false },
  { title: "Data Room", url: "/data-room", icon: FolderOpen, end: true },
  { title: "Conexiones", url: "/conexiones", icon: Network, end: true },
];

const METRICS_SUB_ITEMS: { tab: MetricsTab; label: string }[] = [
  { tab: "overview", label: "Overview" },
  { tab: "sources", label: "Fuentes de datos" },
  { tab: "health", label: "Salud de datos" },
  { tab: "explorer", label: "Explorador" },
];

// /metrics/:metricId no lleva ?tab= (fuerza Explorador desde Metrics.tsx) —
// se resuelve acá también para que el sub-ítem correcto quede resaltado.
// /growth-tracker/sheets es la pantalla de gestión detrás de "Fuentes de
// datos" (ver GrowthTrackerSheets.tsx) — mismo criterio.
function currentMetricsTab(pathname: string, search: string): MetricsTab | null {
  if (pathname.startsWith("/growth-tracker/sheets")) return "sources";
  if (pathname === "/metrics") return parseMetricsTab(new URLSearchParams(search));
  if (pathname.startsWith("/metrics/")) return "explorer";
  return null;
}

// Grupo colapsable en vez de un ítem plano — antes "Fuentes de datos" (el
// flujo de Sheets/Excel) no tenía ninguna entrada de nav, solo se llegaba
// por deep link. Mismo patrón Collapsible+SidebarMenuSub que ya trae el
// design system, sin usar hasta ahora en este sidebar.
function MetricsNavGroup() {
  const { pathname, search } = useLocation();
  const activeTab = currentMetricsTab(pathname, search);
  const inMetricsArea = activeTab !== null;
  const [open, setOpen] = useState(inMetricsArea);
  useEffect(() => {
    if (inMetricsArea) setOpen(true);
  }, [inMetricsArea]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        <CollapsibleTrigger asChild>
          <SidebarMenuButton
            isActive={inMetricsArea}
            className="flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all duration-150 text-muted-foreground hover:text-foreground cursor-pointer"
          >
            <BarChart3 size={16} strokeWidth={1.5} />
            <span className="flex-1 text-left">Métricas</span>
            <ChevronDown size={14} strokeWidth={1.5} className={cn("transition-transform", open && "rotate-180")} />
          </SidebarMenuButton>
        </CollapsibleTrigger>
      </SidebarMenuItem>
      <CollapsibleContent>
        <SidebarMenuSub>
          {METRICS_SUB_ITEMS.map((item) => (
            <SidebarMenuSubItem key={item.tab}>
              <SidebarMenuSubButton asChild isActive={activeTab === item.tab}>
                <NavLink to={metricsTabUrl(item.tab)}>{item.label}</NavLink>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          ))}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Grupo colapsable Portfolio (investor) — Catálogo/Comparar, reemplaza al
// toggle inline que tenía InvestorPortfolio.tsx (no escalaba: con muchas
// empresas era un solo switch perdido arriba a la derecha). El sub-ítem
// Comparar se oculta con menos de 2 empresas conectadas — comparar una
// empresa contra sí misma no aporta nada.
function PortfolioNavGroup() {
  const { pathname, search } = useLocation();
  const { portfolio_company_ids } = useAuth();
  const inPortfolioArea = pathname === "/portfolio";
  const isCompare = new URLSearchParams(search).get("mode") === "compare";
  const [open, setOpen] = useState(inPortfolioArea);
  useEffect(() => {
    if (inPortfolioArea) setOpen(true);
  }, [inPortfolioArea]);
  const canCompare = (portfolio_company_ids?.length ?? 0) >= 2;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        {/* Label y flecha son dos targets de click distintos — el label
            navega de verdad (a Catálogo) además de expandir, la flecha solo
            pliega/despliega. Antes ambos estaban pegados al mismo botón:
            clickear "Portfolio" solo abría la sub-lista en el propio
            sidebar en vez de mostrar contenido al medio, mismo problema
            encontrado y corregido en el mockup. */}
        <div className="flex items-center gap-0.5">
          <SidebarMenuButton
            asChild
            isActive={inPortfolioArea}
            className="flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all duration-150 text-muted-foreground hover:text-foreground"
          >
            <NavLink to="/portfolio">
              <Building2 size={16} strokeWidth={1.5} />
              <span className="flex-1 text-left">Portfolio</span>
            </NavLink>
          </SidebarMenuButton>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent shrink-0"
              aria-label={open ? "Colapsar Portfolio" : "Expandir Portfolio"}
            >
              <ChevronDown size={14} strokeWidth={1.5} className={cn("transition-transform", open && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
        </div>
      </SidebarMenuItem>
      <CollapsibleContent>
        <SidebarMenuSub>
          <SidebarMenuSubItem>
            <SidebarMenuSubButton asChild isActive={inPortfolioArea && !isCompare}>
              <NavLink to="/portfolio">Catálogo</NavLink>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
          {canCompare && (
            <SidebarMenuSubItem>
              <SidebarMenuSubButton asChild isActive={inPortfolioArea && isCompare}>
                <NavLink to="/portfolio?mode=compare">Comparar</NavLink>
              </SidebarMenuSubButton>
            </SidebarMenuSubItem>
          )}
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

// Grupo colapsable Gestión (investor) — Métricas/Segmentos. Antes era un
// ítem plano hacia /requisitos con las dos secciones apiladas en una sola
// pantalla sin buscador — con muchos requisitos o segmentos reales deja de
// ser usable, ver plan de rediseño investor.
function GestionNavGroup() {
  const { pathname, search } = useLocation();
  const inGestionArea = pathname === "/requisitos";
  const isSegments = new URLSearchParams(search).get("tab") === "segments";
  const [open, setOpen] = useState(inGestionArea);
  useEffect(() => {
    if (inGestionArea) setOpen(true);
  }, [inGestionArea]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <SidebarMenuItem>
        {/* Mismo fix que PortfolioNavGroup: label navega (a Métricas) +
            expande, la flecha es un target de click aparte que solo
            pliega/despliega. */}
        <div className="flex items-center gap-0.5">
          <SidebarMenuButton
            asChild
            isActive={inGestionArea}
            className="flex-1 flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all duration-150 text-muted-foreground hover:text-foreground"
          >
            <NavLink to="/requisitos">
              <SlidersHorizontal size={16} strokeWidth={1.5} />
              <span className="flex-1 text-left">Gestión</span>
            </NavLink>
          </SidebarMenuButton>
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-sidebar-accent shrink-0"
              aria-label={open ? "Colapsar Gestión" : "Expandir Gestión"}
            >
              <ChevronDown size={14} strokeWidth={1.5} className={cn("transition-transform", open && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
        </div>
      </SidebarMenuItem>
      <CollapsibleContent>
        <SidebarMenuSub>
          <SidebarMenuSubItem>
            <SidebarMenuSubButton asChild isActive={inGestionArea && !isSegments}>
              <NavLink to="/requisitos">Métricas</NavLink>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
          <SidebarMenuSubItem>
            <SidebarMenuSubButton asChild isActive={inGestionArea && isSegments}>
              <NavLink to="/requisitos?tab=segments">Segmentos</NavLink>
            </SidebarMenuSubButton>
          </SidebarMenuSubItem>
        </SidebarMenuSub>
      </CollapsibleContent>
    </Collapsible>
  );
}

function isNavActive(pathname: string, url: string, end: boolean) {
  return end ? pathname === url : pathname === url || pathname.startsWith(`${url}/`);
}

// SidebarMenuButton ya trae su propio resaltado de "activo" vía data-active
// (bg-sidebar-accent/font-medium en sidebar.tsx) — pasarle isActive acá en
// vez de calcular el fondo a mano en el className de NavLink. Esto último se
// probó y no funciona: NavLink con className en forma de función, envuelto
// en el asChild/Slot de SidebarMenuButton, pierde ese cálculo al fusionarse
// (Slot espera className como string) y el ítem activo nunca se resalta.
function NavItem({
  to,
  end,
  icon: Icon,
  label,
  className,
}: {
  to: string;
  end: boolean;
  icon: LucideIcon;
  label: string;
  className?: string;
}) {
  const { pathname } = useLocation();
  const active = isNavActive(pathname, to, end);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={active}>
        <NavLink
          to={to}
          className={cn(
            "flex items-center gap-2.5 px-2.5 py-2 rounded-md text-sm transition-all duration-150 text-muted-foreground hover:text-foreground",
            className,
          )}
        >
          <Icon size={16} strokeWidth={1.5} />
          <span>{label}</span>
        </NavLink>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

export function AppSidebar() {
  const { isAdmin, isOrgViewer, company_id } = useAuth();
  const { startup } = useStartup();
  const [orgs, setOrgs] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!company_id) {
      setOrgs([]);
      return;
    }
    (async () => {
      try {
        const res = await fetch(LIST_CONNECTIONS_URL, { credentials: "include" });
        if (!res.ok) {
          setOrgs([]);
          return;
        }
        const data = await res.json();
        const connections: Connection[] = Array.isArray(data?.connections) ? data.connections : [];
        setOrgs(
          connections
            .filter((c) => c.status === "connected")
            .map((c) => ({ id: c.counterpart_id, name: c.counterpart_name }))
        );
      } catch {
        setOrgs([]);
      }
    })();
  }, [company_id]);

  if (isOrgViewer) {
    return (
      <Sidebar>
        <SidebarHeader className="border-b border-sidebar-border px-5 py-5">
          <Link to="/" className="inline-flex items-center gap-2 text-base font-medium tracking-tight text-foreground hover:text-foreground/70 transition-colors">
            <img src="/logo.svg" alt="" className="h-6 w-6 shrink-0" />
            CloudValley
          </Link>
        </SidebarHeader>
        <SidebarContent className="px-3 py-4">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                {/* Rediseño Investor 2026-09: Portfolio y Gestión pasan a
                    grupos colapsables con sub-ítems propios (Catálogo/
                    Comparar, Métricas/Segmentos) en vez de ítems planos o
                    toggles inline — no escalaban con muchas empresas o
                    requisitos reales. Gestión vuelve a tener lugar fijo acá
                    (antes solo se llegaba desde un link dentro de Portfolio). */}
                <NavItem to="/overview" end icon={Compass} label="Overview" />
                <PortfolioNavGroup />
                <NavItem to="/reporting" end={false} icon={FileBarChart} label="Reporting" />
                <NavItem to="/data-room" end icon={FolderOpen} label="Data Room" />
                <NavItem to="/tasks" end icon={ListTodo} label="Tasks" />
                <GestionNavGroup />
                <NavItem to="/conexiones" end icon={Network} label="Conexiones" />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarUserFooter />
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-5 py-5">
        <Link to="/" className="inline-flex items-center gap-2 text-base font-medium tracking-tight text-foreground hover:text-foreground/70 transition-colors">
          <img src="/logo.svg" alt="" className="h-6 w-6 shrink-0" />
          CloudValley
        </Link>
        {startup && (
          <div className="mt-3 space-y-1.5">
            {/* El nombre de la startup ya se ve en el header (orgLabel, ver
                AppLayout.tsx) — mostrarlo también acá quedaba duplicado.
                Se conserva la etapa: es información que no está en ningún
                otro lado del shell. */}
            <div className="flex items-center gap-2 flex-wrap">
              <StageBadge stage={startup.stage} />
            </div>
            {orgs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {orgs.map((o) => (
                  <span
                    key={o.id}
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-black text-white"
                  >
                    {o.name}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </SidebarHeader>

      <SidebarContent className="px-3 py-4">
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {items.slice(0, 2).map((item) => (
                <NavItem key={item.url} to={item.url} end={item.end} icon={item.icon} label={item.title} />
              ))}
              <MetricsNavGroup />
              {items.slice(2).map((item) => (
                <NavItem key={item.url} to={item.url} end={item.end} icon={item.icon} label={item.title} />
              ))}

              {isAdmin && (
                <>
                  <NavItem to="/admin" end icon={Shield} label="Admin" className="mt-4" />
                  <NavItem to="/admin/companies" end icon={Building2} label="Empresas" />
                  <NavItem to="/admin/users" end icon={Users} label="Usuarios" />
                  <NavItem to="/admin/funds" end icon={Landmark} label="Fondos" />
                  <NavItem to="/admin/financial-data" end icon={DollarSign} label="Datos financieros" />
                  <NavItem to="/admin/roadmap" end icon={Map} label="Catálogo Roadmap" />
                </>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarUserFooter />
    </Sidebar>
  );
}
