"use client";

import { History, Route, Timer } from "lucide-react";

import {
  RouteCoreMetrics,
  RouteOverview,
  RouteServiceLabels,
} from "@/components/route-planner/route-summary";
import { Button } from "@/components/ui/button";
import { TransportIcon } from "@/components/transport-icon";

import type { LocationInput, RouteOption } from "@/lib/validations/routes";

interface PlannerItineraryPaneProps {
  route: RouteOption | null;
  onUseReturnTrip: (origin: LocationInput, destination: LocationInput) => void;
}

export function PlannerItineraryPane({
  route,
  onUseReturnTrip,
}: PlannerItineraryPaneProps) {
  if (!route) {
    return null;
  }

  const compactModes = new Set(["walk", "ride_share"]);

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-2 pb-2">
          <div className="rounded-xl border border-border bg-surface p-3">
            <RouteOverview route={route} showParentStop />

            <div className="mt-2 grid grid-cols-3 gap-2">
              <RouteCoreMetrics route={route} durationIcon={Timer} transferIcon={History} />
            </div>

            <RouteServiceLabels route={route} />
          </div>

          <div className="space-y-2">
            {route.segments.map((segment, index) =>
              compactModes.has(segment.mode) ? (
                <div
                  key={`${segment.instruction}-${index}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-sm"
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
                  className="rounded-xl border border-border bg-surface px-3 py-2.5"
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
            <div className="rounded-xl border border-border bg-surface p-3">
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

        </div>
      </div>

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-surface/95 pt-2 backdrop-blur-sm">
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
          className="h-10 w-full text-sm shadow-lg shadow-primary/15"
        >
          <Route className="mr-2 h-5 w-5" />
          Return trip
        </Button>
      </div>
    </div>
  );
}
