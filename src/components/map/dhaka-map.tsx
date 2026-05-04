"use client";

import type { MouseEvent } from "react";

import { GoogleRoutePreview } from "@/components/map/google-route-preview";
import { DHAKA_CENTER } from "@/lib/maps";
import { cn } from "@/lib/utils";
import type { RouteOption } from "@/lib/validations/routes";

export type MapPickMode = "origin" | "destination";

interface DhakaMapProps {
  activeRoute?: RouteOption | null;
  userCoordinates?: [number, number] | null;
  viewportPaddingRatio?: number;
  viewportBottomInsetPx?: number;
  pickMode?: MapPickMode | null;
  pickedOriginCoordinates?: [number, number] | null;
  pickedDestinationCoordinates?: [number, number] | null;
  onPickLocation?: (coordinates: [number, number], mode: MapPickMode) => void;
}

const PICK_ZOOM = 12;
const TILE_SIZE = 256;

function projectLatLng([lat, lng]: [number, number], zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const sinLat = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999);

  return {
    x: ((lng + 180) / 360) * scale,
    y: (0.5 - Math.log((1 + sinLat) / (1 - sinLat)) / (4 * Math.PI)) * scale,
  };
}

function unprojectLatLng(point: { x: number; y: number }, zoom: number): [number, number] {
  const scale = TILE_SIZE * 2 ** zoom;
  const lng = (point.x / scale) * 360 - 180;
  const n = Math.PI - (2 * Math.PI * point.y) / scale;
  const lat = (180 / Math.PI) * Math.atan(Math.sinh(n));

  return [Number(lat.toFixed(6)), Number(lng.toFixed(6))];
}

function getCoordinatesFromClick(event: MouseEvent<HTMLButtonElement>): [number, number] {
  const bounds = event.currentTarget.getBoundingClientRect();
  const center = projectLatLng(DHAKA_CENTER, PICK_ZOOM);
  const clickedPoint = {
    x: center.x + event.clientX - bounds.left - bounds.width / 2,
    y: center.y + event.clientY - bounds.top - bounds.height / 2,
  };

  return unprojectLatLng(clickedPoint, PICK_ZOOM);
}

function getMarkerStyle(coordinates: [number, number]) {
  const center = projectLatLng(DHAKA_CENTER, PICK_ZOOM);
  const marker = projectLatLng(coordinates, PICK_ZOOM);

  return {
    left: `calc(50% + ${marker.x - center.x}px)`,
    top: `calc(50% + ${marker.y - center.y}px)`,
  };
}

export function DhakaMap({
  activeRoute,
  userCoordinates,
  viewportPaddingRatio,
  viewportBottomInsetPx,
  pickMode,
  pickedOriginCoordinates,
  pickedDestinationCoordinates,
  onPickLocation,
}: DhakaMapProps) {
  const canPlaceLocalMarkers = Boolean(pickMode || !activeRoute);
  const hasPickedCoordinates = Boolean(pickedOriginCoordinates || pickedDestinationCoordinates);
  const shouldLockEmbeddedView = Boolean(pickMode || (!activeRoute && hasPickedCoordinates));

  return (
    <div className="relative h-full w-full overflow-hidden bg-[linear-gradient(180deg,#edf5fb,#dce9f5)]">
      <GoogleRoutePreview
        route={activeRoute}
        userCoordinates={userCoordinates}
        viewportPaddingRatio={viewportPaddingRatio}
        viewportBottomInsetPx={viewportBottomInsetPx}
        isPickingLocation={shouldLockEmbeddedView}
        className="h-full w-full rounded-none"
      />
      {shouldLockEmbeddedView && !pickMode ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 z-10 cursor-default bg-transparent"
        />
      ) : null}
      {canPlaceLocalMarkers && pickedOriginCoordinates ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[rgb(21,184,109)] shadow-[0_10px_24px_rgba(15,23,42,0.28)]"
          style={getMarkerStyle(pickedOriginCoordinates)}
        />
      ) : null}
      {canPlaceLocalMarkers && pickedDestinationCoordinates ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute z-20 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[rgb(242,95,103)] shadow-[0_10px_24px_rgba(15,23,42,0.28)]"
          style={getMarkerStyle(pickedDestinationCoordinates)}
        />
      ) : null}
      {pickMode ? (
        <button
          type="button"
          aria-label={`Pick ${pickMode === "origin" ? "current location" : "destination"} on map`}
          onClick={(event) => onPickLocation?.(getCoordinatesFromClick(event), pickMode)}
          className="absolute inset-0 z-30 cursor-crosshair bg-transparent"
        />
      ) : null}
    </div>
  );
}

export function MapFrame({
  activeRoute,
  userCoordinates,
  viewportPaddingRatio,
  viewportBottomInsetPx,
  pickMode,
  pickedOriginCoordinates,
  pickedDestinationCoordinates,
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
        pickedOriginCoordinates={pickedOriginCoordinates}
        pickedDestinationCoordinates={pickedDestinationCoordinates}
        onPickLocation={onPickLocation}
      />
    </div>
  );
}
