"use client";

import { startTransition, useCallback, useEffect, useMemo, useState } from "react";

import type { LocationInput } from "@/lib/validations/routes";

export interface SavedPlace {
  slot: "home" | "work";
  label: "Home" | "Work";
  location: LocationInput;
}

export interface RecentTrip {
  id: string;
  origin: LocationInput;
  destination: LocationInput;
  createdAt: string;
}

interface PlannerMemoryState {
  savedPlaces: SavedPlace[];
  recentTrips: RecentTrip[];
  draftOrigin?: LocationInput;
  draftDestination?: LocationInput;
  lastSelectedRouteSignature?: string;
}

const STORAGE_KEY = "easy2go.planner-memory.v1";

const defaultState: PlannerMemoryState = {
  savedPlaces: [],
  recentTrips: [],
};

function parseState(rawValue: string | null): PlannerMemoryState {
  if (!rawValue) {
    return defaultState;
  }

  try {
    const parsed = JSON.parse(rawValue) as PlannerMemoryState;
    return {
      savedPlaces: parsed.savedPlaces ?? [],
      recentTrips: parsed.recentTrips ?? [],
      draftOrigin: parsed.draftOrigin,
      draftDestination: parsed.draftDestination,
      lastSelectedRouteSignature: parsed.lastSelectedRouteSignature,
    };
  } catch {
    return defaultState;
  }
}

export function usePlannerMemory() {
  const [state, setState] = useState<PlannerMemoryState>(defaultState);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const nextState = parseState(window.localStorage.getItem(STORAGE_KEY));

    startTransition(() => {
      setState(nextState);
      setReady(true);
    });
  }, []);

  useEffect(() => {
    if (!ready) {
      return;
    }

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [ready, state]);

  const savedPlaceMap = useMemo(
    () =>
      state.savedPlaces.reduce(
        (acc, place) => {
          acc[place.slot] = place;
          return acc;
        },
        {} as Partial<Record<SavedPlace["slot"], SavedPlace>>,
      ),
    [state.savedPlaces],
  );

  const saveDraft = useCallback((origin?: LocationInput, destination?: LocationInput) => {
    setState((current) => ({
      ...current,
      draftOrigin: origin,
      draftDestination: destination,
    }));
  }, []);

  const rememberRoute = useCallback((pathSignature?: string) => {
    setState((current) => ({
      ...current,
      lastSelectedRouteSignature: pathSignature,
    }));
  }, []);

  const savePlace = useCallback((slot: SavedPlace["slot"], location: LocationInput) => {
    const label = slot === "home" ? "Home" : "Work";

    setState((current) => ({
      ...current,
      savedPlaces: [
        ...current.savedPlaces.filter((place) => place.slot !== slot),
        { slot, label, location },
      ],
    }));
  }, []);

  const removePlace = useCallback((slot: SavedPlace["slot"]) => {
    setState((current) => ({
      ...current,
      savedPlaces: current.savedPlaces.filter((place) => place.slot !== slot),
    }));
  }, []);

  const recordTrip = useCallback((origin: LocationInput, destination: LocationInput) => {
    const nextTrip: RecentTrip = {
      id: `${origin.name}-${destination.name}-${Date.now()}`,
      origin,
      destination,
      createdAt: new Date().toISOString(),
    };

    setState((current) => {
      const deduped = current.recentTrips.filter(
        (trip) =>
          trip.origin.name.toLowerCase() !== origin.name.toLowerCase() ||
          trip.destination.name.toLowerCase() !== destination.name.toLowerCase(),
      );

      return {
        ...current,
        recentTrips: [nextTrip, ...deduped].slice(0, 8),
      };
    });
  }, []);

  return useMemo(
    () => ({
      ready,
      savedPlaces: state.savedPlaces,
      savedPlaceMap,
      recentTrips: state.recentTrips,
      draftOrigin: state.draftOrigin,
      draftDestination: state.draftDestination,
      lastSelectedRouteSignature: state.lastSelectedRouteSignature,
      saveDraft,
      rememberRoute,
      savePlace,
      removePlace,
      recordTrip,
    }),
    [
      ready,
      recordTrip,
      removePlace,
      rememberRoute,
      saveDraft,
      savePlace,
      savedPlaceMap,
      state.draftDestination,
      state.draftOrigin,
      state.lastSelectedRouteSignature,
      state.recentTrips,
      state.savedPlaces,
    ],
  );
}
