"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Compass, MapPinned } from "lucide-react";
import { startTransition, useMemo, useState } from "react";

import { useCalculateRoutes, useSearchHistory } from "@/hooks/use-route-planner";
import { BrandLogo } from "@/components/brand-logo";
import { MapFrame } from "@/components/map/dhaka-map";
import { EmptyState } from "@/components/route-planner/empty-state";
import { RouteDetailsSheet } from "@/components/route-planner/route-details-sheet";
import { RouteResultsSheet } from "@/components/route-planner/route-results-sheet";
import { SearchCard } from "@/components/route-planner/search-card";
import type {
  CalculateRouteRequest,
  RouteOptimization,
  RouteOption,
} from "@/lib/validations/routes";

function getOptimizationLabel(optimization: RouteOptimization) {
  switch (optimization) {
    case "fastest":
      return "Fastest ranking";
    case "cheapest":
      return "Cheapest ranking";
    default:
      return "Balanced ranking";
  }
}

export function RoutePlannerApp() {
  const historyQuery = useSearchHistory();
  const calculateRoutes = useCalculateRoutes();

  const [results, setResults] = useState<RouteOption[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<RouteOption | null>(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [optimization, setOptimization] =
    useState<RouteOptimization>("recommended");

  const activeRoute = useMemo(
    () => selectedRoute ?? results[0] ?? null,
    [results, selectedRoute],
  );

  const handleSearch = (payload: CalculateRouteRequest) => {
    setOptimization(payload.optimization);
    calculateRoutes.mutate(payload, {
      onSuccess: (response) => {
        startTransition(() => {
          setResults(response.routes);
          setSelectedRoute(response.routes[0] ?? null);
          setResultsOpen(true);
          setDetailsOpen(false);
        });
      },
    });
  };

  return (
    <main className="relative h-dvh min-h-[100svh] overflow-hidden bg-background">
      <MapFrame activeRoute={activeRoute} />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-36 bg-gradient-to-b from-[rgba(10,24,42,0.42)] via-[rgba(10,24,42,0.1)] to-transparent" />
      <div className="pointer-events-none absolute inset-0 z-10 bg-[linear-gradient(180deg,transparent_0%,transparent_58%,rgba(4,13,23,0.08)_100%)]" />

      <div className="absolute left-4 right-4 top-5 z-20 flex items-start justify-between gap-4">
        <BrandLogo />

        <div className="glass-panel flex items-center gap-2 rounded-full px-4 py-3 text-sm font-medium text-foreground">
          <Compass className="h-4 w-4 text-secondary" />
          {getOptimizationLabel(optimization)}
        </div>
      </div>

      {!resultsOpen && !detailsOpen ? (
        <div className="absolute inset-x-0 bottom-0 z-20">
          <SearchCard
            recentSearches={historyQuery.data?.searches ?? []}
            isLoading={calculateRoutes.isPending}
            onSearch={handleSearch}
          />
        </div>
      ) : null}

      <AnimatePresence>
        {calculateRoutes.isPending ? (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 18 }}
            className="absolute inset-x-4 bottom-10 z-30 mx-auto max-w-sm rounded-[28px] border border-white/60 bg-white/82 p-4 shadow-[0_28px_65px_-35px_rgba(15,31,55,0.48)] backdrop-blur-xl"
          >
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                <MapPinned className="h-5 w-5" />
              </div>
              <div>
                <p className="font-display text-base font-semibold text-foreground">
                  Calculating your route
                </p>
                <p className="text-sm text-muted-foreground">
                  Matching Dhaka places, then scoring by time, fare, and transfers.
                </p>
              </div>
            </div>
            <div className="h-2 rounded-full bg-muted">
              <div className="shimmer h-2 w-2/3 rounded-full bg-primary/65" />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {calculateRoutes.isError ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            className="absolute inset-x-4 bottom-8 z-30 mx-auto max-w-sm"
          >
            <EmptyState
              title="Route search hit a problem"
              description={
                calculateRoutes.error instanceof Error
                  ? calculateRoutes.error.message
                  : "Please try again with another pair of Dhaka locations."
              }
            />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <RouteResultsSheet
        open={resultsOpen && !detailsOpen}
        optimization={optimization}
        routes={results}
        selectedRouteId={selectedRoute?.id}
        onClose={() => setResultsOpen(false)}
        onSelectRoute={(route) => {
          setSelectedRoute(route);
          setDetailsOpen(true);
        }}
      />

      <RouteDetailsSheet
        open={detailsOpen}
        route={selectedRoute}
        onClose={() => setDetailsOpen(false)}
      />
    </main>
  );
}
