"use client";

import { ArrowLeft, Coins, History, Route, Timer } from "lucide-react";

import { Button } from "@/components/ui/button";
import { TransportIcon } from "@/components/transport-icon";
import { formatBdt, getConfidenceTone, getRouteKindLabel, getRouteKindTone } from "@/lib/transport";
import { cn } from "@/lib/utils";
import type { LocationInput, RouteOption } from "@/lib/validations/routes";

interface PlannerItineraryPaneProps {
  route: RouteOption | null;
  onBack: () => void;
  onBackLabel: string;
  onUseReturnTrip: (origin: LocationInput, destination: LocationInput) => void;
}

export function PlannerItineraryPane({
  route,
  onBack,
  onBackLabel,
  onUseReturnTrip,
}: PlannerItineraryPaneProps) {
  if (!route) {
    return null;
  }

  return (
    <div className="space-y-5">
      <div className="rounded-[30px] border border-white/10 bg-white/6 p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]", getRouteKindTone(route.kind))}>
                {getRouteKindLabel(route.kind)}
              </span>
              <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]", getConfidenceTone(route.confidence))}>
                {route.confidence}
              </span>
            </div>
            <h3 className="font-display text-[1.45rem] font-semibold text-white">{route.summary}</h3>
            <p className="mt-1 text-sm text-slate-300">
              {route.boarding.label} to {route.alighting.label}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            onClick={onBack}
            className="h-10 rounded-full border border-white/10 bg-white/6 px-4 text-white hover:bg-white/12"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {onBackLabel}
          </Button>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3">
          <div className="compare-metric bg-white/5">
            <Timer className="h-4 w-4 text-sky-300" />
            <span>{route.estimatedDurationMinutes ? `${route.estimatedDurationMinutes} min` : "N/A"}</span>
          </div>
          <div className="compare-metric bg-white/5">
            <Coins className="h-4 w-4 text-emerald-300" />
            <span>{formatBdt(route.totalCost)}</span>
          </div>
          <div className="compare-metric bg-white/5">
            <History className="h-4 w-4 text-amber-300" />
            <span>{route.transferCount ? `${route.transferCount} transfer` : "Direct flow"}</span>
          </div>
        </div>

        {route.serviceLabels.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {route.serviceLabels.map((service) => (
              <span
                key={service}
                className="rounded-full border border-white/10 bg-white/8 px-2.5 py-1 text-xs font-medium text-slate-100"
              >
                {service}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="space-y-3">
        {route.segments.map((segment, index) => (
          <div
            key={`${segment.instruction}-${index}`}
            className="rounded-[28px] border border-white/10 bg-[#091523]/80 px-4 py-4"
          >
            <div className="flex gap-4">
              <TransportIcon mode={segment.mode} />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-display text-base font-semibold text-white">
                    {segment.instruction}
                  </p>
                  {segment.connectorType ? (
                    <span className="rounded-full bg-white/8 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-300">
                      {segment.connectorType}
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-slate-300">
                  {segment.startLocation} to {segment.endLocation}
                </p>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-300">
                  {segment.estimatedDurationMinutes ? (
                    <span className="rounded-full bg-white/6 px-2.5 py-1">
                      {segment.estimatedDurationMinutes} min
                    </span>
                  ) : null}
                  {segment.estimatedDistanceKm ? (
                    <span className="rounded-full bg-white/6 px-2.5 py-1">
                      {segment.estimatedDistanceKm} km
                    </span>
                  ) : null}
                  {segment.stopCount ? (
                    <span className="rounded-full bg-white/6 px-2.5 py-1">
                      {segment.stopCount} stops
                    </span>
                  ) : null}
                  {segment.stationCount ? (
                    <span className="rounded-full bg-white/6 px-2.5 py-1">
                      {segment.stationCount} stations
                    </span>
                  ) : null}
                  {segment.fareText ? (
                    <span className="rounded-full bg-emerald-500/14 px-2.5 py-1 text-emerald-200">
                      {segment.fareText}
                    </span>
                  ) : null}
                </div>
                {segment.note ? (
                  <p className="mt-3 text-sm leading-6 text-slate-400">{segment.note}</p>
                ) : null}
              </div>
            </div>
          </div>
        ))}
      </div>

      {route.advisories.length ? (
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-4">
          <p className="mb-3 text-sm font-semibold text-white">Trip notes</p>
          <div className="space-y-2">
            {route.advisories.map((advisory) => (
              <p key={advisory} className="rounded-2xl bg-white/6 px-3 py-2 text-sm text-slate-300">
                {advisory}
              </p>
            ))}
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        onClick={() =>
          onUseReturnTrip(
            { name: route.alighting.label, canonicalId: route.alighting.id, type: route.alighting.type },
            { name: route.boarding.label, canonicalId: route.boarding.id, type: route.boarding.type },
          )
        }
        className="h-14 w-full rounded-[24px] bg-white text-slate-950 hover:bg-slate-100"
      >
        <Route className="mr-2 h-5 w-5" />
        Use this as the return trip
      </Button>
    </div>
  );
}
