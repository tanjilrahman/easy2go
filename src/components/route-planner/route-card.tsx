"use client";

import { ArrowRight, Bus, Clock3, MapPinned, Ticket, TrainTrack } from "lucide-react";
import { motion } from "framer-motion";

import { Badge } from "@/components/ui/badge";
import { getConfidenceTone, getRouteKindLabel, getRouteKindTone } from "@/lib/transport";
import { cn } from "@/lib/utils";
import type { RouteOption } from "@/lib/validations/routes";

interface RouteCardProps {
  route: RouteOption;
  selected?: boolean;
  onClick: () => void;
}

function formatDistance(distanceKm?: number) {
  if (!distanceKm) {
    return null;
  }

  return Number.isInteger(distanceKm) ? `${distanceKm} km` : `${distanceKm.toFixed(1)} km`;
}

function RouteMetric({ route }: { route: RouteOption }) {
  if (route.stationCount) {
    return (
      <div className="flex items-center gap-1.5">
        <TrainTrack className="h-4 w-4 text-secondary" />
        <span>{route.stationCount} stations</span>
      </div>
    );
  }

  if (route.stopCount) {
    return (
      <div className="flex items-center gap-1.5">
        <Bus className="h-4 w-4 text-primary" />
        <span>{route.stopCount} stops</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <MapPinned className="h-4 w-4 text-primary" />
      <span>Transit preview</span>
    </div>
  );
}

export function RouteCard({ route, selected, onClick }: RouteCardProps) {
  return (
    <motion.button
      type="button"
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={cn(
        "relative w-full overflow-hidden rounded-[30px] border px-4 py-4 text-left shadow-[0_24px_50px_-40px_rgba(15,31,55,0.5)] transition",
        selected
          ? "border-primary/25 bg-primary/6"
          : "border-white/65 bg-white/84 hover:border-primary/16",
      )}
    >
      <div className="mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge
              className={cn(
                "border-0 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
                getRouteKindTone(route.kind),
              )}
            >
              {getRouteKindLabel(route.kind)}
            </Badge>
            <Badge
              className={cn(
                "border-0 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em]",
                getConfidenceTone(route.confidence),
              )}
            >
              {route.confidence}
            </Badge>
          </div>

          <h3 className="font-display text-lg font-semibold text-foreground">
            {route.summary}
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {route.mapPreview.originLabel} to {route.mapPreview.destinationLabel}
          </p>
          {route.mapPreview.originLabel !== route.boarding.label ? (
            <p className="mt-1 text-xs text-muted-foreground/90">
              Board at {route.boarding.label}
            </p>
          ) : null}
        </div>

        <ArrowRight className="mt-1 h-5 w-5 text-muted-foreground" />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
        {route.estimatedDurationMinutes ? (
          <div className="flex items-center gap-1.5">
            <Clock3 className="h-4 w-4 text-secondary" />
            <span>~{route.estimatedDurationMinutes} min</span>
          </div>
        ) : null}
        {route.estimatedDistanceKm ? (
          <div className="flex items-center gap-1.5">
            <MapPinned className="h-4 w-4 text-primary" />
            <span>{formatDistance(route.estimatedDistanceKm)}</span>
          </div>
        ) : null}
        <RouteMetric route={route} />
        <div className="flex items-center gap-1.5">
          <Ticket className="h-4 w-4 text-primary" />
          <span>{route.fareText}</span>
        </div>
      </div>

      {route.transferStops.length ? (
        <p className="mb-3 text-sm text-muted-foreground">
          Transfer via {route.transferStops.map((stop) => stop.label).join(", ")}
        </p>
      ) : null}

      {route.advisories.length ? (
        <div className="flex flex-wrap gap-2">
          {route.advisories.slice(0, 2).map((advisory) => (
            <Badge
              key={advisory}
              className="border border-border bg-white px-2 py-1 text-[10px] text-muted-foreground"
            >
              {advisory}
            </Badge>
          ))}
        </div>
      ) : null}
    </motion.button>
  );
}
