"use client";

import { Clock3, Coins } from "lucide-react";

import { formatBdt, getConfidenceTone, getRouteKindLabel, getRouteKindTone } from "@/lib/transport";
import { cn } from "@/lib/utils";
import type { RouteOption } from "@/lib/validations/routes";

interface PlannerDebugRoutesProps {
  routes: RouteOption[];
}

export function PlannerDebugRoutes({ routes }: PlannerDebugRoutesProps) {
  if (!routes.length) {
    return null;
  }

  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-foreground">Debug: all routes found</p>
          <p className="text-xs text-muted-foreground">{routes.length} unique route candidates</p>
        </div>
      </div>

      <div className="space-y-2">
        {routes.map((route, index) => (
          <div
            key={`${route.id}-${index}`}
            className="rounded-xl border border-border bg-surface-strong px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-lg bg-foreground px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-foreground">
                #{index + 1}
              </span>
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

            <p className="mt-2 text-sm font-semibold text-foreground">{route.summary}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {route.mapPreview.originLabel} to {route.mapPreview.destinationLabel}
            </p>
            {route.mapPreview.originLabel !== route.boarding.label ? (
              <p className="mt-1 text-[11px] text-muted-foreground">Board at {route.boarding.label}</p>
            ) : null}

            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <span className="compare-metric">
                <Clock3 className="h-3.5 w-3.5 text-secondary" />
                <span>{route.estimatedDurationMinutes ? `${route.estimatedDurationMinutes} min` : "N/A"}</span>
              </span>
              <span className="compare-metric">
                <Coins className="h-3.5 w-3.5 text-emerald-600" />
                <span>{formatBdt(route.totalCost)}</span>
              </span>
              {route.connectorBurden ? (
                <span className="compare-metric">
                  <span>{route.connectorBurden} connector burden</span>
                </span>
              ) : null}
            </div>

            {route.serviceLabels.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {route.serviceLabels.map((service) => (
                  <span
                    key={service}
                    className="rounded-lg border border-border bg-surface px-2.5 py-1 text-[11px] font-medium text-primary"
                  >
                    {service}
                  </span>
                ))}
              </div>
            ) : null}

            <p className="mt-2 break-all font-mono text-[10px] text-muted-foreground">
              {route.pathSignature}
            </p>
            {route.scoringReason ? (
              <p className="mt-2 text-[11px] text-muted-foreground">{route.scoringReason}</p>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
