"use client";

import { ArrowLeft, Coins, History, Route, Timer } from "lucide-react";

import { PlannerDebugRoutes } from "@/components/route-planner/planner-debug-routes";
import { Button } from "@/components/ui/button";
import { TransportIcon } from "@/components/transport-icon";
import {
  formatBdt,
  getConfidenceTone,
  getPricingConfidenceLabel,
  getRouteKindLabel,
  getRouteKindTone,
} from "@/lib/transport";
import { cn } from "@/lib/utils";
import type { LocationInput, RouteOption } from "@/lib/validations/routes";

interface PlannerItineraryPaneProps {
  route: RouteOption | null;
  debugRoutes: RouteOption[];
  onBack: () => void;
  onBackLabel: string;
  onUseReturnTrip: (origin: LocationInput, destination: LocationInput) => void;
}

export function PlannerItineraryPane({
  route,
  debugRoutes,
  onBack,
  onBackLabel,
  onUseReturnTrip,
}: PlannerItineraryPaneProps) {
  if (!route) {
    return null;
  }

  const compactModes = new Set(["walk", "ride_share"]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-3 pb-3">
          <div className="rounded-[20px] border border-[rgba(90,67,215,0.12)] bg-white p-3">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                      getRouteKindTone(route.kind),
                    )}
                  >
                    {getRouteKindLabel(route.kind)}
                  </span>
                  <span
                    className={cn(
                      "rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]",
                      getConfidenceTone(route.confidence),
                    )}
                  >
                    {route.confidence}
                  </span>
                </div>
                <h3 className="font-display text-[1.08rem] font-semibold text-slate-900">
                  {route.summary}
                </h3>
                <p className="mt-0.5 text-sm text-slate-600">
                  {route.mapPreview.originLabel} to {route.mapPreview.destinationLabel}
                </p>
                {route.mapPreview.originLabel !== route.boarding.label ? (
                  <p className="mt-1 text-xs text-slate-500">Board at {route.boarding.label}</p>
                ) : null}
                {route.boarding.canonicalLabel &&
                route.boarding.canonicalLabel !== route.boarding.label ? (
                  <p className="mt-1 text-xs text-slate-500">
                    Parent stop: {route.boarding.canonicalLabel}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                onClick={onBack}
                className="h-8 rounded-full border border-[rgba(90,67,215,0.12)] bg-[rgba(244,241,255,0.98)] px-3 text-[rgb(72,53,173)] hover:bg-[rgba(238,232,255,0.98)]"
              >
                <ArrowLeft className="mr-2 h-4 w-4" />
                {onBackLabel}
              </Button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="compare-metric bg-white/5">
                <Timer className="h-4 w-4 text-[rgb(118,94,241)]" />
                <span>{route.estimatedDurationMinutes ? `${route.estimatedDurationMinutes} min` : "N/A"}</span>
              </div>
              <div className="compare-metric bg-white/5">
                <Coins className="h-4 w-4 text-[rgb(15,138,107)]" />
                <span>{formatBdt(route.totalCost)}</span>
              </div>
              <div className="compare-metric bg-white/5">
                <History className="h-4 w-4 text-[rgb(183,121,31)]" />
                <span>{route.transferCount ? `${route.transferCount} transfer` : "Direct flow"}</span>
              </div>
            </div>

            {route.serviceLabels.length ? (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
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
            {route.scoringReason ? (
              <p className="mt-2 text-xs text-slate-500">{route.scoringReason}</p>
            ) : null}
          </div>

          <div className="space-y-2.5">
            {route.segments.map((segment, index) =>
              compactModes.has(segment.mode) ? (
                <div
                  key={`${segment.instruction}-${index}`}
                  className="flex items-center gap-3 rounded-[16px] border border-[rgba(90,67,215,0.1)] bg-white px-3 py-2 text-sm"
                >
                  <TransportIcon mode={segment.mode} size="sm" />
                  <div className="min-w-0 flex-1 text-slate-600">
                    <span className="font-medium text-slate-900">{segment.instruction}</span>
                    <span className="text-slate-500"> - {segment.startLocation} to {segment.endLocation}</span>
                  </div>
                  <div className="shrink-0 text-xs text-slate-500">
                    {segment.estimatedDurationMinutes ? `${segment.estimatedDurationMinutes} min` : null}
                    {segment.estimatedDistanceKm ? ` - ${segment.estimatedDistanceKm} km` : null}
                  </div>
                </div>
              ) : (
                <div
                  key={`${segment.instruction}-${index}`}
                  className="rounded-[18px] border border-[rgba(90,67,215,0.1)] bg-white px-3 py-2.5"
                >
                  <div className="flex gap-3.5">
                    <TransportIcon mode={segment.mode} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-[15px] font-semibold text-slate-900">
                          {segment.instruction}
                        </p>
                        {segment.connectorType ? (
                          <span className="rounded-full bg-[rgba(90,67,215,0.08)] px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-[rgb(95,86,135)]">
                            {segment.connectorType}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {segment.startLocation} to {segment.endLocation}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-slate-600">
                        {segment.estimatedDurationMinutes ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">
                            {segment.estimatedDurationMinutes} min
                          </span>
                        ) : null}
                        {segment.estimatedDistanceKm ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">
                            {segment.estimatedDistanceKm} km
                          </span>
                        ) : null}
                        {segment.stopCount ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">
                            {segment.stopCount} stops
                          </span>
                        ) : null}
                        {segment.stationCount ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">
                            {segment.stationCount} stations
                          </span>
                        ) : null}
                        {segment.fareText ? (
                          <span className="rounded-full bg-[rgba(15,138,107,0.1)] px-2.5 py-1 text-[rgb(13,104,81)]">
                            {segment.fareText}
                          </span>
                        ) : null}
                        {getPricingConfidenceLabel(segment.pricingConfidence) ? (
                          <span className="rounded-full bg-slate-100 px-2.5 py-1">
                            {getPricingConfidenceLabel(segment.pricingConfidence)}
                          </span>
                        ) : null}
                      </div>
                      {segment.note ? (
                        <p className="mt-2 text-xs leading-5 text-slate-500">{segment.note}</p>
                      ) : null}
                      {segment.connectorType === "long_rickshaw" ? (
                        <p className="mt-2 text-xs leading-5 text-amber-700">
                          Long connector: this rickshaw hop is larger than the normal short-mile
                          connector.
                        </p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ),
            )}
          </div>

          {route.advisories.length ? (
            <div className="rounded-[18px] border border-[rgba(90,67,215,0.12)] bg-white p-3">
              <p className="mb-2 text-sm font-semibold text-slate-900">Notes</p>
              <div className="space-y-2">
                {route.advisories.map((advisory) => (
                  <p
                    key={advisory}
                    className="rounded-2xl bg-[rgba(244,241,255,0.98)] px-3 py-2 text-xs text-[rgb(87,80,119)]"
                  >
                    {advisory}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          <PlannerDebugRoutes routes={debugRoutes} />
        </div>
      </div>

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-slate-200 bg-white/95 pt-3 backdrop-blur">
        <Button
          type="button"
          onClick={() =>
            onUseReturnTrip(
              route.mapPreview.destinationCoordinates
                ? {
                    name: route.mapPreview.destinationLabel,
                    coordinates: route.mapPreview.destinationCoordinates,
                    type: "place",
                  }
                : {
                    name: route.alighting.label,
                    canonicalId: route.alighting.id,
                    type: route.alighting.type,
                  },
              route.mapPreview.originCoordinates
                ? {
                    name: route.mapPreview.originLabel,
                    coordinates: route.mapPreview.originCoordinates,
                    type: "place",
                  }
                : {
                    name: route.boarding.label,
                    canonicalId: route.boarding.id,
                    type: route.boarding.type,
                  },
            )
          }
          className="h-11 w-full rounded-[20px] bg-[linear-gradient(135deg,#5a43d7_0%,#765ef1_100%)] text-sm text-white hover:opacity-95"
        >
          <Route className="mr-2 h-5 w-5" />
          Return trip
        </Button>
      </div>
    </div>
  );
}
