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
        "w-full rounded-[24px] border px-3.5 py-3.5 text-left transition",
        selected
          ? "border-[rgba(90,67,215,0.24)] bg-[rgba(90,67,215,0.06)] shadow-[0_16px_30px_-24px_rgba(90,67,215,0.28)]"
          : "border-slate-200 bg-white hover:bg-[rgba(90,67,215,0.03)]",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-[rgb(54,40,124)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
              {label}
            </span>
            <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]", getRouteKindTone(route.kind))}>
              {getRouteKindLabel(route.kind)}
            </span>
            <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]", getConfidenceTone(route.confidence))}>
              {route.confidence}
            </span>
          </div>
          <h3 className="font-display text-base font-semibold text-slate-900">{route.summary}</h3>
          <p className="mt-0.5 text-sm text-slate-600">
            {route.boarding.label} to {route.alighting.label}
          </p>
          {route.primaryReason ? (
            <p className="mt-2 inline-flex items-center gap-2 rounded-full bg-[rgba(90,67,215,0.1)] px-2.5 py-1 text-[11px] font-semibold text-[rgb(72,53,173)]">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {route.primaryReason}
            </p>
          ) : null}
        </div>
        <ArrowRight className="mt-1 h-5 w-5 text-slate-400" />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-600 sm:grid-cols-4">
        <div className="compare-metric">
          <Clock3 className="h-4 w-4 text-[rgb(118,94,241)]" />
          <span>{route.estimatedDurationMinutes ? `${route.estimatedDurationMinutes} min` : "N/A"}</span>
        </div>
        <div className="compare-metric">
          <Coins className="h-4 w-4 text-[rgb(15,138,107)]" />
          <span>{formatBdt(route.totalCost)}</span>
        </div>
        <div className="compare-metric">
          <GitCompareArrows className="h-4 w-4 text-[rgb(183,121,31)]" />
          <span>{route.transferCount ? `${route.transferCount} transfer` : "Direct flow"}</span>
        </div>
        <div className="compare-metric">
          <MapPinned className="h-4 w-4 text-[rgb(90,67,215)]" />
          <span>{route.estimatedDistanceKm ? `${route.estimatedDistanceKm} km` : "Dhaka map"}</span>
        </div>
      </div>

      {route.serviceLabels.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {route.serviceLabels.map((service) => (
            <span
              key={service}
              className="rounded-full border border-[rgba(90,67,215,0.12)] bg-[rgba(244,241,255,0.98)] px-2.5 py-1 text-xs font-medium text-[rgb(72,53,173)]"
            >
              {service}
            </span>
          ))}
        </div>
      ) : null}

      {route.tradeoffs.length ? (
        <p className="mt-3 text-xs text-slate-500">{route.tradeoffs[0]}</p>
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
  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-3 pb-3">
          <div className="flex items-center justify-between rounded-[18px] border border-[rgba(90,67,215,0.12)] bg-white px-3 py-2.5">
            <p className="text-sm font-semibold text-slate-900">Fastest + alternative</p>
            <Button
              type="button"
              variant="ghost"
              onClick={onBack}
              className="h-8 rounded-full border border-[rgba(90,67,215,0.12)] bg-[rgba(244,241,255,0.98)] px-3 text-[rgb(72,53,173)] hover:bg-[rgba(238,232,255,0.98)]"
            >
              Edit
            </Button>
          </div>

          {routes.map((route, index) => (
            <CompareRow
              key={route.id}
              route={route}
              label={index === 0 ? "Fastest" : "Alternative"}
              selected={route.id === selectedRouteId}
              onClick={() => onSelectRoute(route)}
            />
          ))}

          <PlannerDebugRoutes routes={debugRoutes} />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-slate-200 bg-white/95 pt-3 backdrop-blur">
        <Button
          type="button"
          onClick={onOpenItinerary}
          className="h-11 w-full rounded-[20px] bg-[linear-gradient(135deg,#5a43d7_0%,#765ef1_100%)] text-sm text-white hover:opacity-95"
        >
          <Route className="mr-2 h-5 w-5" />
          Trip
        </Button>
      </div>
    </div>
  );
}
