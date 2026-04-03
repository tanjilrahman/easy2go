"use client";

import { GoogleRoutePreview } from "@/components/map/google-route-preview";
import { cn } from "@/lib/utils";
import type { RouteOption } from "@/lib/validations/routes";

interface DhakaMapProps {
  activeRoute?: RouteOption | null;
  userCoordinates?: [number, number] | null;
  viewportPaddingRatio?: number;
  viewportBottomInsetPx?: number;
}
export function DhakaMap({
  activeRoute,
  userCoordinates,
  viewportPaddingRatio,
  viewportBottomInsetPx,
}: DhakaMapProps) {
  return (
    <div className="relative h-full w-full overflow-hidden bg-[linear-gradient(180deg,#edf5fb,#dce9f5)]">
      <GoogleRoutePreview
        originQuery={activeRoute?.mapPreview.originQuery}
        destinationQuery={activeRoute?.mapPreview.destinationQuery}
        originCoordinates={activeRoute?.mapPreview.originCoordinates}
        destinationCoordinates={activeRoute?.mapPreview.destinationCoordinates}
        userCoordinates={userCoordinates}
        viewportPaddingRatio={viewportPaddingRatio}
        viewportBottomInsetPx={viewportBottomInsetPx}
        className="h-full w-full rounded-none"
      />
    </div>
  );
}

export function MapFrame({
  activeRoute,
  userCoordinates,
  viewportPaddingRatio,
  viewportBottomInsetPx,
  className,
}: DhakaMapProps & { className?: string }) {
  return (
    <div className={cn("absolute inset-0 h-full w-full", className)}>
      <DhakaMap
        activeRoute={activeRoute}
        userCoordinates={userCoordinates}
        viewportPaddingRatio={viewportPaddingRatio}
        viewportBottomInsetPx={viewportBottomInsetPx}
      />
    </div>
  );
}
