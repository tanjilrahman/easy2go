"use client";

import { AlertCircle, ArrowRight, History, Route, Timer } from "lucide-react";
import type { ReactNode } from "react";

import {
  RouteCoreMetrics,
  RouteOverview,
} from "@/components/route-planner/route-summary";
import { Button } from "@/components/ui/button";
import { TransportIcon } from "@/components/transport-icon";

import type { LocationInput, RouteOption } from "@/lib/validations/routes";
import { cn } from "@/lib/utils";

interface PlannerItineraryPaneProps {
  route: RouteOption | null;
  onUseReturnTrip: (origin: LocationInput, destination: LocationInput) => void;
}

function SegmentEndpoints({
  startLocation,
  endLocation,
  className,
}: {
  startLocation: string;
  endLocation: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-1 flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-muted-foreground",
        className,
      )}
    >
      <span className="truncate">{startLocation}</span>
      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
      <span className="truncate">{endLocation}</span>
    </div>
  );
}

function SegmentDetailChip({
  children,
  tone = "default",
}: {
  children: ReactNode;
  tone?: "default" | "fare";
}) {
  return (
    <span
      className={cn(
        "rounded-lg border px-2.5 py-1 text-[11px] font-medium",
        tone === "fare"
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-border bg-surface-strong text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function getSegmentServiceLabels(
  route: RouteOption,
  segment: RouteOption["segments"][number],
) {
  const normalizedInstruction = segment.instruction.toLowerCase();

  return route.serviceLabels.filter((service) => {
    const normalizedService = service.toLowerCase();

    if (normalizedInstruction.includes(normalizedService)) {
      return true;
    }

    if (segment.mode === "metro") {
      return (
        normalizedService.includes("mrt") || normalizedService.includes("metro")
      );
    }

    if (segment.mode === "bus" && route.kind === "bus_direct") {
      return true;
    }

    return false;
  });
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
            <RouteOverview route={route} showParentStop showStopChain={false} />

            <div className="mt-2.5 flex items-center gap-3 text-xs">
              <RouteCoreMetrics
                route={route}
                durationIcon={Timer}
                transferIcon={History}
              />
            </div>
          </div>

          <div className="relative py-1">
            <div className="absolute bottom-5 left-[21px] top-5 w-px bg-border" />
            <div className="space-y-5">
              {route.segments.map((segment, index) => {
                const isCompact = compactModes.has(segment.mode);
                const serviceLabels = getSegmentServiceLabels(route, segment);

                return (
                  <div
                    key={`${segment.instruction}-${index}`}
                    className="relative flex gap-3.5"
                  >
                    <div className="relative z-10 flex w-11 shrink-0 justify-center">
                      <TransportIcon
                        mode={segment.mode}
                        size={isCompact ? "sm" : "md"}
                        className="ring-4 ring-surface"
                      />
                    </div>
                    <div className="min-w-0 flex-1 pb-0.5 pt-0.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-display text-[15px] font-semibold tracking-tight text-foreground">
                              {segment.instruction}
                            </p>
                          </div>
                          {serviceLabels.length ? (
                            <div className="mt-1.5 flex flex-wrap gap-1.5">
                              {serviceLabels.map((service) => (
                                <span
                                  key={service}
                                  className="rounded-lg border border-border bg-surface-strong px-2.5 py-1 text-[11px] font-medium text-primary"
                                >
                                  {service}
                                </span>
                              ))}
                            </div>
                          ) : null}
                          <SegmentEndpoints
                            startLocation={segment.startLocation}
                            endLocation={segment.endLocation}
                          />
                        </div>
                        {isCompact &&
                        (segment.estimatedDurationMinutes ||
                          segment.estimatedDistanceKm) ? (
                          <div className="shrink-0 whitespace-nowrap pt-0.5 text-right text-xs text-muted-foreground">
                            {segment.estimatedDurationMinutes ? (
                              <span className="font-semibold text-foreground">
                                {segment.estimatedDurationMinutes}m
                              </span>
                            ) : null}
                            {segment.estimatedDistanceKm ? (
                              <span> / {segment.estimatedDistanceKm}km</span>
                            ) : null}
                          </div>
                        ) : null}
                      </div>

                      {!isCompact ? (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {segment.estimatedDurationMinutes ? (
                            <SegmentDetailChip>
                              {segment.estimatedDurationMinutes} min
                            </SegmentDetailChip>
                          ) : null}
                          {segment.estimatedDistanceKm ? (
                            <SegmentDetailChip>
                              {segment.estimatedDistanceKm} km
                            </SegmentDetailChip>
                          ) : null}
                          {segment.stopCount ? (
                            <SegmentDetailChip>
                              {segment.stopCount} stops
                            </SegmentDetailChip>
                          ) : null}
                          {segment.stationCount ? (
                            <SegmentDetailChip>
                              {segment.stationCount} stations
                            </SegmentDetailChip>
                          ) : null}
                          {segment.fareText ? (
                            <SegmentDetailChip tone="fare">
                              {segment.fareText}
                            </SegmentDetailChip>
                          ) : null}
                        </div>
                      ) : null}

                      {segment.connectorType === "long_rickshaw" ? (
                        <div className="mt-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs leading-5 text-amber-800">
                          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                          <p>
                            Long connector: this rickshaw hop is larger than the
                            normal short-mile connector.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {route.advisories.length ? (
            <div className="rounded-xl border border-border bg-surface p-3">
              <div className="space-y-2">
                {route.advisories.map((advisory) => (
                  <div
                    key={advisory}
                    className="flex items-start gap-2 rounded-lg bg-surface-strong px-2.5 py-1.5 text-[11px] font-medium text-muted-foreground"
                  >
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="leading-5">{advisory}</p>
                  </div>
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
