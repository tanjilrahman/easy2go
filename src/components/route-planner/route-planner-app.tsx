"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { LocateFixed, MapPin, Navigation2, X } from "lucide-react";

import { BrandLogo } from "@/components/brand-logo";
import { MapFrame, type MapPickMode } from "@/components/map/dhaka-map";
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
  const [debugRoutes, setDebugRoutes] = useState<RouteOption[]>([]);
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
  const [mapPickMode, setMapPickMode] = useState<MapPickMode | null>(null);

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

    const frameId = window.requestAnimationFrame(() => {
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
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
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
  const memoryUiReady = draftsHydrated;

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

  function applyMapLocation(coordinates: [number, number], field: MapPickMode) {
    const nextLocation: LocationInput = {
      name: field === "origin" ? "Current location" : "Map destination",
      address: `Selected on map: ${coordinates[0]}, ${coordinates[1]}`,
      type: "place",
      coordinates,
    };

    applyLocation(nextLocation, field);
    if (field === "origin") {
      setCurrentCoordinates(coordinates);
    }
    setLocationError(null);
    setMapPickMode(null);
    clearCurrentRoute();
    setPane("compose");
  }

  function clearCurrentRoute() {
    setResults([]);
    setDebugRoutes([]);
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
          setDebugRoutes(response.debugRoutes);
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
        pickMode={mapPickMode}
        pickedOriginCoordinates={originSelection?.coordinates ?? null}
        pickedDestinationCoordinates={destinationSelection?.coordinates ?? null}
        onPickLocation={applyMapLocation}
      />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 h-20 bg-[linear-gradient(180deg,rgba(29,21,63,0.38)_0%,rgba(29,21,63,0.08)_62%,rgba(29,21,63,0)_100%)] sm:h-24" />

      <div className="absolute left-3 top-3 z-40 sm:left-4 sm:top-4">
        <BrandLogo />
      </div>

      <div className="absolute right-3 top-3 z-40 flex max-w-[calc(100vw-7.25rem)] items-center gap-1 rounded-[18px] border border-white/70 bg-white/92 p-1 shadow-[0_18px_48px_-28px_rgba(29,21,63,0.34)] backdrop-blur sm:right-4 sm:top-4">
        <button
          type="button"
          onClick={() => setMapPickMode((current) => (current === "origin" ? null : "origin"))}
          className={`inline-flex h-9 items-center gap-1.5 rounded-[14px] px-2.5 text-xs font-bold transition ${
            mapPickMode === "origin"
              ? "bg-[rgb(21,184,109)] text-white shadow-[0_10px_24px_-16px_rgba(21,184,109,0.7)]"
              : "text-[rgb(55,42,123)] hover:bg-[rgba(244,241,255,0.98)]"
          }`}
        >
          <LocateFixed className="h-4 w-4" />
          <span className="hidden sm:inline">Current</span>
        </button>
        <button
          type="button"
          onClick={() =>
            setMapPickMode((current) => (current === "destination" ? null : "destination"))
          }
          className={`inline-flex h-9 items-center gap-1.5 rounded-[14px] px-2.5 text-xs font-bold transition ${
            mapPickMode === "destination"
              ? "bg-[rgb(242,95,103)] text-white shadow-[0_10px_24px_-16px_rgba(242,95,103,0.7)]"
              : "text-[rgb(55,42,123)] hover:bg-[rgba(244,241,255,0.98)]"
          }`}
        >
          <Navigation2 className="h-4 w-4" />
          <span className="hidden sm:inline">Destination</span>
        </button>
        {mapPickMode ? (
          <button
            type="button"
            onClick={() => setMapPickMode(null)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-[14px] text-[rgb(95,86,135)] transition hover:bg-[rgba(244,241,255,0.98)]"
            aria-label="Cancel map pick"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {mapPickMode ? (
        <div className="pointer-events-none absolute left-1/2 top-16 z-40 flex -translate-x-1/2 items-center gap-2 rounded-full border border-white/80 bg-white/94 px-3 py-2 text-xs font-bold text-[rgb(55,42,123)] shadow-[0_18px_48px_-28px_rgba(29,21,63,0.34)] backdrop-blur sm:top-16">
          <MapPin className="h-4 w-4" />
          Click the map to set {mapPickMode === "origin" ? "current location" : "destination"}
        </div>
      ) : null}

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
            savedPlaces={memoryUiReady ? savedPlaceMap : {}}
            recentTrips={memoryUiReady ? recentTrips : []}
          />
        ) : null}

        {pane === "compare" ? (
          <PlannerComparePane
            routes={results}
            debugRoutes={debugRoutes}
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
            debugRoutes={debugRoutes}
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
            savedPlaces={memoryUiReady ? savedPlaces : []}
            recentTrips={memoryUiReady ? recentTrips : []}
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
