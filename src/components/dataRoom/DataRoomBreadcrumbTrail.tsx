import { ChevronRight } from "lucide-react";
import type { DataRoomTreeNode } from "@/lib/dataRoomTree";

type Props = {
  rootLabel: string;
  path: DataRoomTreeNode[];
  onNavigate: (folderId: string | null) => void;
};

// Generaliza el breadcrumb inline que ya usa src/pages/DataRoom.tsx
// (founder) — mismo markup/comportamiento, factorizado para reusarlo del
// lado investor (InvestorCompany.tsx tab Data Room, InvestorDataRoom.tsx).
export function DataRoomBreadcrumbTrail({ rootLabel, path, onNavigate }: Props) {
  return (
    <div className="flex items-center gap-1.5 text-sm mb-6 flex-wrap">
      <button
        type="button"
        onClick={() => onNavigate(null)}
        className={path.length === 0 ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}
      >
        {rootLabel}
      </button>
      {path.map((node, i) => (
        <span key={node.id} className="flex items-center gap-1.5">
          <ChevronRight size={13} strokeWidth={1.5} className="text-tertiary" aria-hidden="true" />
          <button
            type="button"
            onClick={() => onNavigate(node.id)}
            className={i === path.length - 1 ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}
          >
            {node.name}
          </button>
        </span>
      ))}
    </div>
  );
}
