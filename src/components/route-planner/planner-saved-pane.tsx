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
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/8 text-primary">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">{label}</p>
            <p className="text-xs text-muted-foreground">
              {place?.location.name ?? `No ${label.toLowerCase()} saved yet`}
            </p>
          </div>
        </div>

        {place ? (
          <button
            type="button"
            onClick={() => onRemovePlace(slot)}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface-strong text-muted-foreground transition hover:bg-muted"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {place ? (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onApplyPlace(place.location, "origin")}
            >
              Use as start
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onApplyPlace(place.location, "destination")}
            >
              Use as destination
            </Button>
          </>
        ) : null}

        {currentOrigin ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSavePlace(slot, currentOrigin)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Save current start
          </Button>
        ) : null}

        {currentDestination ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onSavePlace(slot, currentDestination)}
          >
            <Plus className="mr-1.5 h-3.5 w-3.5" />
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
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-4 pb-3">
          <div className="rounded-xl border border-border bg-surface px-4 py-3">
            <p className="text-sm font-semibold text-foreground">Places</p>
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
            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="mb-3 text-sm font-semibold text-foreground">Recent trips</p>
              <div className="space-y-2">
                {recentTrips.map((trip) => (
                  <button
                    key={trip.id}
                    type="button"
                    onClick={() => onApplyTrip(trip)}
                    className="flex w-full items-center gap-3 rounded-xl border border-border bg-surface-strong px-3 py-2.5 text-left transition hover:bg-muted"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-surface text-muted-foreground">
                      <MapPin className="h-4 w-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {trip.origin.name} to {trip.destination.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(trip.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-surface/95 pt-3 backdrop-blur-sm">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          size="lg"
          className="h-11 w-full"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>
    </div>
  );
}
