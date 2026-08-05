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
  type LucideIcon,
} from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useEffect, useState } from "react";
import { LIST_CONNECTIONS_URL, type Connection } from "@/lib/connections";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { useAuth } from "@/contexts/AuthContext";
import { useStartup } from "@/hooks/useStartup";
import { StageBadge } from "./StageBadge";
import { cn } from "@/lib/utils";

// `end: false` para las secciones que tienen sub-rutas propias (/metrics/:id,
// /reporting/:id, /portfolio/:id) — si no, el ítem solo se marca activo en la
// URL exacta y se apaga apenas entrás al detalle de una métrica, un reporte o
// una empresa del portfolio.
const items = [
  { title: "Dashboard", url: "/dashboard", icon: LayoutDashboard, end: true },
  { title: "Roadmap", url: "/roadmap", icon: Map, end: true },
  { title: "Métricas", url: "/metrics", icon: BarChart3, end: false },
  { title: "Reporting", url: "/reporting", icon: FileBarChart, end: false },
  { title: "Data Room", url: "/data-room", icon: FolderOpen, end: true },
  { title: "Conexiones", url: "/conexiones", icon: Network, end: true },
];

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
  const { isAdmin, isOrgViewer, fund_name, company_id } = useAuth();
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
          <div className="text-lg font-medium tracking-tight">CloudValley</div>
          {fund_name && <div className="mt-3 text-sm text-foreground">{fund_name}</div>}
        </SidebarHeader>
        <SidebarContent className="px-3 py-4">
          <SidebarGroup>
            <SidebarGroupContent>
              <SidebarMenu>
                <NavItem to="/portfolio" end={false} icon={Building2} label="Portfolio" />
                <NavItem to="/conexiones" end icon={Network} label="Conexiones" />
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    );
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b border-sidebar-border px-5 py-5">
        <div className="text-lg font-medium tracking-tight">CloudValley</div>
        {startup && (
          <div className="mt-3 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm text-foreground">{startup.name}</span>
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
              {items.map((item) => (
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
    </Sidebar>
  );
}
