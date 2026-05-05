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
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                      getRouteKindTone(route.kind),
                    )}
                  >
                    {getRouteKindLabel(route.kind)}
                  </span>
                  <span
                    className={cn(
                      "rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]",
                      getConfidenceTone(route.confidence),
                    )}
                  >
                    {route.confidence}
                  </span>
                </div>
                <h3 className="font-display text-base font-semibold text-foreground">
                  {route.summary}
                </h3>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {route.mapPreview.originLabel} to {route.mapPreview.destinationLabel}
                </p>
                {route.mapPreview.originLabel !== route.boarding.label ? (
                  <p className="mt-1 text-xs text-muted-foreground">Board at {route.boarding.label}</p>
                ) : null}
                {route.boarding.canonicalLabel &&
                route.boarding.canonicalLabel !== route.boarding.label ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Parent stop: {route.boarding.canonicalLabel}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={onBack}
              >
                <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                {onBackLabel}
              </Button>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-2">
              <div className="compare-metric">
                <Timer className="h-4 w-4 text-secondary" />
                <span>{route.estimatedDurationMinutes ? `${route.estimatedDurationMinutes} min` : "N/A"}</span>
              </div>
              <div className="compare-metric">
                <Coins className="h-4 w-4 text-emerald-600" />
                <span>{formatBdt(route.totalCost)}</span>
              </div>
              <div className="compare-metric">
                <History className="h-4 w-4 text-amber-600" />
                <span>{route.transferCount ? `${route.transferCount} transfer` : "Direct flow"}</span>
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
            {route.scoringReason ? (
              <p className="mt-2 text-xs text-muted-foreground">{route.scoringReason}</p>
            ) : null}
          </div>

          <div className="space-y-2.5">
            {route.segments.map((segment, index) =>
              compactModes.has(segment.mode) ? (
                <div
                  key={`${segment.instruction}-${index}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2.5 text-sm"
                >
                  <TransportIcon mode={segment.mode} size="sm" />
                  <div className="min-w-0 flex-1 text-muted-foreground">
                    <span className="font-medium text-foreground">{segment.instruction}</span>
                    <span className="text-muted-foreground/80"> — {segment.startLocation} to {segment.endLocation}</span>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    {segment.estimatedDurationMinutes ? `${segment.estimatedDurationMinutes} min` : null}
                    {segment.estimatedDistanceKm ? ` · ${segment.estimatedDistanceKm} km` : null}
                  </div>
                </div>
              ) : (
                <div
                  key={`${segment.instruction}-${index}`}
                  className="rounded-xl border border-border bg-surface px-4 py-3"
                >
                  <div className="flex gap-3.5">
                    <TransportIcon mode={segment.mode} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-display text-[15px] font-semibold text-foreground">
                          {segment.instruction}
                        </p>
                        {segment.connectorType ? (
                          <span className="rounded-lg bg-primary/6 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-primary/80">
                            {segment.connectorType}
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-sm text-muted-foreground">
                        {segment.startLocation} to {segment.endLocation}
                      </p>
                      <div className="mt-2 flex flex-wrap gap-1.5 text-xs text-muted-foreground">
                        {segment.estimatedDurationMinutes ? (
                          <span className="rounded-lg bg-surface-strong border border-border px-2.5 py-1">
                            {segment.estimatedDurationMinutes} min
                          </span>
                        ) : null}
                        {segment.estimatedDistanceKm ? (
                          <span className="rounded-lg bg-surface-strong border border-border px-2.5 py-1">
                            {segment.estimatedDistanceKm} km
                          </span>
                        ) : null}
                        {segment.stopCount ? (
                          <span className="rounded-lg bg-surface-strong border border-border px-2.5 py-1">
                            {segment.stopCount} stops
                          </span>
                        ) : null}
                        {segment.stationCount ? (
                          <span className="rounded-lg bg-surface-strong border border-border px-2.5 py-1">
                            {segment.stationCount} stations
                          </span>
                        ) : null}
                        {segment.fareText ? (
                          <span className="rounded-lg bg-emerald-50 border border-emerald-100 px-2.5 py-1 text-emerald-700">
                            {segment.fareText}
                          </span>
                        ) : null}
                        {getPricingConfidenceLabel(segment.pricingConfidence) ? (
                          <span className="rounded-lg bg-surface-strong border border-border px-2.5 py-1">
                            {getPricingConfidenceLabel(segment.pricingConfidence)}
                          </span>
                        ) : null}
                      </div>
                      {segment.note ? (
                        <p className="mt-2 text-xs leading-5 text-muted-foreground">{segment.note}</p>
                      ) : null}
                      {segment.connectorType === "long_rickshaw" ? (
                        <p className="mt-2 text-xs leading-5 text-amber-700 bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
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
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="mb-2 text-sm font-semibold text-foreground">Notes</p>
              <div className="space-y-2">
                {route.advisories.map((advisory) => (
                  <p
                    key={advisory}
                    className="rounded-lg bg-surface-strong border border-border px-3 py-2 text-xs text-muted-foreground"
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

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-surface/95 pt-3 backdrop-blur-sm">
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
          size="lg"
          className="h-11 w-full text-sm shadow-lg shadow-primary/15"
        >
          <Route className="mr-2 h-5 w-5" />
          Return trip
        </Button>
      </div>
    </div>
  );
}
