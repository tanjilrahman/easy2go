"use client";

import { Clock3, Coins } from "lucide-react";

import {
  RouteMetric,
  RouteOverview,
  RouteServiceLabels,
} from "@/components/route-planner/route-summary";
import { formatBdt } from "@/lib/transport";
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
            <RouteOverview route={route} label={`#${index + 1}`} boardTextClassName="text-[11px]" />

            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
              <RouteMetric icon={Clock3} iconClassName="text-secondary">
                {route.estimatedDurationMinutes ? `${route.estimatedDurationMinutes} min` : "N/A"}
              </RouteMetric>
              <RouteMetric icon={Coins} iconClassName="text-emerald-600">
                {formatBdt(route.totalCost)}
              </RouteMetric>
              {route.connectorBurden ? (
                <span className="compare-metric">
                  <span>{route.connectorBurden} connector burden</span>
                </span>
              ) : null}
            </div>

            <RouteServiceLabels route={route} className="bg-surface text-primary" textClassName="text-[11px]" />

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
