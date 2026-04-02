"use client";

import { MapPin, Navigation2 } from "lucide-react";

import { GoogleRoutePreview } from "@/components/map/google-route-preview";
import { cn } from "@/lib/utils";
import type { RouteOption } from "@/lib/validations/routes";

interface DhakaMapProps {
  activeRoute?: RouteOption | null;
}

function StaticDhakaPreview() {
  return (
    <div className="soft-grid relative h-full w-full overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.95),rgba(230,240,248,0.92),rgba(213,228,241,0.95))]">
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,23,42,0.08),transparent_22%,rgba(8,23,42,0.12))]" />
      <div className="absolute inset-x-6 top-24 rounded-[32px] border border-white/55 bg-white/72 p-5 shadow-[0_28px_60px_-40px_rgba(15,23,42,0.45)] backdrop-blur-xl">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/12 text-primary">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <p className="font-display text-lg font-semibold text-foreground">
              Dhaka transit preview
            </p>
            <p className="text-sm text-muted-foreground">
              Search by place, landmark, bus stop, or metro station.
            </p>
          </div>
        </div>

        <div className="rounded-[28px] border border-white/55 bg-white/70 p-4">
          <div className="mb-2 flex items-center justify-between text-sm text-muted-foreground">
            <span>Map Preview</span>
            <span>Transit-first routing</span>
          </div>
          <div className="relative h-56 overflow-hidden rounded-[24px] bg-[radial-gradient(circle_at_top,rgba(19,184,109,0.18),transparent_34%),radial-gradient(circle_at_bottom_right,rgba(21,95,200,0.22),transparent_38%),linear-gradient(180deg,#ecf4fb,#dbe9f6)]">
            <div className="absolute left-[18%] top-[26%] h-14 w-14 rounded-full bg-primary/16 blur-xl" />
            <div className="absolute bottom-[20%] right-[18%] h-14 w-14 rounded-full bg-secondary/22 blur-xl" />
            <div className="absolute inset-x-[12%] top-[44%] h-2 rounded-full bg-white/75 shadow-[0_0_0_6px_rgba(255,255,255,0.1)]" />
            <div className="absolute left-[22%] top-[32%] flex h-11 w-11 items-center justify-center rounded-full bg-secondary text-white shadow-lg">
              <Navigation2 className="h-5 w-5" />
            </div>
            <div className="absolute bottom-[24%] right-[22%] flex h-11 w-11 items-center justify-center rounded-full bg-primary text-white shadow-lg">
              <MapPin className="h-5 w-5" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function DhakaMap({ activeRoute }: DhakaMapProps) {
  if (!activeRoute) {
    return <StaticDhakaPreview />;
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-[linear-gradient(180deg,#edf5fb,#dce9f5)]">
      <GoogleRoutePreview
        originQuery={activeRoute.mapPreview.originQuery}
        destinationQuery={activeRoute.mapPreview.destinationQuery}
        className="h-full w-full rounded-none"
      />
      <div className="pointer-events-none absolute inset-x-5 bottom-5 rounded-[26px] border border-white/60 bg-white/78 px-4 py-3 shadow-[0_20px_50px_-36px_rgba(15,31,55,0.52)] backdrop-blur-xl">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Active Route
            </p>
            <p className="mt-1 truncate font-display text-base font-semibold text-foreground">
              {activeRoute.mapPreview.originLabel} to {activeRoute.mapPreview.destinationLabel}
            </p>
          </div>
          {activeRoute.estimatedDurationMinutes ? (
            <div className="rounded-full bg-primary/8 px-3 py-2 text-sm font-semibold text-primary">
              {activeRoute.estimatedDurationMinutes} min
            </div>
          ) : null}
        </div>
        {activeRoute.primaryReason ? (
          <p className="mt-2 text-sm text-muted-foreground">{activeRoute.primaryReason}</p>
        ) : null}
      </div>
    </div>
  );
}

export function MapFrame({
  activeRoute,
  className,
}: DhakaMapProps & { className?: string }) {
  return (
    <div className={cn("absolute inset-0 h-full w-full", className)}>
      <DhakaMap activeRoute={activeRoute} />
    </div>
  );
}
