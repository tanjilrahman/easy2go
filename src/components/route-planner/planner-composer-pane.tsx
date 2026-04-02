"use client";

import { ArrowDownUp, Bookmark, LoaderCircle, LocateFixed, MapPin, Navigation2, Search, Star } from "lucide-react";
import { type KeyboardEvent, useId, useMemo, useState } from "react";

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
  isLoading,
  isLocating,
  locationError,
  savedPlaces,
  recentTrips,
}: PlannerComposerPaneProps) {
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [activeSuggestionIndex, setActiveSuggestionIndex] = useState(0);
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
    <div className="space-y-5">
      <div className="grid gap-3">
        <div className="planner-input-shell">
          <label className="planner-input-label" htmlFor="planner-origin">
            Start from
          </label>
          <div className="relative">
            <LocateFixed className="planner-input-icon text-sky-300" />
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
              placeholder="Your place, stop, or station"
              onFocus={() => setActiveField("origin")}
              onChange={(event) => {
                onOriginTextChange(event.target.value);
                onOriginSelectionChange(null);
                setActiveField("origin");
                setActiveSuggestionIndex(0);
              }}
              onKeyDown={handleKeyDown}
              className="planner-input pr-32"
            />
            <button
              type="button"
              onClick={onUseCurrentLocation}
              disabled={isLocating}
              className="absolute right-2 top-1/2 inline-flex h-10 -translate-y-1/2 items-center gap-2 rounded-full bg-white/8 px-3 text-xs font-semibold text-white transition hover:bg-white/12 disabled:opacity-60"
            >
              {isLocating ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed className="h-4 w-4" />
              )}
              {isLocating ? "Locating" : "Current"}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
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
        </div>

        <div className="flex justify-center">
          <button
            type="button"
            onClick={onSwap}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/5 text-slate-200 transition hover:bg-white/10"
            aria-label="Swap origin and destination"
          >
            <ArrowDownUp className="h-4 w-4" />
          </button>
        </div>

        <div className="planner-input-shell">
          <label className="planner-input-label" htmlFor="planner-destination">
            Going to
          </label>
          <div className="relative">
            <Navigation2 className="planner-input-icon text-emerald-300" />
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
              placeholder="Destination, stop, or corridor"
              onFocus={() => setActiveField("destination")}
              onChange={(event) => {
                onDestinationTextChange(event.target.value);
                onDestinationSelectionChange(null);
                setActiveField("destination");
                setActiveSuggestionIndex(0);
              }}
              onKeyDown={handleKeyDown}
              className="planner-input"
            />
          </div>
          <div className="mt-2 flex flex-wrap gap-2">
            {savedPlaces.home ? (
              <button
                type="button"
                onClick={() => applySavedPlace(savedPlaces.home!, "destination")}
                className="planner-chip"
              >
                <Star className="h-3.5 w-3.5" />
                Home
              </button>
            ) : null}
            {savedPlaces.work ? (
              <button
                type="button"
                onClick={() => applySavedPlace(savedPlaces.work!, "destination")}
                className="planner-chip"
              >
                <Bookmark className="h-3.5 w-3.5" />
                Work
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {locationError ? (
        <p className="rounded-2xl border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
          {locationError}
        </p>
      ) : null}

      {activeField && activeQuery.length >= 2 ? (
        <div
          id={listboxId}
          role="listbox"
          aria-label="Suggested places"
          className="overflow-hidden rounded-[28px] border border-white/10 bg-[#091523]/90"
        >
          {suggestionsQuery.isPending ? (
            <div className="flex items-center gap-2 px-4 py-4 text-sm text-slate-300">
              <LoaderCircle className="h-4 w-4 animate-spin" />
              Searching Dhaka places and transit points...
            </div>
          ) : suggestions.length ? (
            <div className="max-h-72 overflow-y-auto py-2">
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
                    "flex w-full items-start gap-3 px-4 py-3 text-left transition",
                    index === activeSuggestionIndex ? "bg-white/10" : "hover:bg-white/6",
                  )}
                >
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-white/8 text-sky-200">
                    <MapPin className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-white">{item.name}</p>
                    <p className="truncate text-xs text-slate-400">
                      {item.address ?? "Dhaka, Bangladesh"}
                    </p>
                  </div>
                  <span className="rounded-full bg-white/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-300">
                    {suggestionTypeLabel(item.type)}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-4 py-4 text-sm text-slate-300">
              No direct suggestion yet. Try a more specific stop, metro station, or landmark.
            </div>
          )}
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between rounded-[28px] border border-white/10 bg-white/5 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-white">Saved & Recent</p>
              <p className="text-xs text-slate-400">
                Keep the map visible while switching trip context inside this pane.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              onClick={onOpenSaved}
              className="h-10 rounded-full border border-white/10 bg-white/6 px-4 text-white hover:bg-white/12"
            >
              Open saved
            </Button>
          </div>

          {recentTrips.length ? (
            <div className="flex flex-wrap gap-2">
              {recentTrips.slice(0, 4).map((trip) => (
                <button
                  type="button"
                  key={trip.id}
                  onClick={() => applyTrip(trip)}
                  className="planner-trip-chip"
                >
                  <span className="truncate">{trip.origin.name}</span>
                  <span className="text-slate-500">to</span>
                  <span className="truncate">{trip.destination.name}</span>
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}

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
        disabled={!canSearch || isLoading}
        className="h-14 w-full rounded-[24px] bg-[linear-gradient(135deg,#7dd3fc_0%,#2563eb_48%,#0f172a_100%)] text-base text-white shadow-[0_24px_60px_-24px_rgba(37,99,235,0.65)]"
      >
        {isLoading ? (
          <>
            <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
            Calculating the fastest path
          </>
        ) : (
          <>
            <Search className="mr-2 h-5 w-5" />
            Find fastest route
          </>
        )}
      </Button>
    </div>
  );
}
