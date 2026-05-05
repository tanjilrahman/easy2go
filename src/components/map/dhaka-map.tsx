"use client";

import { OpenMap, type MapPickMode } from "@/components/map/open-map";
import { cn } from "@/lib/utils";
import type { LocationInput, RouteOption } from "@/lib/validations/routes";

interface DhakaMapProps {
  activeRoute?: RouteOption | null;
  userCoordinates?: [number, number] | null;
  viewportPaddingRatio?: number;
  viewportBottomInsetPx?: number;
  pickMode?: MapPickMode | null;
  originSelection?: LocationInput | null;
  destinationSelection?: LocationInput | null;
  onPickLocation?: (coordinates: [number, number], mode: MapPickMode) => void;
}

export type { MapPickMode };

function DhakaMap({
  activeRoute,
  userCoordinates,
  viewportPaddingRatio,
  viewportBottomInsetPx,
  pickMode,
  originSelection,
  destinationSelection,
  onPickLocation,
}: DhakaMapProps) {
  return (
    <OpenMap
      activeRoute={activeRoute}
      userCoordinates={userCoordinates}
      viewportPaddingRatio={viewportPaddingRatio}
      viewportBottomInsetPx={viewportBottomInsetPx}
      pickMode={pickMode}
      originSelection={originSelection}
      destinationSelection={destinationSelection}
      onPickLocation={onPickLocation}
      className="h-full w-full rounded-none"
    />
  );
}

export function MapFrame({
  activeRoute,
  userCoordinates,
  viewportPaddingRatio,
  viewportBottomInsetPx,
  pickMode,
  originSelection,
  destinationSelection,
  onPickLocation,
  className,
}: DhakaMapProps & { className?: string }) {
  return (
    <div className={cn("absolute inset-0 h-full w-full", className)}>
      <DhakaMap
        activeRoute={activeRoute}
        userCoordinates={userCoordinates}
        viewportPaddingRatio={viewportPaddingRatio}
        viewportBottomInsetPx={viewportBottomInsetPx}
        pickMode={pickMode}
        originSelection={originSelection}
        destinationSelection={destinationSelection}
        onPickLocation={onPickLocation}
      />
    </div>
  );
}
