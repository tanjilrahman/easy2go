"use client";

import { Compass, MapPinned } from "lucide-react";
import { startTransition, useEffect, useMemo, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { MapFrame } from "@/components/map/dhaka-map";
import { PlannerComparePane } from "@/components/route-planner/planner-compare-pane";
import { PlannerComposerPane } from "@/components/route-planner/planner-composer-pane";
import { PlannerItineraryPane } from "@/components/route-planner/planner-itinerary-pane";
import { PlannerPane } from "@/components/route-planner/planner-pane";
import { PlannerSavedPane } from "@/components/route-planner/planner-saved-pane";
import { usePlannerMemory } from "@/hooks/use-planner-memory";
import { useCalculateRoutes } from "@/hooks/use-route-planner";
import type { CalculateRouteRequest, LocationInput, RouteOption } from "@/lib/validations/routes";

type PaneState = "compose" | "compare" | "itinerary" | "saved";

function paneMeta(pane: PaneState, routeCount: number) {
  switch (pane) {
    case "compare":
      return {
        title: "Choose the route",
        subtitle: `${routeCount} guided options ranked for clarity, not noise.`,
        height: "54vh",
      };
    case "itinerary":
      return {
        title: "Follow the trip",
        subtitle: "One route, full connector and fare breakdown.",
        height: "68vh",
      };
    case "saved":
      return {
        title: "Saved places",
        subtitle: "Keep your common anchors ready without leaving the map.",
        height: "58vh",
      };
    default:
      return {
        title: "Plan a Dhaka trip",
        subtitle: "One planner pane, constant map context, and only the choices worth showing.",
        height: "60vh",
      };
  }
}

function createDraftInput(text: string, selection: LocationInput | null) {
  const name = text.trim();

  if (!name) {
    return null;
  }

  return {
    name,
    address: selection?.address,
    placeId: selection?.placeId,
    coordinates: selection?.coordinates,
    canonicalId: selection?.canonicalId,
    type: selection?.type,
  } satisfies LocationInput;
}

export function RoutePlannerApp() {
  const memory = usePlannerMemory();
  const {
    ready: memoryReady,
    draftOrigin,
    draftDestination,
    lastSelectedRouteSignature,
    saveDraft,
    savePlace,
    removePlace,
    recordTrip,
    rememberRoute,
    recentTrips,
    savedPlaces,
    savedPlaceMap,
  } = memory;
  const calculateRoutes = useCalculateRoutes();
  const [pane, setPane] = useState<PaneState>("compose");
  const [results, setResults] = useState<RouteOption[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string>();
  const [originText, setOriginText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [originSelection, setOriginSelection] = useState<LocationInput | null>(null);
  const [destinationSelection, setDestinationSelection] = useState<LocationInput | null>(null);
  const [isLocatingOrigin, setIsLocatingOrigin] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  useEffect(() => {
    if (!memoryReady) {
      return;
    }

    startTransition(() => {
      if (!originText && draftOrigin) {
        setOriginText(draftOrigin.name);
        setOriginSelection(draftOrigin);
      }

      if (!destinationText && draftDestination) {
        setDestinationText(draftDestination.name);
        setDestinationSelection(draftDestination);
      }
    });
  }, [
    destinationText,
    draftDestination,
    draftOrigin,
    memoryReady,
    originText,
  ]);

  const originValue = useMemo(
    () => createDraftInput(originText, originSelection),
    [originSelection, originText],
  );
  const destinationValue = useMemo(
    () => createDraftInput(destinationText, destinationSelection),
    [destinationSelection, destinationText],
  );

  useEffect(() => {
    if (!memoryReady) {
      return;
    }

    saveDraft(originValue ?? undefined, destinationValue ?? undefined);
  }, [destinationValue, memoryReady, originValue, saveDraft]);

  const activeRoute = useMemo(
    () => results.find((route) => route.id === selectedRouteId) ?? results[0] ?? null,
    [results, selectedRouteId],
  );

  const paneCopy = paneMeta(pane, results.length);

  function applyLocation(location: LocationInput, field: "origin" | "destination") {
    if (field === "origin") {
      setOriginText(location.name);
      setOriginSelection(location);
      return;
    }

    setDestinationText(location.name);
    setDestinationSelection(location);
  }

  function handleSearch(payload: CalculateRouteRequest) {
    setLocationError(null);
    calculateRoutes.mutate(payload, {
        onSuccess: (response) => {
          startTransition(() => {
            setResults(response.routes);
            const remembered =
              response.routes.find((route) => route.pathSignature === lastSelectedRouteSignature) ??
              response.routes[0];
            setSelectedRouteId(remembered?.id);
            setPane(response.routes.length > 1 ? "compare" : "itinerary");
            recordTrip(payload.origin, payload.destination);
            rememberRoute(remembered?.pathSignature);
          });
        },
      });
  }

  function useCurrentLocation() {
    if (!navigator.geolocation) {
      setLocationError("Current location is not supported in this browser.");
      return;
    }

    setIsLocatingOrigin(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextLocation: LocationInput = {
          name: "Current location",
          address: "Using your device coordinates",
          type: "place",
          coordinates: [position.coords.latitude, position.coords.longitude],
        };

        setOriginText(nextLocation.name);
        setOriginSelection(nextLocation);
        setIsLocatingOrigin(false);
      },
      (error) => {
        const message =
          error.code === error.PERMISSION_DENIED
            ? "Location access was denied. Please allow it and try again."
            : error.code === error.POSITION_UNAVAILABLE
              ? "Your current location is unavailable right now."
              : error.code === error.TIMEOUT
                ? "Getting your current location timed out."
                : "Unable to get your current location right now.";

        setLocationError(message);
        setIsLocatingOrigin(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }

  return (
    <main className="relative h-dvh min-h-[100svh] overflow-hidden bg-background">
      <MapFrame activeRoute={activeRoute} />

      <div className="absolute inset-0 z-10 bg-[radial-gradient(circle_at_top_left,rgba(125,211,252,0.14),transparent_28%),linear-gradient(180deg,rgba(2,6,23,0.12)_0%,rgba(2,6,23,0.08)_42%,rgba(2,6,23,0.54)_100%)]" />

      <div className="absolute inset-x-3 top-4 z-20 mx-auto flex max-w-xl items-start justify-between gap-4 sm:inset-x-5">
        <BrandLogo />

        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-[rgba(3,10,18,0.72)] px-4 py-3 text-sm font-medium text-white backdrop-blur-xl">
          <Compass className="h-4 w-4 text-sky-300" />
          {activeRoute?.primaryReason ?? "Map-first planner"}
        </div>
      </div>

      {activeRoute ? (
        <div className="absolute left-3 right-3 top-24 z-20 mx-auto max-w-xl sm:left-5 sm:right-5">
          <div className="inline-flex max-w-full items-center gap-2 rounded-full border border-white/10 bg-[rgba(3,10,18,0.72)] px-4 py-2.5 text-sm text-slate-100 backdrop-blur-xl">
            <MapPinned className="h-4 w-4 text-emerald-300" />
            <span className="truncate">
              {activeRoute.boarding.label} to {activeRoute.alighting.label}
            </span>
          </div>
        </div>
      ) : null}

      <PlannerPane
        paneKey={pane}
        title={paneCopy.title}
        subtitle={calculateRoutes.isError ? calculateRoutes.error.message : paneCopy.subtitle}
        height={paneCopy.height}
      >
        {pane === "compose" ? (
          <PlannerComposerPane
            originText={originText}
            destinationText={destinationText}
            originSelection={originSelection}
            destinationSelection={destinationSelection}
            onOriginTextChange={setOriginText}
            onDestinationTextChange={setDestinationText}
            onOriginSelectionChange={setOriginSelection}
            onDestinationSelectionChange={setDestinationSelection}
            onSwap={() => {
              setOriginText(destinationText);
              setDestinationText(originText);
              setOriginSelection(destinationSelection);
              setDestinationSelection(originSelection);
            }}
            onUseCurrentLocation={useCurrentLocation}
            onSearch={handleSearch}
            onOpenSaved={() => setPane("saved")}
            isLoading={calculateRoutes.isPending}
            isLocating={isLocatingOrigin}
            locationError={locationError}
            savedPlaces={savedPlaceMap}
            recentTrips={recentTrips}
          />
        ) : null}

        {pane === "compare" ? (
          <PlannerComparePane
            routes={results}
            selectedRouteId={selectedRouteId}
            onSelectRoute={(route) => {
              setSelectedRouteId(route.id);
              rememberRoute(route.pathSignature);
            }}
            onOpenItinerary={() => setPane("itinerary")}
            onBack={() => setPane("compose")}
          />
        ) : null}

        {pane === "itinerary" ? (
          <PlannerItineraryPane
            route={activeRoute}
            onBack={() => setPane(results.length > 1 ? "compare" : "compose")}
            onBackLabel={results.length > 1 ? "Compare" : "Edit trip"}
            onUseReturnTrip={(nextOrigin, nextDestination) => {
              applyLocation(nextOrigin, "origin");
              applyLocation(nextDestination, "destination");
              setPane("compose");
            }}
          />
        ) : null}

        {pane === "saved" ? (
          <PlannerSavedPane
            savedPlaces={savedPlaces}
            recentTrips={recentTrips}
            currentOrigin={originValue}
            currentDestination={destinationValue}
            onBack={() => setPane("compose")}
            onApplyPlace={(location, field) => {
              applyLocation(location, field);
              setPane("compose");
            }}
            onSavePlace={(slot, location) => savePlace(slot, location)}
            onRemovePlace={(slot) => removePlace(slot)}
            onApplyTrip={(trip) => {
              applyLocation(trip.origin, "origin");
              applyLocation(trip.destination, "destination");
              setPane("compose");
            }}
          />
        ) : null}
      </PlannerPane>
    </main>
  );
}
