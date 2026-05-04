"use client";

import { LoaderCircle, LocateFixed, MapPin, Navigation2, Search } from "lucide-react";
import { startTransition, useMemo, useState } from "react";

import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useLocationSuggestions } from "@/hooks/use-route-planner";
import { RecentSearches } from "@/components/route-planner/recent-searches";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  CalculateRouteRequest,
  LocationSuggestion,
  RouteOptimization,
  SearchRecord,
} from "@/lib/validations/routes";

type ActiveField = "origin" | "destination" | null;

interface SearchCardProps {
  recentSearches: SearchRecord[];
  isLoading?: boolean;
  onSearch: (payload: CalculateRouteRequest) => void;
}

const optimizationOptions: Array<{
  value: RouteOptimization;
  label: string;
  description: string;
}> = [
  {
    value: "recommended",
    label: "Recommended",
    description: "Balance time, cost, and transfers",
  },
  {
    value: "fastest",
    label: "Fastest",
    description: "Prioritize shorter travel time",
  },
  {
    value: "cheapest",
    label: "Cheapest",
    description: "Prioritize lower estimated fare",
  },
];

function suggestionTypeLabel(type: LocationSuggestion["type"]) {
  switch (type) {
    case "bus_stop":
      return "Bus Stop";
    case "metro_station":
      return "Metro";
    case "hub":
      return "Hub";
    default:
      return "Place";
  }
}

export function SearchCard({
  recentSearches,
  isLoading,
  onSearch,
}: SearchCardProps) {
  const [originText, setOriginText] = useState("");
  const [destinationText, setDestinationText] = useState("");
  const [originSelection, setOriginSelection] = useState<LocationSuggestion | null>(null);
  const [destinationSelection, setDestinationSelection] =
    useState<LocationSuggestion | null>(null);
  const [activeField, setActiveField] = useState<ActiveField>(null);
  const [optimization, setOptimization] = useState<RouteOptimization>("recommended");
  const [isLocatingOrigin, setIsLocatingOrigin] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const debouncedOrigin = useDebouncedValue(originText.trim(), 350);
  const debouncedDestination = useDebouncedValue(destinationText.trim(), 350);

  const activeQuery =
    activeField === "origin"
      ? debouncedOrigin
      : activeField === "destination"
        ? debouncedDestination
        : "";

  const suggestionsQuery = useLocationSuggestions(activeQuery, activeQuery.length >= 2);

  const suggestions = suggestionsQuery.data?.suggestions ?? [];
  const hasGeoapifySuggestions = suggestions.some((item) => item.provider === "geoapify");

  const canSearch = originText.trim().length > 1 && destinationText.trim().length > 1;

  const originValue = useMemo(
    () => ({
      name: originText.trim(),
      address: originSelection?.address,
      placeId: originSelection?.placeId,
      coordinates: originSelection?.coordinates,
      canonicalId: originSelection?.canonicalId,
      type: originSelection?.type,
    }),
    [originSelection, originText],
  );

  const destinationValue = useMemo(
    () => ({
      name: destinationText.trim(),
      address: destinationSelection?.address,
      placeId: destinationSelection?.placeId,
      coordinates: destinationSelection?.coordinates,
      canonicalId: destinationSelection?.canonicalId,
      type: destinationSelection?.type,
    }),
    [destinationSelection, destinationText],
  );

  const submit = () => {
    if (!canSearch) {
      return;
    }

    onSearch({
      origin: originValue,
      destination: destinationValue,
      optimization,
    });
    setActiveField(null);
  };

  const selectSuggestion = (item: LocationSuggestion) => {
    startTransition(() => {
      if (activeField === "origin") {
        setOriginText(item.name);
        setOriginSelection(item);
        setLocationError(null);
      } else if (activeField === "destination") {
        setDestinationText(item.name);
        setDestinationSelection(item);
      }
    });
    setActiveField(null);
  };

  const fillFromRecent = (origin: string, destination: string) => {
    setOriginText(origin);
    setDestinationText(destination);
    setOriginSelection(null);
    setDestinationSelection(null);
    setLocationError(null);
  };

  const useCurrentLocation = () => {
    if (!navigator.geolocation) {
      setLocationError("Current location is not supported in this browser.");
      return;
    }

    setIsLocatingOrigin(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        startTransition(() => {
          setOriginText("Current location");
          setOriginSelection({
            id: "current-location",
            name: "Current location",
            address: "Using your device coordinates",
            type: "place",
            coordinates: [position.coords.latitude, position.coords.longitude],
          });
        });
        setActiveField(null);
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
  };

  const renderSuggestionList = activeField && activeQuery.length >= 2;

  return (
    <div className="pointer-events-auto mx-auto w-full max-w-md px-4 pb-8">
      <div className="glass-panel rounded-[34px] p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="font-display text-[1.1rem] font-semibold text-foreground">
              Plan your Dhaka trip
            </p>
            <p className="text-sm text-muted-foreground">
              Deterministic bus and metro guidance with map previews.
            </p>
          </div>
          <Badge className="rounded-full border-0 bg-secondary/12 px-3 py-1 text-secondary">
            Transit finder
          </Badge>
        </div>

        <div className="space-y-3">
          <div className="relative">
            <Input
              value={originText}
              placeholder="Your Location"
              onChange={(event) => {
                setOriginText(event.target.value);
                setOriginSelection(null);
                setLocationError(null);
              }}
              onFocus={() => setActiveField("origin")}
              className={cn(
                "h-14 rounded-[22px] border-0 bg-white/70 pl-12 pr-28 text-[15px] shadow-none ring-1 ring-white/55 placeholder:text-muted-foreground",
                activeField === "origin" ? "ring-2 ring-primary/20" : "",
              )}
            />
            <LocateFixed className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-primary" />
            <button
              type="button"
              onClick={useCurrentLocation}
              disabled={isLocatingOrigin}
              className="absolute right-2 top-1/2 inline-flex h-10 items-center gap-2 rounded-full bg-primary/10 px-3 text-xs font-semibold text-primary transition hover:bg-primary/14 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {isLocatingOrigin ? (
                <LoaderCircle className="h-4 w-4 animate-spin" />
              ) : (
                <LocateFixed className="h-4 w-4" />
              )}
              {isLocatingOrigin ? "Locating..." : "Use current"}
            </button>
          </div>

          {locationError ? (
            <p className="px-1 text-xs text-rose-600">{locationError}</p>
          ) : null}

          <div className="relative">
            <Input
              value={destinationText}
              placeholder="Where to?"
              onChange={(event) => {
                setDestinationText(event.target.value);
                setDestinationSelection(null);
              }}
              onFocus={() => setActiveField("destination")}
              className={cn(
                "h-14 rounded-[22px] border-0 bg-white/70 pl-12 pr-4 text-[15px] shadow-none ring-1 ring-white/55 placeholder:text-muted-foreground",
                activeField === "destination" ? "ring-2 ring-secondary/25" : "",
              )}
            />
            <Navigation2 className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-secondary" />
          </div>

          {renderSuggestionList ? (
            <div className="overflow-hidden rounded-[26px] border border-white/65 bg-white/80">
              {suggestionsQuery.isPending ? (
                <div className="flex items-center justify-center gap-2 px-4 py-4 text-sm text-muted-foreground">
                  <LoaderCircle className="h-4 w-4 animate-spin" />
                  Searching places and transit hubs...
                </div>
              ) : suggestions.length ? (
                <div className="max-h-64 overflow-y-auto py-2">
                  {suggestions.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      onClick={() => selectSuggestion(item)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-muted/70"
                    >
                      <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                        <MapPin className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-0.5">
                        <p className="break-words text-sm font-semibold leading-snug text-foreground">{item.name}</p>
                        <p className="break-words text-xs leading-snug text-muted-foreground">
                          {item.address ?? "Dhaka, Bangladesh"}
                        </p>
                      </div>
                      <Badge className="ml-auto shrink-0 border border-border bg-white px-2 py-1 text-[10px] text-muted-foreground">
                        {suggestionTypeLabel(item.type)}
                      </Badge>
                    </button>
                  ))}
                  {hasGeoapifySuggestions ? (
                    <p className="border-t border-border/60 px-4 py-2 text-[11px] font-medium text-muted-foreground">
                      Powered by Geoapify
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="px-4 py-4 text-sm text-muted-foreground">
                  No suggestions found. Try a more recognizable Dhaka place, bus stop, or metro station.
                </div>
              )}
            </div>
          ) : null}

          <div className="rounded-[24px] border border-white/65 bg-white/70 p-3">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Optimize for
            </p>
            <div className="grid grid-cols-3 gap-2">
              {optimizationOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setOptimization(option.value)}
                  className={cn(
                    "rounded-[20px] px-3 py-3 text-left transition",
                    optimization === option.value
                      ? "bg-primary text-primary-foreground shadow-[0_20px_36px_-28px_rgba(21,95,200,0.8)]"
                      : "bg-muted/80 text-foreground hover:bg-muted",
                  )}
                >
                  <p className="text-sm font-semibold">{option.label}</p>
                  <p
                    className={cn(
                      "mt-1 text-[11px] leading-4",
                      optimization === option.value
                        ? "text-primary-foreground/80"
                        : "text-muted-foreground",
                    )}
                  >
                    {option.description}
                  </p>
                </button>
              ))}
            </div>
          </div>

          <Button
            type="button"
            onClick={submit}
            disabled={!canSearch || isLoading}
            size="lg"
            className="h-14 w-full rounded-[24px] bg-gradient-to-r from-primary to-[#2b79e8] text-base shadow-[0_26px_42px_-28px_rgba(21,95,200,0.75)]"
          >
            {isLoading ? (
              <>
                <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
                Finding best routes
              </>
            ) : (
              <>
                <Search className="mr-2 h-5 w-5" />
                Find Route
              </>
            )}
          </Button>
        </div>

        <div className="mt-4">
          <RecentSearches searches={recentSearches} onSelect={fillFromRecent} />
        </div>
      </div>
    </div>
  );
}
