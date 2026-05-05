"use client";

import {
  ArrowDownUp,
  Bookmark,
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  LocateFixed,
  MapPin,
  Navigation2,
  Search,
  Star,
} from "lucide-react";
import { type KeyboardEvent, useEffect, useId, useMemo, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import type { RecentTrip, SavedPlace } from "@/hooks/use-planner-memory";
import { useLocationSuggestions } from "@/hooks/use-route-planner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { CalculateRouteRequest, LocationInput, LocationSuggestion } from "@/lib/validations/routes";

interface PlannerComposerPaneProps {
  originText: string;
  destinationText: string;
  originSelection: LocationInput | null;
  destinationSelection: LocationInput | null;
  onOriginTextChange: (value: string) => void;
  onDestinationTextChange: (value: string) => void;
  onOriginSelectionChange: (value: LocationInput | null) => void;
  onDestinationSelectionChange: (value: LocationInput | null) => void;
  onSwap: () => void;
  onUseCurrentLocation: () => void;
  onSearch: (payload: CalculateRouteRequest) => void;
  onOpenSaved: () => void;
  onExpandedContentChange?: (expanded: boolean) => void;
  isLoading?: boolean;
  isLocating?: boolean;
  locationError?: string | null;
  savedPlaces: Partial<Record<SavedPlace["slot"], SavedPlace>>;
  recentTrips: RecentTrip[];
}

type ActiveField = "origin" | "destination" | null;

function suggestionTypeLabel(type: LocationSuggestion["type"]) {
  switch (type) {
    case "bus_stop":
      return "Bus";
    case "metro_station":
      return "Metro";
    case "hub":
      return "Hub";
    default:
      return "Place";
  }
}

function toLocationInput(value: LocationSuggestion | LocationInput) {
  return {
    name: value.name,
    address: value.address,
    placeId: "placeId" in value ? value.placeId : undefined,
    coordinates: value.coordinates,
    canonicalId: value.canonicalId,
    type: value.type,
  } satisfies LocationInput;
}

export function PlannerComposerPane({
  originText,
  destinationText,
  originSelection,
  destinationSelection,
  onOriginTextChange,
  onDestinationTextChange,
  onOriginSelectionChange,
  onDestinationSelectionChange,
  onSwap,
  onUseCurrentLocation,
  onSearch,
  onOpenSaved,
  onExpandedContentChange,
  isLoading,
  isLocating,
  locationError,
  savedPlaces,
  recentTrips,
}: PlannerComposerPaneProps) {
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
  const [showRecentTripsOnMobile, setShowRecentTripsOnMobile] = useState(false);
  const listboxId = useId();
  const debouncedOrigin = useDebouncedValue(originText.trim(), 250);
  const debouncedDestination = useDebouncedValue(destinationText.trim(), 250);
  const activeQuery =
    activeField === "origin"
      ? debouncedOrigin
      : activeField === "destination"
        ? debouncedDestination
        : "";

  const suggestionsQuery = useLocationSuggestions(activeQuery, activeQuery.length >= 2);
  const suggestions = suggestionsQuery.data?.suggestions ?? [];
  const hasGeoapifySuggestions = suggestions.some((item) => item.provider === "geoapify");

  const originValue = useMemo(
    () =>
      originText.trim()
        ? ({
            name: originText.trim(),
            address: originSelection?.address,
            placeId: originSelection?.placeId,
            coordinates: originSelection?.coordinates,
            canonicalId: originSelection?.canonicalId,
            type: originSelection?.type,
          } satisfies LocationInput)
        : null,
    [originSelection, originText],
  );

  const destinationValue = useMemo(
    () =>
      destinationText.trim()
        ? ({
            name: destinationText.trim(),
            address: destinationSelection?.address,
            placeId: destinationSelection?.placeId,
            coordinates: destinationSelection?.coordinates,
            canonicalId: destinationSelection?.canonicalId,
            type: destinationSelection?.type,
          } satisfies LocationInput)
        : null,
    [destinationSelection, destinationText],
  );

  const canSearch =
    !!originValue &&
    !!destinationValue &&
    originValue.name.length > 1 &&
    destinationValue.name.length > 1;
  const hasSuggestionsOpen = Boolean(activeField && activeQuery.length >= 2);
  const hasExpandedRecentTrips = recentTrips.length > 0 && showRecentTripsOnMobile;

  useEffect(() => {
    onExpandedContentChange?.(hasSuggestionsOpen || hasExpandedRecentTrips);
  }, [hasExpandedRecentTrips, hasSuggestionsOpen, onExpandedContentChange]);

  function selectSuggestion(item: LocationSuggestion) {
    const nextValue = toLocationInput(item);

    if (activeField === "origin") {
      onOriginTextChange(item.name);
      onOriginSelectionChange(nextValue);
    } else if (activeField === "destination") {
      onDestinationTextChange(item.name);
      onDestinationSelectionChange(nextValue);
    }

    setActiveField(null);
  }

  function applySavedPlace(place: SavedPlace, field: "origin" | "destination") {
    if (field === "origin") {
      onOriginTextChange(place.location.name);
      onOriginSelectionChange(place.location);
    } else {
      onDestinationTextChange(place.location.name);
      onDestinationSelectionChange(place.location);
    }
  }

  function applyTrip(trip: RecentTrip) {
    onOriginTextChange(trip.origin.name);
    onOriginSelectionChange(trip.origin);
    onDestinationTextChange(trip.destination.name);
    onDestinationSelectionChange(trip.destination);
    setActiveField(null);
    setShowRecentTripsOnMobile(false);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!suggestions.length) {
      if (event.key === "Enter" && canSearch && originValue && destinationValue) {
        event.preventDefault();
        onSearch({
          origin: originValue,
          destination: destinationValue,
          optimization: "recommended",
        });
      }
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current + 1) % suggestions.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveSuggestionIndex((current) => (current - 1 + suggestions.length) % suggestions.length);
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      selectSuggestion(suggestions[activeSuggestionIndex] ?? suggestions[0]);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setActiveField(null);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-4 pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-base font-semibold tracking-tight text-foreground font-display">Plan your trip</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Fastest bus route with the right last-mile connector.
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onOpenSaved}
              className="shrink-0"
            >
              <Bookmark className="mr-1.5 h-3.5 w-3.5" />
              Saved
            </Button>
          </div>

          {/* Unified stacked input block */}
          <div className="relative rounded-xl border border-border bg-surface">
            {/* Origin row */}
            <div className="relative flex items-center gap-3 px-3.5 py-3">
              <LocateFixed className="shrink-0 h-4 w-4 text-primary" />
              <Input
                id="planner-origin"
                role="combobox"
                aria-expanded={activeField === "origin" && suggestions.length > 0}
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={
                  activeField === "origin" && suggestions[activeSuggestionIndex]
                    ? `${listboxId}-${suggestions[activeSuggestionIndex]?.id}`
                    : undefined
                }
                value={originText}
                placeholder="Start"
                onFocus={() => setActiveField("origin")}
                onChange={(event) => {
                  onOriginTextChange(event.target.value);
                  onOriginSelectionChange(null);
                  setActiveField("origin");
                  setActiveSuggestionIndex(0);
                }}
                onKeyDown={handleKeyDown}
                className="h-8 border-0 bg-transparent p-0 text-sm shadow-none ring-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
              <button
                type="button"
                onClick={onUseCurrentLocation}
                disabled={isLocating}
                className="shrink-0 inline-flex h-7 items-center gap-1 rounded-md bg-primary/10 px-2 text-[11px] font-semibold text-primary transition hover:bg-primary/15 disabled:opacity-60"
              >
                {isLocating ? (
                  <LoaderCircle className="h-3 w-3 animate-spin" />
                ) : (
                  <LocateFixed className="h-3 w-3" />
                )}
                {isLocating ? "Locating" : "Current"}
              </button>
            </div>

            {/* Divider with swap button overlapping */}
            <div className="relative h-px bg-border">
              <button
                type="button"
                onClick={onSwap}
                className="absolute right-3 top-1/2 z-10 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md border border-border bg-surface text-muted-foreground shadow-sm transition hover:bg-muted hover:text-foreground"
                aria-label="Swap origin and destination"
              >
                <ArrowDownUp className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Destination row */}
            <div className="relative flex items-center gap-3 px-3.5 py-3">
              <Navigation2 className="shrink-0 h-4 w-4 text-secondary" />
              <Input
                id="planner-destination"
                role="combobox"
                aria-expanded={activeField === "destination" && suggestions.length > 0}
                aria-controls={listboxId}
                aria-autocomplete="list"
                aria-activedescendant={
                  activeField === "destination" && suggestions[activeSuggestionIndex]
                    ? `${listboxId}-${suggestions[activeSuggestionIndex]?.id}`
                    : undefined
                }
                value={destinationText}
                placeholder="Destination"
                onFocus={() => setActiveField("destination")}
                onChange={(event) => {
                  onDestinationTextChange(event.target.value);
                  onDestinationSelectionChange(null);
                  setActiveField("destination");
                  setActiveSuggestionIndex(0);
                }}
                onKeyDown={handleKeyDown}
                className="h-8 border-0 bg-transparent p-0 text-sm shadow-none ring-0 focus:ring-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          </div>

          {/* Saved chips below the unified input */}
          <div className="flex flex-wrap gap-1.5">
            {savedPlaces.home ? (
              <button
                type="button"
                onClick={() => applySavedPlace(savedPlaces.home!, "origin")}
                className="planner-chip"
              >
                <Star className="h-3.5 w-3.5" />
                Home
              </button>
            ) : null}
            {savedPlaces.work ? (
              <button
                type="button"
                onClick={() => applySavedPlace(savedPlaces.work!, "origin")}
                className="planner-chip"
              >
                <Bookmark className="h-3.5 w-3.5" />
                Work
              </button>
            ) : null}
          </div>

          {locationError ? (
            <p className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-xs font-medium text-danger">
              {locationError}
            </p>
          ) : null}

          {hasSuggestionsOpen ? (
            <div
              id={listboxId}
              role="listbox"
              aria-label="Suggested places"
              className="overflow-hidden rounded-xl border border-border bg-surface shadow-md"
            >
              {suggestionsQuery.isPending ? (
                <div className="flex items-center gap-2 px-4 py-3 text-sm text-muted-foreground">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Searching...
                </div>
              ) : suggestions.length ? (
                <div className="max-h-56 overflow-y-auto py-1">
                  {suggestions.map((item, index) => (
                    <button
                      id={`${listboxId}-${item.id}`}
                      role="option"
                      aria-selected={index === activeSuggestionIndex}
                      type="button"
                      key={item.id}
                      onClick={() => selectSuggestion(item)}
                      onMouseEnter={() => setActiveSuggestionIndex(index)}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-2.5 text-left transition",
                        index === activeSuggestionIndex
                          ? "bg-primary/6"
                          : "hover:bg-primary/[0.03]",
                      )}
                    >
                      <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/8 text-primary">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="break-words text-sm font-semibold leading-snug text-foreground">{item.name}</p>
                        <p className="break-words text-xs leading-snug text-muted-foreground">
                          {item.address ?? "Dhaka, Bangladesh"}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg bg-secondary/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-secondary">
                        {suggestionTypeLabel(item.type)}
                      </span>
                    </button>
                  ))}
                  {hasGeoapifySuggestions ? (
                    <p className="border-t border-border px-4 py-2 text-[11px] font-medium text-muted-foreground">
                      Powered by Geoapify
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="px-4 py-3 text-sm text-muted-foreground">
                  No suggestion found.
                </div>
              )}
            </div>
          ) : recentTrips.length ? (
            <div className="space-y-2">
              <div className="sm:hidden">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowRecentTripsOnMobile((current) => !current)}
                  className="w-full justify-between"
                >
                  <span>Recent trips</span>
                  {showRecentTripsOnMobile ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>

              <div className={cn("space-y-2 sm:block", showRecentTripsOnMobile ? "block" : "hidden")}>
                <p className="px-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  Recent trips
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {recentTrips.slice(0, 4).map((trip) => (
                    <button
                      type="button"
                      key={trip.id}
                      onClick={() => applyTrip(trip)}
                      className="planner-trip-chip"
                    >
                      <span className="truncate">{trip.origin.name}</span>
                      <span className="text-muted-foreground/60">to</span>
                      <span className="truncate">{trip.destination.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-surface/95 pt-3 backdrop-blur-sm">
        <Button
          type="button"
          onClick={() => {
            if (!originValue || !destinationValue) {
              return;
            }

            onSearch({
              origin: originValue,
              destination: destinationValue,
              optimization: "recommended",
            });
          }}
          disabled={Boolean(!canSearch || isLoading)}
          size="lg"
          className="h-11 w-full text-sm shadow-lg shadow-primary/15"
        >
          {isLoading ? (
            <>
              <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
              Routing
            </>
          ) : (
            <>
              <Search className="mr-2 h-5 w-5" />
              Route
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
