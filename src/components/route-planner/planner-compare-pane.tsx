"use client";

import { ArrowRight, CheckCircle2, Clock3, Coins, GitCompareArrows, MapPinned, Route } from "lucide-react";

import { PlannerDebugRoutes } from "@/components/route-planner/planner-debug-routes";
import { Button } from "@/components/ui/button";
import { formatBdt, getConfidenceTone, getRouteKindLabel, getRouteKindTone } from "@/lib/transport";
import { cn } from "@/lib/utils";
import type { RouteOption } from "@/lib/validations/routes";

interface PlannerComparePaneProps {
  routes: RouteOption[];
  debugRoutes: RouteOption[];
  selectedRouteId?: string;
  onSelectRoute: (route: RouteOption) => void;
  onOpenItinerary: () => void;
  onBack: () => void;
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
        "w-full rounded-xl border px-4 py-4 text-left transition",
        selected
          ? "border-primary/30 bg-primary/[0.04] shadow-md shadow-primary/5"
          : "border-border bg-surface hover:bg-surface-strong",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-foreground px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-foreground">
              {label}
            </span>
            <span className={cn("rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", getRouteKindTone(route.kind))}>
              {getRouteKindLabel(route.kind)}
            </span>
            <span className={cn("rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]", getConfidenceTone(route.confidence))}>
              {route.confidence}
            </span>
          </div>
          <h3 className="font-display text-base font-semibold text-foreground">{route.summary}</h3>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {route.mapPreview.originLabel} to {route.mapPreview.destinationLabel}
          </p>
          {route.mapPreview.originLabel !== route.boarding.label ? (
            <p className="mt-1 text-xs text-muted-foreground">Board at {route.boarding.label}</p>
          ) : null}
          {route.primaryReason ? (
            <p className="mt-2 inline-flex items-center gap-2 rounded-lg bg-primary/8 px-2.5 py-1 text-[11px] font-semibold text-primary">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {route.primaryReason}
            </p>
          ) : null}
          {route.connectorBurden ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Connector burden: {route.connectorBurden}
            </p>
          ) : null}
        </div>
        <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground/50" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-foreground sm:grid-cols-4">
        <div className="compare-metric">
          <Clock3 className="h-4 w-4 text-secondary" />
          <span>{route.estimatedDurationMinutes ? `${route.estimatedDurationMinutes} min` : "N/A"}</span>
        </div>
        <div className="compare-metric">
          <Coins className="h-4 w-4 text-emerald-600" />
          <span>{formatBdt(route.totalCost)}</span>
        </div>
        <div className="compare-metric">
          <GitCompareArrows className="h-4 w-4 text-amber-600" />
          <span>{route.transferCount ? `${route.transferCount} transfer` : "Direct flow"}</span>
        </div>
        <div className="compare-metric">
          <MapPinned className="h-4 w-4 text-primary" />
          <span>{route.estimatedDistanceKm ? `${route.estimatedDistanceKm} km` : "Dhaka map"}</span>
        </div>
      </div>

      {route.serviceLabels.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {route.serviceLabels.map((service) => (
            <span
              key={service}
              className="rounded-lg border border-border bg-surface-strong px-2.5 py-1 text-xs font-medium text-primary"
            >
              {service}
            </span>
          ))}
        </div>
      ) : null}

      {route.tradeoffs.length ? (
        <p className="mt-3 text-xs text-muted-foreground">{route.tradeoffs[0]}</p>
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
  onBack,
}: PlannerComparePaneProps) {
  function getCompareLabel(index: number) {
    if (index === 0) {
      return "Fastest";
    }

    if (index === 1) {
      return "Alternative";
    }

    return `Option ${index + 1}`;
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-3 pb-3">
          <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Top routes</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onBack}
            >
              Edit
            </Button>
          </div>

          {routes.map((route, index) => (
            <CompareRow
              key={route.id}
              route={route}
              label={getCompareLabel(index)}
              selected={route.id === selectedRouteId}
              onClick={() => onSelectRoute(route)}
            />
          ))}

          <PlannerDebugRoutes routes={debugRoutes} />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-surface/95 pt-3 backdrop-blur-sm">
        <Button
          type="button"
          onClick={onOpenItinerary}
          size="lg"
          className="h-11 w-full text-sm shadow-lg shadow-primary/15"
        >
          <Route className="mr-2 h-5 w-5" />
          Trip
        </Button>
      </div>
    </div>
  );
}
