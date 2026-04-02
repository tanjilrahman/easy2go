"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { CircleF, GoogleMap, PolylineF, useJsApiLoader } from "@react-google-maps/api";

import { DHAKA_CENTER } from "@/lib/maps";
import { cn } from "@/lib/utils";

const libraries: ("places")[] = ["places"];

type RouteTravelMode = string;

interface RoutePathPoint {
  lat: number | (() => number);
  lng: number | (() => number);
}

interface RouteResult {
  path?: RoutePathPoint[];
  viewport?: google.maps.LatLngBounds | null;
}

interface ComputeRoutesResponse {
  routes?: RouteResult[];
}

interface RouteClassLibrary {
  Route: {
    computeRoutes(request: {
      origin: string;
      destination: string;
      travelMode: RouteTravelMode;
      fields: string[];
      departureTime?: Date;
    }): Promise<ComputeRoutesResponse>;
  };
  TravelMode: {
    TRANSIT: RouteTravelMode;
    DRIVING: RouteTravelMode;
  };
}

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
  className?: string;
  userCoordinates?: [number, number] | null;
  viewportPaddingRatio?: number;
  viewportBottomInsetPx?: number;
}

export function GoogleRoutePreview({
  originQuery,
  destinationQuery,
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
  const [routePath, setRoutePath] = useState<google.maps.LatLngLiteral[]>([]);
  const [routeViewport, setRouteViewport] = useState<google.maps.LatLngBounds | null>(null);
  const hasRoute = Boolean(originQuery && destinationQuery);

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
      setRoutePath([]);
      setRouteViewport(null);
    });
  }

  function toLatLngLiteral(point: RoutePathPoint): google.maps.LatLngLiteral {
    return {
      lat: typeof point.lat === "function" ? point.lat() : point.lat,
      lng: typeof point.lng === "function" ? point.lng() : point.lng,
    };
  }

  useEffect(() => {
    if (!isLoaded || !hasRoute || !originQuery || !destinationQuery || typeof window === "undefined") {
      clearRoutePreview();
      return;
    }

    let cancelled = false;

    const loadRoute = async () => {
      const { Route, TravelMode } =
        (await window.google.maps.importLibrary("routes")) as unknown as RouteClassLibrary;

      const computePath = async (travelMode: RouteTravelMode) => {
        const response = await Route.computeRoutes({
          origin: originQuery,
          destination: destinationQuery,
          travelMode,
          departureTime: travelMode === TravelMode.TRANSIT ? new Date() : undefined,
          fields: ["path", "viewport"],
        });

        const route = response.routes?.[0];
        const path = route?.path?.map(toLatLngLiteral) ?? [];

        if (!path.length) {
          return false;
        }

        if (!cancelled) {
          startTransition(() => {
            setRoutePath(path);
            setRouteViewport(route?.viewport ?? null);
          });
        }

        return true;
      };

      try {
        const hasTransitPath = await computePath(TravelMode.TRANSIT);

        if (!hasTransitPath && !cancelled) {
          const hasDrivingPath = await computePath(TravelMode.DRIVING);

          if (!hasDrivingPath && !cancelled) {
            clearRoutePreview();
          }
        }
      } catch {
        if (cancelled) {
          return;
        }

        try {
          const hasDrivingPath = await computePath(TravelMode.DRIVING);

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
  }, [destinationQuery, hasRoute, isLoaded, originQuery]);

  useEffect(() => {
    if (!map || !isLoaded || typeof window === "undefined") {
      return;
    }

    if (routeViewport) {
      map.fitBounds(routeViewport, {
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
  }, [center, isLoaded, map, resolvedBottomInsetPx, routeViewport, userCoordinates]);

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
        {routePath.length ? (
          <PolylineF
            path={routePath}
            options={{
              strokeColor: "#2563eb",
              strokeOpacity: 0.9,
              strokeWeight: 5,
            }}
          />
        ) : null}

        {userCoordinates && !routePath.length ? (
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
