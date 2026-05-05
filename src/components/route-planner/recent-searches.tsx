import { History, MoveRight } from "lucide-react";

import type { SearchRecord } from "@/lib/validations/routes";

interface RecentSearchesProps {
  searches: SearchRecord[];
  onSelect: (origin: string, destination: string) => void;
}

export function RecentSearches({ searches, onSelect }: RecentSearchesProps) {
  if (!searches.length) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <History className="h-4 w-4" />
        Recent searches
      </div>

      <div className="flex flex-wrap gap-2">
        {searches.slice(0, 5).map((search) => (
          <button
            key={search.id}
            type="button"
            onClick={() => onSelect(search.origin, search.destination)}
            className="flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-left text-xs font-medium text-foreground transition hover:bg-surface-strong hover:border-primary/20"
          >
            <span>{search.origin}</span>
            <MoveRight className="h-3.5 w-3.5 text-muted-foreground" />
            <span>{search.destination}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
