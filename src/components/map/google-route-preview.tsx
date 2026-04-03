"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { CircleF, DirectionsRenderer, GoogleMap, useJsApiLoader } from "@react-google-maps/api";

import { DHAKA_CENTER } from "@/lib/maps";
import { cn } from "@/lib/utils";

const libraries: ("places")[] = ["places"];

type RouteTravelMode = google.maps.TravelMode;

const lightMapStyles: google.maps.MapTypeStyle[] = [
  {
    featureType: "poi",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "transit.station",
    stylers: [{ visibility: "off" }],
  },
  {
    featureType: "road",
    elementType: "labels.icon",
    stylers: [{ visibility: "off" }],
  },
];

interface GoogleRoutePreviewProps {
  originQuery?: string;
  destinationQuery?: string;
  originCoordinates?: [number, number];
  destinationCoordinates?: [number, number];
  className?: string;
  userCoordinates?: [number, number] | null;
  viewportPaddingRatio?: number;
  viewportBottomInsetPx?: number;
}

export function GoogleRoutePreview({
  originQuery,
  destinationQuery,
  originCoordinates,
  destinationCoordinates,
  className,
  userCoordinates,
  viewportPaddingRatio = 0.36,
  viewportBottomInsetPx,
}: GoogleRoutePreviewProps) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const { isLoaded } = useJsApiLoader({
    googleMapsApiKey: apiKey,
    libraries,
  });
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [directions, setDirections] = useState<google.maps.DirectionsResult | null>(null);
  const hasRoute = Boolean(
    (originCoordinates || originQuery) && (destinationCoordinates || destinationQuery),
  );

  const center = useMemo(
    () =>
      userCoordinates
        ? { lat: userCoordinates[0], lng: userCoordinates[1] }
        : { lat: DHAKA_CENTER[0], lng: DHAKA_CENTER[1] },
    [userCoordinates],
  );

  const resolvedBottomInsetPx = useMemo(() => {
    if (viewportBottomInsetPx && viewportBottomInsetPx > 0) {
      return Math.round(viewportBottomInsetPx);
    }

    if (typeof window === "undefined") {
      return 0;
    }

    return Math.round(window.innerHeight * viewportPaddingRatio);
  }, [viewportBottomInsetPx, viewportPaddingRatio]);

  function clearRoutePreview() {
    startTransition(() => {
      setDirections(null);
    });
  }

  function buildRouteEndpoint(
    coordinates: [number, number] | undefined,
    query: string | undefined,
  ): string | google.maps.LatLngLiteral | null {
    if (coordinates) {
      return {
        lat: coordinates[0],
        lng: coordinates[1],
      } satisfies google.maps.LatLngLiteral;
    }

    return query ?? null;
  }

  useEffect(() => {
    if (!isLoaded || !hasRoute || typeof window === "undefined") {
      clearRoutePreview();
      return;
    }

    const origin = buildRouteEndpoint(originCoordinates, originQuery);
    const destination = buildRouteEndpoint(destinationCoordinates, destinationQuery);

    if (!origin || !destination) {
      clearRoutePreview();
      return;
    }

    let cancelled = false;

    const loadRoute = async () => {
      const service = new window.google.maps.DirectionsService();

      const computePath = async (travelMode: RouteTravelMode) => {
        const response = await service.route({
          origin,
          destination,
          travelMode,
          transitOptions:
            travelMode === window.google.maps.TravelMode.TRANSIT
              ? {
                  departureTime: new Date(),
                }
              : undefined,
        });

        if (!response.routes?.length) {
          return false;
        }

        if (!cancelled) {
          startTransition(() => {
            setDirections(response);
          });
        }

        return true;
      };

      try {
        const hasTransitPath = await computePath(window.google.maps.TravelMode.TRANSIT);

        if (!hasTransitPath && !cancelled) {
          const hasDrivingPath = await computePath(window.google.maps.TravelMode.DRIVING);

          if (!hasDrivingPath && !cancelled) {
            clearRoutePreview();
          }
        }
      } catch {
        if (cancelled) {
          return;
        }

        try {
          const hasDrivingPath = await computePath(window.google.maps.TravelMode.DRIVING);

          if (!hasDrivingPath && !cancelled) {
            clearRoutePreview();
          }
        } catch {
          if (!cancelled) {
            clearRoutePreview();
          }
        }
      }
    };

    void loadRoute();

    return () => {
      cancelled = true;
    };
  }, [
    destinationCoordinates,
    destinationQuery,
    hasRoute,
    isLoaded,
    originCoordinates,
    originQuery,
  ]);

  useEffect(() => {
    if (!map || !isLoaded || typeof window === "undefined") {
      return;
    }

    const routeBounds = directions?.routes[0]?.bounds;

    if (routeBounds) {
      map.fitBounds(routeBounds, {
        top: 24,
        right: 24,
        left: 24,
        bottom: resolvedBottomInsetPx,
      });
      return;
    }

    map.setZoom(userCoordinates ? 14 : 12);
    map.panTo(center);

    if (resolvedBottomInsetPx > 0) {
      google.maps.event.addListenerOnce(map, "idle", () => {
        map.panBy(0, Math.round(resolvedBottomInsetPx / 2));
      });
    }
  }, [center, directions, isLoaded, map, resolvedBottomInsetPx, userCoordinates]);

  if (!apiKey) {
    return (
      <div
        className={cn(
          "relative overflow-hidden bg-[linear-gradient(180deg,#f3f8fc,#dde9f3)]",
          className,
        )}
      />
    );
  }

  if (!isLoaded) {
    return <div className={cn("relative overflow-hidden bg-[#e8f0f7]", className)} />;
  }

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <GoogleMap
        onLoad={setMap}
        mapContainerClassName="absolute inset-0 h-full w-full"
        center={center}
        zoom={userCoordinates ? 14 : 12}
        options={{
          disableDefaultUI: true,
          clickableIcons: false,
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          keyboardShortcuts: false,
          gestureHandling: "greedy",
          styles: lightMapStyles,
        }}
      >
        {directions ? (
          <DirectionsRenderer
            directions={directions}
            options={{
              preserveViewport: true,
              suppressMarkers: false,
              suppressInfoWindows: true,
            }}
          />
        ) : null}

        {userCoordinates && !directions ? (
          <>
            <CircleF
              center={{ lat: userCoordinates[0], lng: userCoordinates[1] }}
              radius={65}
              options={{
                strokeOpacity: 0,
                fillColor: "#2563eb",
                fillOpacity: 0.14,
              }}
            />
            <CircleF
              center={{ lat: userCoordinates[0], lng: userCoordinates[1] }}
              radius={12}
              options={{
                fillColor: "#2563eb",
                fillOpacity: 1,
                strokeColor: "#ffffff",
                strokeWeight: 3,
              }}
            />
          </>
        ) : null}
      </GoogleMap>
    </div>
  );
}
