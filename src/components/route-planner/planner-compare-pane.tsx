"use client";

import { ArrowRight, CheckCircle2, Clock3, Coins, GitCompareArrows, MapPinned, Route } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatBdt, getConfidenceTone, getRouteKindLabel, getRouteKindTone } from "@/lib/transport";
import { cn } from "@/lib/utils";
import type { RouteOption } from "@/lib/validations/routes";

interface PlannerComparePaneProps {
  routes: RouteOption[];
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
        "w-full rounded-[28px] border px-4 py-4 text-left transition",
        selected
          ? "border-sky-400/40 bg-sky-400/10 shadow-[0_18px_44px_-26px_rgba(56,189,248,0.35)]"
          : "border-white/10 bg-white/5 hover:bg-white/8",
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-900">
              {label}
            </span>
            <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]", getRouteKindTone(route.kind))}>
              {getRouteKindLabel(route.kind)}
            </span>
            <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]", getConfidenceTone(route.confidence))}>
              {route.confidence}
            </span>
          </div>
          <h3 className="font-display text-lg font-semibold text-white">{route.summary}</h3>
          <p className="mt-1 text-sm text-slate-300">
            {route.boarding.label} to {route.alighting.label}
          </p>
          {route.primaryReason ? (
            <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/7 px-3 py-1.5 text-xs font-semibold text-sky-100">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {route.primaryReason}
            </p>
          ) : null}
        </div>
        <ArrowRight className="mt-1 h-5 w-5 text-slate-400" />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 text-sm text-slate-300 sm:grid-cols-4">
        <div className="compare-metric">
          <Clock3 className="h-4 w-4 text-sky-300" />
          <span>{route.estimatedDurationMinutes ? `${route.estimatedDurationMinutes} min` : "N/A"}</span>
        </div>
        <div className="compare-metric">
          <Coins className="h-4 w-4 text-emerald-300" />
          <span>{formatBdt(route.totalCost)}</span>
        </div>
        <div className="compare-metric">
          <GitCompareArrows className="h-4 w-4 text-amber-300" />
          <span>{route.transferCount ? `${route.transferCount} transfer` : "Direct flow"}</span>
        </div>
        <div className="compare-metric">
          <MapPinned className="h-4 w-4 text-violet-300" />
          <span>{route.estimatedDistanceKm ? `${route.estimatedDistanceKm} km` : "Dhaka map"}</span>
        </div>
      </div>

      {route.serviceLabels.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {route.serviceLabels.map((service) => (
            <span
              key={service}
              className="rounded-full border border-white/10 bg-white/6 px-2.5 py-1 text-xs font-medium text-slate-200"
            >
              {service}
            </span>
          ))}
        </div>
      ) : null}

      {route.tradeoffs.length ? (
        <p className="mt-4 text-sm text-slate-400">{route.tradeoffs[0]}</p>
      ) : null}
    </button>
  );
}

export function PlannerComparePane({
  routes,
  selectedRouteId,
  onSelectRoute,
  onOpenItinerary,
  onBack,
}: PlannerComparePaneProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-[26px] border border-white/10 bg-white/5 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">Two guided choices</p>
          <p className="text-xs text-slate-400">
            Pick the route that best fits your commute, then open the full itinerary.
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="h-10 rounded-full border border-white/10 bg-white/6 px-4 text-white hover:bg-white/12"
        >
          Edit trip
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

      <Button
        type="button"
        onClick={onOpenItinerary}
        className="h-14 w-full rounded-[24px] bg-white text-slate-950 hover:bg-slate-100"
      >
        <Route className="mr-2 h-5 w-5" />
        Open selected itinerary
      </Button>
    </div>
  );
}
