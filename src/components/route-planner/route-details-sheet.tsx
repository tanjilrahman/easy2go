"use client";

import { MapPin } from "lucide-react";

import { OpenMap } from "@/components/map/open-map";
import { BottomSheet } from "@/components/route-planner/bottom-sheet";
import { Badge } from "@/components/ui/badge";
import { TransportIcon } from "@/components/transport-icon";
import {
  getConfidenceTone,
  getPricingConfidenceLabel,
  getRouteKindLabel,
  getRouteKindTone,
  transportModeMeta,
} from "@/lib/transport";
import type { RouteOption } from "@/lib/validations/routes";

interface RouteDetailsSheetProps {
  open: boolean;
  route?: RouteOption | null;
  onClose: () => void;
}

function formatDistance(distanceKm?: number) {
  if (!distanceKm) {
    return "N/A";
  }

  return Number.isInteger(distanceKm) ? `${distanceKm} km` : `${distanceKm.toFixed(1)} km`;
}

export function RouteDetailsSheet({ open, route, onClose }: RouteDetailsSheetProps) {
  return (
    <BottomSheet
      open={open && !!route}
      onClose={onClose}
      title="Route Details"
      subtitle={route ? `${route.summary} across Dhaka` : undefined}
      height="86vh"
    >
      {route ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="subtle" className={getRouteKindTone(route.kind)}>
                {getRouteKindLabel(route.kind)}
              </Badge>
              <Badge variant="subtle" className={getConfidenceTone(route.confidence)}>
                {route.confidence}
              </Badge>
              <Badge variant="outline" className="text-primary">
                {route.fareText}
              </Badge>
            </div>

            <div className="mt-4">
              <p className="text-sm text-muted-foreground">Board at</p>
              <h3 className="font-display text-[1.6rem] font-semibold text-primary">
                {route.boarding.label}
              </h3>
              {route.boarding.canonicalLabel &&
              route.boarding.canonicalLabel !== route.boarding.label ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Parent stop: {route.boarding.canonicalLabel}
                </p>
              ) : null}
            </div>

            <div className="mt-4">
              <p className="text-sm text-muted-foreground">Get down at</p>
              <h3 className="font-display text-[1.3rem] font-semibold text-foreground">
                {route.alighting.label}
              </h3>
              {route.alighting.canonicalLabel &&
              route.alighting.canonicalLabel !== route.alighting.label ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Parent stop: {route.alighting.canonicalLabel}
                </p>
              ) : null}
            </div>

            <div className="mt-4 grid grid-cols-2 gap-4 text-sm text-muted-foreground">
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/80">
                  Est. time
                </p>
                <p className="mt-1 font-medium text-foreground">
                  {route.estimatedDurationMinutes
                    ? `${route.estimatedDurationMinutes} min`
                    : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/80">
                  Distance
                </p>
                <p className="mt-1 font-medium text-foreground">
                  {formatDistance(route.estimatedDistanceKm)}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/80">
                  Stops
                </p>
                <p className="mt-1 font-medium text-foreground">
                  {route.stopCount ? route.stopCount : "N/A"}
                </p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/80">
                  Stations
                </p>
                <p className="mt-1 font-medium text-foreground">
                  {route.stationCount ? route.stationCount : "N/A"}
                </p>
              </div>
            </div>

            {route.serviceWindowText ? (
              <p className="mt-4 rounded-xl bg-surface-strong border border-border px-3 py-2 text-sm text-muted-foreground">
                Service window: {route.serviceWindowText}
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">Map Preview</p>
                <p className="text-xs text-muted-foreground">
                  Route preview from your selected start to destination.
                </p>
              </div>
            </div>
            <OpenMap activeRoute={route} className="h-64 w-full rounded-xl overflow-hidden" />
          </section>

          <section className="relative pl-4">
            <div className="timeline-rail absolute bottom-4 left-[23px] top-3 w-0.5 rounded-full" />
            <div className="space-y-6">
              {route.segments.map((segment, index) => (
                <div key={`${segment.instruction}-${index}`} className="relative flex gap-4">
                  <div className="relative z-10 bg-surface px-1">
                    <TransportIcon mode={segment.mode} />
                  </div>

                  <div className="min-w-0 flex-1 rounded-2xl border border-border bg-surface px-4 py-4 shadow-sm">
                    <div className="mb-2 flex items-center gap-2">
                      <p className="font-display text-base font-semibold text-foreground">
                        {segment.instruction}
                      </p>
                      <Badge variant="outline" className="text-[10px]">
                        {transportModeMeta[segment.mode].label}
                      </Badge>
                    </div>

                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium text-foreground">{segment.startLocation}</span>
                      {" to "}
                      <span className="font-medium text-foreground">{segment.endLocation}</span>
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                      {segment.stopCount ? (
                        <Badge variant="outline" className="text-xs">
                          {segment.stopCount} stops
                        </Badge>
                      ) : null}
                      {segment.stationCount ? (
                        <Badge variant="outline" className="text-xs">
                          {segment.stationCount} stations
                        </Badge>
                      ) : null}
                      {segment.fareText ? (
                        <Badge variant="outline" className="text-xs">
                          {segment.fareText}
                        </Badge>
                      ) : null}
                      {getPricingConfidenceLabel(segment.pricingConfidence) ? (
                        <Badge variant="outline" className="text-xs">
                          {getPricingConfidenceLabel(segment.pricingConfidence)}
                        </Badge>
                      ) : null}
                    </div>

                    {segment.serviceWindowText ? (
                      <p className="mt-3 rounded-xl bg-surface-strong border border-border px-3 py-2 text-sm text-muted-foreground">
                        Service window: {segment.serviceWindowText}
                      </p>
                    ) : null}

                    {segment.note ? (
                      <p className="mt-3 rounded-xl bg-surface-strong border border-border px-3 py-2 text-sm text-muted-foreground">
                        {segment.note}
                      </p>
                    ) : null}
                    {segment.connectorType === "long_rickshaw" ? (
                      <p className="mt-3 rounded-xl bg-amber-50 border border-amber-100 px-3 py-2 text-sm text-amber-800">
                        This is a long rickshaw connector. Expect a larger last-mile hop than the
                        usual short connector.
                      </p>
                    ) : null}
                  </div>
                </div>
              ))}

              <div className="relative flex gap-4">
                <div className="relative z-10 bg-surface px-1">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-rose-500 text-white shadow-md">
                    <MapPin className="h-5 w-5" />
                  </div>
                </div>
                <div className="flex flex-1 items-center rounded-2xl border border-border bg-surface px-4 py-4 shadow-sm">
                  <div>
                    <p className="font-display text-base font-semibold text-foreground">
                      Arrive at destination
                    </p>
                    <p className="text-sm text-muted-foreground">Reach {route.alighting.label}</p>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {route.advisories.length ? (
            <section className="rounded-2xl border border-border bg-surface p-5 shadow-sm">
              <p className="mb-3 font-display text-base font-semibold text-foreground">
                Advisory Notes
              </p>
              <div className="space-y-2">
                {route.advisories.map((advisory) => (
                  <p
                    key={advisory}
                    className="rounded-xl bg-surface-strong border border-border px-3 py-2 text-sm text-muted-foreground"
                  >
                    {advisory}
                  </p>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </BottomSheet>
  );
}
