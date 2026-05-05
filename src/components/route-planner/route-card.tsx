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
  const hasVariantBoarding =
    route.boarding.canonicalLabel &&
    route.boarding.canonicalLabel !== route.boarding.label;

  return (
    <motion.button
      type="button"
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.985 }}
      onClick={onClick}
      className={cn(
        "relative w-full overflow-hidden rounded-xl border px-4 py-4 text-left shadow-sm transition",
        selected
          ? "border-primary/25 bg-primary/[0.03]"
          : "border-border bg-surface hover:border-primary/15",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge
              variant="subtle"
              className={cn(getRouteKindTone(route.kind))}
            >
              {getRouteKindLabel(route.kind)}
            </Badge>
            <Badge
              variant="subtle"
              className={cn(getConfidenceTone(route.confidence))}
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
            <p className="mt-1 text-xs text-muted-foreground">
              Board at {route.boarding.label}
            </p>
          ) : null}
          {hasVariantBoarding ? (
            <p className="mt-1 text-xs text-muted-foreground/80">
              Parent stop: {route.boarding.canonicalLabel}
            </p>
          ) : null}
        </div>

        <ArrowRight className="mt-1 h-5 w-5 shrink-0 text-muted-foreground/40" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
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

      {route.primaryReason || route.scoringReason ? (
        <p className="mb-3 text-xs text-muted-foreground">
          {route.primaryReason ?? route.scoringReason}
        </p>
      ) : null}

      {route.advisories.length ? (
        <div className="flex flex-wrap gap-2">
          {route.advisories.slice(0, 2).map((advisory) => (
            <Badge
              key={advisory}
              variant="outline"
              className="text-[10px]"
            >
              {advisory}
            </Badge>
          ))}
        </div>
      ) : null}
    </motion.button>
  );
}
