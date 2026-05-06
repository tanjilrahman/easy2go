"use client";

import { useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, Route } from "lucide-react";

import { PlannerDebugRoutes } from "@/components/route-planner/planner-debug-routes";
import { RouteOverview } from "@/components/route-planner/route-summary";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { RouteOption } from "@/lib/validations/routes";

interface PlannerComparePaneProps {
  routes: RouteOption[];
  debugRoutes: RouteOption[];
  selectedRouteId?: string;
  onSelectRoute: (route: RouteOption) => void;
  onOpenItinerary: () => void;
}

function CompareRow({
  route,
  label,
  selected,
  onClick,
}: {
  route: RouteOption;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl border px-3 py-3 text-left transition",
        selected
          ? "border-primary/30 bg-primary/[0.04] shadow-md shadow-primary/5"
          : "border-border bg-surface hover:bg-surface-strong",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <RouteOverview route={route} label={label} />
        </div>
        <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground/50" />
      </div>

      {route.tradeoffs.length ? (
        <p className="mt-2 text-xs text-muted-foreground">{route.tradeoffs[0]}</p>
      ) : null}
    </button>
  );
}

export function PlannerComparePane({
  routes,
  debugRoutes,
  selectedRouteId,
  onSelectRoute,
  onOpenItinerary,
}: PlannerComparePaneProps) {
  const [showDebug, setShowDebug] = useState(false);

  function getCompareLabel(index: number) {
    if (index === 0) {
      return "Best match";
    }

    if (index === 1) {
      return "Fastest practical";
    }

    if (index === 2) {
      return "Lowest hassle";
    }

    return `Option ${index + 1}`;
  }

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-2 pb-2">
          {routes.map((route, index) => (
            <CompareRow
              key={route.id}
              route={route}
              label={getCompareLabel(index)}
              selected={route.id === selectedRouteId}
              onClick={() => onSelectRoute(route)}
            />
          ))}

          {debugRoutes.length ? (
            <div className="rounded-xl border border-border bg-surface">
              <button
                type="button"
                onClick={() => setShowDebug((current) => !current)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">Debug routes</span>
                  <span className="text-xs text-muted-foreground">{debugRoutes.length} candidates</span>
                </div>
                {showDebug ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </button>
              {showDebug ? (
                <div className="border-t border-border px-3 pb-3 pt-2 pr-2">
                  <PlannerDebugRoutes routes={debugRoutes} />
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-surface/95 pt-2 backdrop-blur-sm">
        <Button
          type="button"
          onClick={onOpenItinerary}
          size="lg"
          className="h-10 w-full text-sm shadow-lg shadow-primary/15"
        >
          <Route className="mr-2 h-5 w-5" />
          Trip
        </Button>
      </div>
    </div>
  );
}
