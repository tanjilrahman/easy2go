"use client";

import { startTransition, useEffect, useMemo, useState } from "react";
import { LocateFixed, MapPin, X } from "lucide-react";

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
        if (process.env.NODE_ENV === "development") {
          console.info("[easy2go] route response", {
            origin: payload.origin,
            destination: payload.destination,
            routes: response.routes.map((route) => ({
              summary: route.summary,
              duration: route.estimatedDurationMinutes,
              distance: route.estimatedDistanceKm,
              cost: route.totalCost,
              firstTransit: route.segments.find(
                (segment) => segment.mode === "bus" || segment.mode === "metro",
              ),
            })),
            debugRouteCount: response.debugRoutes.length,
          });
        }

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
        originSelection={originSelection}
        destinationSelection={destinationSelection}
        onPickLocation={applyMapLocation}
      />

      <div className="absolute left-3 top-3 z-40 sm:left-4 sm:top-4">
        <BrandLogo />
      </div>

      {/* Map controls - redesigned as solid floating pills */}
      <div className="absolute right-3 top-3 z-40 flex max-w-[calc(100vw-7.25rem)] items-center gap-1.5 rounded-xl border border-border bg-surface/95 p-1 shadow-lg backdrop-blur-sm sm:right-4 sm:top-4">
        <button
          type="button"
          onClick={() => setMapPickMode((current) => (current === "origin" ? null : "origin"))}
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition ${
            mapPickMode === "origin"
              ? "bg-emerald-600 text-white shadow-md"
              : "text-foreground hover:bg-muted"
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
          className={`inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-bold transition ${
            mapPickMode === "destination"
              ? "bg-rose-500 text-white shadow-md"
              : "text-foreground hover:bg-muted"
          }`}
        >
          <MapPin className="h-4 w-4" />
          <span className="hidden sm:inline">Destination</span>
        </button>
        {mapPickMode ? (
          <button
            type="button"
            onClick={() => setMapPickMode(null)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted"
            aria-label="Cancel map pick"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
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
