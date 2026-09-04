import { Link } from "react-router-dom";
import { BarChart3, Map, FolderOpen, FileText, ArrowRight, Compass } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";

type ExploreCard = {
  to: string;
  icon: typeof BarChart3;
  title: string;
  stat: string;
  cta: string;
};

type Props = {
  metricsCount: number;
  metricsIssueCount: number;
  roadmapReadiness: number;
  roadmapPendingCount: number;
  docsUploaded: number;
  docsTotal: number;
  reportsCount: number;
  lastReportDaysAgo: number | null;
};

export function ExploreSection({
  metricsCount,
  metricsIssueCount,
  roadmapReadiness,
  roadmapPendingCount,
  docsUploaded,
  docsTotal,
  reportsCount,
  lastReportDaysAgo,
}: Props) {
  const cards: ExploreCard[] = [
    {
      to: "/metrics",
      icon: BarChart3,
      title: "Métricas",
      stat: metricsIssueCount > 0 ? `${metricsCount} activas · ${metricsIssueCount} con alertas` : `${metricsCount} activas`,
      cta: "Explorar",
    },
    {
      to: "/roadmap",
      icon: Map,
      title: "Roadmap",
      stat: `Readiness ${roadmapReadiness}/100 · ${roadmapPendingCount} tarea${roadmapPendingCount === 1 ? "" : "s"} pendiente${roadmapPendingCount === 1 ? "" : "s"}`,
      cta: "Ver Roadmap",
    },
    {
      to: "/data-room",
      icon: FolderOpen,
      title: "Data Room",
      stat: `${docsUploaded} de ${docsTotal} documentos cargados`,
      cta: "Ver Data Room",
    },
    {
      to: "/reporting",
      icon: FileText,
      title: "Reporting",
      stat:
        reportsCount === 0
          ? "Todavía no creaste ningún reporte"
          : lastReportDaysAgo == null
            ? `${reportsCount} reporte${reportsCount === 1 ? "" : "s"}`
            : `Último reporte actualizado hace ${lastReportDaysAgo} día${lastReportDaysAgo === 1 ? "" : "s"}`,
      cta: "Ver Reporting",
    },
  ];

  return (
    <SectionCard
      padding="sm"
      title={
        <span className="flex items-center gap-1.5">
          <Compass size={14} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          Explorar
        </span>
      }
    >
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="border border-border rounded-lg p-4 flex flex-col gap-2.5 bg-card hover:border-primary/40 hover:bg-primary/5 transition-colors group"
          >
            <div className="w-8 h-8 rounded-md bg-surface flex items-center justify-center">
              <c.icon size={15} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-medium">{c.title}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{c.stat}</p>
            </div>
            <div className="text-xs font-medium text-primary flex items-center gap-1 mt-auto">
              {c.cta}
              <ArrowRight size={12} strokeWidth={1.5} className="group-hover:translate-x-0.5 transition-transform" aria-hidden="true" />
            </div>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}
