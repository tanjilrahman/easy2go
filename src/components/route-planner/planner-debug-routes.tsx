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
    <div className="rounded-[18px] border border-[rgba(90,67,215,0.12)] bg-white p-3">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-slate-900">Debug: all routes found</p>
          <p className="text-xs text-slate-500">{routes.length} unique route candidates</p>
        </div>
      </div>

      <div className="space-y-2">
        {routes.map((route, index) => (
          <div
            key={`${route.id}-${index}`}
            className="rounded-[16px] border border-[rgba(90,67,215,0.1)] bg-[rgba(244,241,255,0.5)] px-3 py-2.5"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[rgb(54,40,124)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white">
                #{index + 1}
              </span>
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

            <p className="mt-2 text-sm font-semibold text-slate-900">{route.summary}</p>
            <p className="mt-0.5 text-xs text-slate-600">
              {route.boarding.label} to {route.alighting.label}
            </p>

            <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-600">
              <span className="compare-metric">
                <Clock3 className="h-3.5 w-3.5 text-[rgb(118,94,241)]" />
                <span>{route.estimatedDurationMinutes ? `${route.estimatedDurationMinutes} min` : "N/A"}</span>
              </span>
              <span className="compare-metric">
                <Coins className="h-3.5 w-3.5 text-[rgb(15,138,107)]" />
                <span>{formatBdt(route.totalCost)}</span>
              </span>
            </div>

            {route.serviceLabels.length ? (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {route.serviceLabels.map((service) => (
                  <span
                    key={service}
                    className="rounded-full border border-[rgba(90,67,215,0.12)] bg-white px-2.5 py-1 text-[11px] font-medium text-[rgb(72,53,173)]"
                  >
                    {service}
                  </span>
                ))}
              </div>
            ) : null}

            <p className="mt-2 break-all font-mono text-[10px] text-slate-500">
              {route.pathSignature}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
