"use client";

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
import type {
  CalculateRouteRequest,
  LocationInput,
  RouteOption,
} from "@/lib/validations/routes";

type PaneState = "compose" | "compare" | "itinerary" | "saved";

function paneMeta(pane: PaneState, composeExpanded: boolean) {
  switch (pane) {
    case "compare":
      return {
        title: "Routes",
        maxHeight: "52vh",
      };
    case "itinerary":
      return {
        title: "Trip",
        maxHeight: "70vh",
      };
    case "saved":
      return {
        title: "Saved",
        maxHeight: "56vh",
      };
    default:
      return {
        title: undefined,
        maxHeight: composeExpanded ? "64vh" : "46vh",
      };
  }
}

function paneViewportPaddingRatio(pane: PaneState) {
  switch (pane) {
    case "compare":
      return 0.42;
    case "itinerary":
      return 0.66;
    case "saved":
      return 0.48;
    default:
      return 0.3;
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
  const [originSelection, setOriginSelection] = useState<LocationInput | null>(
    null,
  );
  const [destinationSelection, setDestinationSelection] =
    useState<LocationInput | null>(null);
  const [isLocatingOrigin, setIsLocatingOrigin] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [currentCoordinates, setCurrentCoordinates] = useState<
    [number, number] | null
  >(null);
  const [draftsHydrated, setDraftsHydrated] = useState(false);
  const [paneHeightPx, setPaneHeightPx] = useState(0);
  const [isComposeExpanded, setIsComposeExpanded] = useState(false);

  useEffect(() => {
    if (!navigator.geolocation) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCurrentCoordinates([
          position.coords.latitude,
          position.coords.longitude,
        ]);
      },
      () => undefined,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 60000,
      },
    );
  }, []);

  useEffect(() => {
    if (!memoryReady || draftsHydrated) {
      return;
    }

    startTransition(() => {
      if (draftOrigin) {
        setOriginText(draftOrigin.name);
        setOriginSelection(draftOrigin);
      }

      if (draftDestination) {
        setDestinationText(draftDestination.name);
        setDestinationSelection(draftDestination);
      }

      setDraftsHydrated(true);
    });
  }, [draftDestination, draftOrigin, draftsHydrated, memoryReady]);

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
    () =>
      results.find((route) => route.id === selectedRouteId) ??
      results[0] ??
      null,
    [results, selectedRouteId],
  );

  const paneCopy = paneMeta(pane, isComposeExpanded);

  function applyLocation(
    location: LocationInput,
    field: "origin" | "destination",
  ) {
    if (field === "origin") {
      setOriginText(location.name);
      setOriginSelection(location);
      return;
    }

    setDestinationText(location.name);
    setDestinationSelection(location);
  }

  function clearCurrentRoute() {
    setResults([]);
    setSelectedRouteId(undefined);
  }

  function resetToCompose() {
    clearCurrentRoute();
    setPane("compose");
  }

  function handleSearch(payload: CalculateRouteRequest) {
    setLocationError(null);
    calculateRoutes.mutate(payload, {
      onSuccess: (response) => {
        startTransition(() => {
          setResults(response.routes);
          const remembered =
            response.routes.find(
              (route) => route.pathSignature === lastSelectedRouteSignature,
            ) ?? response.routes[0];
          setSelectedRouteId(remembered?.id);
          setPane(response.routes.length > 1 ? "compare" : "itinerary");
          recordTrip(payload.origin, payload.destination);
          rememberRoute(remembered?.pathSignature);
        });
      },
    });
  }

  function useCurrentLocation() {
    if (currentCoordinates) {
      const nextLocation: LocationInput = {
        name: "Current location",
        address: "Using your device coordinates",
        type: "place",
        coordinates: currentCoordinates,
      };

      setOriginText(nextLocation.name);
      setOriginSelection(nextLocation);
      setLocationError(null);
      return;
    }

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

        setCurrentCoordinates(nextLocation.coordinates ?? null);
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
      <MapFrame
        activeRoute={activeRoute}
        userCoordinates={currentCoordinates}
        viewportPaddingRatio={paneViewportPaddingRatio(pane)}
        viewportBottomInsetPx={paneHeightPx}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-20 bg-[linear-gradient(180deg,rgba(29,21,63,0.38)_0%,rgba(29,21,63,0.08)_62%,rgba(29,21,63,0)_100%)] sm:h-24" />

      <div className="absolute left-3 top-3 z-40 sm:left-4 sm:top-4">
        <BrandLogo />
      </div>

      <PlannerPane
        paneKey={pane}
        title={paneCopy.title}
        subtitle={
          calculateRoutes.isError ? calculateRoutes.error.message : undefined
        }
        maxHeight={paneCopy.maxHeight}
        scrollable={pane !== "compose"}
        onHeightChange={setPaneHeightPx}
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
            onExpandedContentChange={setIsComposeExpanded}
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
            onBack={resetToCompose}
          />
        ) : null}

        {pane === "itinerary" ? (
          <PlannerItineraryPane
            route={activeRoute}
            onBack={() => {
              if (results.length > 1) {
                setPane("compare");
                return;
              }

              resetToCompose();
            }}
            onBackLabel={results.length > 1 ? "Compare" : "Edit trip"}
            onUseReturnTrip={(nextOrigin, nextDestination) => {
              applyLocation(nextOrigin, "origin");
              applyLocation(nextDestination, "destination");
              resetToCompose();
            }}
          />
        ) : null}

        {pane === "saved" ? (
          <PlannerSavedPane
            savedPlaces={savedPlaces}
            recentTrips={recentTrips}
            currentOrigin={originValue}
            currentDestination={destinationValue}
            onBack={resetToCompose}
            onApplyPlace={(location, field) => {
              applyLocation(location, field);
              resetToCompose();
            }}
            onSavePlace={(slot, location) => savePlace(slot, location)}
            onRemovePlace={(slot) => removePlace(slot)}
            onApplyTrip={(trip) => {
              applyLocation(trip.origin, "origin");
              applyLocation(trip.destination, "destination");
              resetToCompose();
            }}
          />
        ) : null}
      </PlannerPane>
    </main>
  );
}
