"use client";

import { useMemo } from "react";

import { cn } from "@/lib/utils";
import type { RouteOption } from "@/lib/validations/routes";

interface GoogleRoutePreviewProps {
  route?: RouteOption | null;
  className?: string;
  userCoordinates?: [number, number] | null;
  viewportPaddingRatio?: number;
  viewportBottomInsetPx?: number;
  isPickingLocation?: boolean;
}

function formatCoordinates(coordinates?: [number, number]) {
  return coordinates ? `${coordinates[0]},${coordinates[1]}` : undefined;
}

function getRouteLocation(route: RouteOption | null | undefined, role: "origin" | "destination") {
  const preview = route?.mapPreview;

  if (!preview) {
    return undefined;
  }

  if (role === "origin") {
    return (
      formatCoordinates(preview.originCoordinates) ??
      preview.originQuery ??
      preview.originLabel
    );
  }

  return (
    formatCoordinates(preview.destinationCoordinates) ??
    preview.destinationQuery ??
    preview.destinationLabel
  );
}

function buildEmbedUrl(
  apiKey: string,
  route?: RouteOption | null,
  isPickingLocation?: boolean,
) {
  const origin = getRouteLocation(route, "origin");
  const destination = getRouteLocation(route, "destination");
  const params = new URLSearchParams({
    key: apiKey,
    region: "BD",
    language: "en",
  });

  if (origin && destination && !isPickingLocation) {
    params.set("origin", origin);
    params.set("destination", destination);
    params.set("mode", "driving");
    return `https://www.google.com/maps/embed/v1/directions?${params.toString()}`;
  }

  params.set("center", "23.8103,90.4125");
  params.set("zoom", "12");
  return `https://www.google.com/maps/embed/v1/view?${params.toString()}`;
}

export function GoogleRoutePreview({
  route,
  className,
  isPickingLocation,
}: GoogleRoutePreviewProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const embedUrl = useMemo(
    () => buildEmbedUrl(apiKey, route, isPickingLocation),
    [apiKey, isPickingLocation, route],
  );

  if (!apiKey) {
    return <div className={cn("relative overflow-hidden bg-[#e8f0f7]", className)} />;
  }

  return (
    <div className={cn("relative overflow-hidden bg-[#e8f0f7]", className)}>
      <iframe
        key={isPickingLocation ? "locked-location-pick-view" : embedUrl}
        title="Google Maps route preview"
        src={embedUrl}
        className="absolute inset-0 h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        allowFullScreen
      />
    </div>
  );
}
