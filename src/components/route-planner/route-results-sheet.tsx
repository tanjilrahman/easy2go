"use client";

import { BadgeCheck } from "lucide-react";

import { BottomSheet } from "@/components/route-planner/bottom-sheet";
import { EmptyState } from "@/components/route-planner/empty-state";
import { RouteCard } from "@/components/route-planner/route-card";
import type { RouteOption } from "@/lib/validations/routes";

interface RouteResultsSheetProps {
  open: boolean;
  routes: RouteOption[];
  selectedRouteId?: string;
  onClose: () => void;
  onSelectRoute: (route: RouteOption) => void;
}

export function RouteResultsSheet({
  open,
  routes,
  selectedRouteId,
  onClose,
  onSelectRoute,
}: RouteResultsSheetProps) {
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Best Routes"
      subtitle={
        routes.length
          ? `${routes.length} deterministic options for your Dhaka trip`
          : "No routes found yet"
      }
      height="64vh"
    >
      {routes.length ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-[24px] bg-muted/80 px-4 py-3">
            <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <BadgeCheck className="h-4 w-4 text-secondary" />
              Tap a route to open boarding, transfer, and map preview details.
            </div>
          </div>

          <div className="space-y-3">
            {routes.map((route) => (
              <RouteCard
                key={route.id}
                route={route}
                selected={route.id === selectedRouteId}
                onClick={() => onSelectRoute(route)}
              />
            ))}
          </div>
        </div>
      ) : (
        <EmptyState
          title="No verified route available yet"
          description="Try a more recognizable place in Dhaka or pick a bus stop / metro station from suggestions."
        />
      )}
    </BottomSheet>
  );
}
