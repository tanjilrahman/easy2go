"use client";

import { ArrowLeft, MapPin } from "lucide-react";

import type { RecentTrip } from "@/hooks/use-planner-memory";
import { Button } from "@/components/ui/button";

interface PlannerSavedPaneProps {
  recentTrips: RecentTrip[];
  onBack: () => void;
  onApplyTrip: (trip: RecentTrip) => void;
}

export function PlannerSavedPane({
  recentTrips,
  onBack,
  onApplyTrip,
}: PlannerSavedPaneProps) {
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        <div className="space-y-2 pb-2">
          {recentTrips.length ? (
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
          ) : (
            <p className="px-1 text-sm text-muted-foreground">No recent trips yet.</p>
          )}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 shrink-0 border-t border-border bg-surface/95 pt-2 backdrop-blur-sm">
        <Button
          type="button"
          variant="outline"
          onClick={onBack}
          size="lg"
          className="h-10 w-full"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
      </div>
    </div>
  );
}
