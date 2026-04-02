"use client";

import { ArrowLeft, Bookmark, Home, MapPin, Plus, Trash2 } from "lucide-react";

import type { RecentTrip, SavedPlace } from "@/hooks/use-planner-memory";
import { Button } from "@/components/ui/button";
import type { LocationInput } from "@/lib/validations/routes";

interface PlannerSavedPaneProps {
  savedPlaces: SavedPlace[];
  recentTrips: RecentTrip[];
  currentOrigin?: LocationInput | null;
  currentDestination?: LocationInput | null;
  onBack: () => void;
  onApplyPlace: (location: LocationInput, field: "origin" | "destination") => void;
  onSavePlace: (slot: SavedPlace["slot"], location: LocationInput) => void;
  onRemovePlace: (slot: SavedPlace["slot"]) => void;
  onApplyTrip: (trip: RecentTrip) => void;
}

function SavedPlaceCard({
  slot,
  label,
  place,
  currentOrigin,
  currentDestination,
  onApplyPlace,
  onSavePlace,
  onRemovePlace,
}: {
  slot: SavedPlace["slot"];
  label: string;
  place?: SavedPlace;
  currentOrigin?: LocationInput | null;
  currentDestination?: LocationInput | null;
  onApplyPlace: (location: LocationInput, field: "origin" | "destination") => void;
  onSavePlace: (slot: SavedPlace["slot"], location: LocationInput) => void;
  onRemovePlace: (slot: SavedPlace["slot"]) => void;
}) {
  const Icon = slot === "home" ? Home : Bookmark;

  return (
    <div className="rounded-[28px] border border-white/10 bg-white/5 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/8 text-slate-100">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{label}</p>
            <p className="text-xs text-slate-400">
              {place?.location.name ?? `No ${label.toLowerCase()} saved yet`}
            </p>
          </div>
        </div>

        {place ? (
          <button
            type="button"
            onClick={() => onRemovePlace(slot)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/6 text-slate-200 transition hover:bg-white/12"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {place ? (
          <>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onApplyPlace(place.location, "origin")}
              className="h-10 rounded-full border border-white/10 bg-white/6 px-4 text-white hover:bg-white/12"
            >
              Use as start
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onApplyPlace(place.location, "destination")}
              className="h-10 rounded-full border border-white/10 bg-white/6 px-4 text-white hover:bg-white/12"
            >
              Use as destination
            </Button>
          </>
        ) : null}

        {currentOrigin ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onSavePlace(slot, currentOrigin)}
            className="h-10 rounded-full border border-white/10 bg-white/6 px-4 text-white hover:bg-white/12"
          >
            <Plus className="mr-2 h-4 w-4" />
            Save current start
          </Button>
        ) : null}

        {currentDestination ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => onSavePlace(slot, currentDestination)}
            className="h-10 rounded-full border border-white/10 bg-white/6 px-4 text-white hover:bg-white/12"
          >
            <Plus className="mr-2 h-4 w-4" />
            Save current destination
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function PlannerSavedPane({
  savedPlaces,
  recentTrips,
  currentOrigin,
  currentDestination,
  onBack,
  onApplyPlace,
  onSavePlace,
  onRemovePlace,
  onApplyTrip,
}: PlannerSavedPaneProps) {
  const home = savedPlaces.find((place) => place.slot === "home");
  const work = savedPlaces.find((place) => place.slot === "work");

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-[28px] border border-white/10 bg-white/5 px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-white">Saved anchors</p>
          <p className="text-xs text-slate-400">Store the places you reuse most, then drop them into the next search.</p>
        </div>
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="h-10 rounded-full border border-white/10 bg-white/6 px-4 text-white hover:bg-white/12"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>

      <SavedPlaceCard
        slot="home"
        label="Home"
        place={home}
        currentOrigin={currentOrigin}
        currentDestination={currentDestination}
        onApplyPlace={onApplyPlace}
        onSavePlace={onSavePlace}
        onRemovePlace={onRemovePlace}
      />

      <SavedPlaceCard
        slot="work"
        label="Work"
        place={work}
        currentOrigin={currentOrigin}
        currentDestination={currentDestination}
        onApplyPlace={onApplyPlace}
        onSavePlace={onSavePlace}
        onRemovePlace={onRemovePlace}
      />

      {recentTrips.length ? (
        <div className="rounded-[28px] border border-white/10 bg-white/5 p-4">
          <p className="mb-3 text-sm font-semibold text-white">Recent trips</p>
          <div className="space-y-2">
            {recentTrips.map((trip) => (
              <button
                key={trip.id}
                type="button"
                onClick={() => onApplyTrip(trip)}
                className="flex w-full items-center gap-3 rounded-2xl border border-white/8 bg-white/6 px-3 py-3 text-left transition hover:bg-white/10"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white/8 text-slate-100">
                  <MapPin className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-white">
                    {trip.origin.name} to {trip.destination.name}
                  </p>
                  <p className="text-xs text-slate-400">
                    {new Date(trip.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
