import { randomUUID } from "crypto";

import { dhakaBusSeedRoutes, dhakaBusSeedStops, type DhakaBusSeedRoute } from "@/lib/data/dhaka-bus-seed";
import { DHAKA_ACCESS_POINTS } from "@/lib/data/dhaka-access-points";
import {
  buildAccessAdvisories,
  getBusStopPointByLabel,
  getMetroStationById,
  resolveTransitInput,
  type ResolvedTransitInput,
  type TransitPoint,
} from "@/lib/server/transit-resolver";
import { normalizeTransitText } from "@/lib/server/transit-support";
import {
  calculateRouteResponseSchema,
  type CalculateRouteRequest,
  routeOptionSchema,
  type RouteOption,
  type RouteStopReference,
} from "@/lib/validations/routes";

interface BusLeg {
  route: DhakaBusSeedRoute;
  boardingLabel: string;
  alightingLabel: string;
  stopCount: number;
  serviceWindowText?: string;
}

const preferredTransferLabels = new Set(
  [
    ...DHAKA_ACCESS_POINTS.flatMap((point) => point.busStopLabels),
    ...dhakaBusSeedStops.filter((stop) => stop.routeCount >= 4).map((stop) => stop.label),
  ].map((label) => normalizeTransitText(label)),
);

function buildServiceWindowText(route: DhakaBusSeedRoute) {
  if (route.openingTime24h && route.closingTime24h) {
    return `${route.openingTime24h} - ${route.closingTime24h}`;
  }

  return [route.openingTimeText, route.closingTimeText].filter(Boolean).join(" - ") || undefined;
}

function getBusDisplayName(route: DhakaBusSeedRoute) {
  const preferred = route.busLabelEn || route.busLabel;
  const withoutParens = preferred.split("(")[0]?.trim() || preferred.trim();
  const firstBanglaChar = withoutParens.search(/[\u0980-\u09FF]/u);

  if (firstBanglaChar > 0) {
    return withoutParens.slice(0, firstBanglaChar).trim();
  }

  return withoutParens;
}

function buildMapPreview(labelA: string, labelB: string) {
  return {
    originLabel: labelA,
    destinationLabel: labelB,
    originQuery: `${labelA}, Dhaka, Bangladesh`,
    destinationQuery: `${labelB}, Dhaka, Bangladesh`,
  };
}

function makeStopReference(
  label: string,
  fallbackType: RouteStopReference["type"] = "bus_stop",
): RouteStopReference {
  const busStop = getBusStopPointByLabel(label);
  if (busStop) {
    return {
      id: busStop.id,
      label,
      type: "bus_stop",
    };
  }

  return {
    label,
    type: fallbackType,
  };
}

function makeMetroReference(stationId: string): RouteStopReference {
  const station = getMetroStationById(stationId);

  return {
    id: station?.id ?? stationId,
    label: station?.name ?? stationId,
    type: "metro_station",
  };
}

function dedupeRoutes(routes: RouteOption[]) {
  const seen = new Set<string>();

  return routes.filter((route) => {
    const key = [
      route.kind,
      normalizeTransitText(route.boarding.label),
      normalizeTransitText(route.alighting.label),
      route.transferStops.map((stop) => normalizeTransitText(stop.label)).join("|"),
      normalizeTransitText(route.summary),
    ].join("::");

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function rankRoutes(routes: RouteOption[]) {
  const kindScore: Record<RouteOption["kind"], number> = {
    metro_direct: 420,
    bus_direct: 340,
    bus_metro_hybrid: 280,
    bus_transfer: 220,
    advisory_connector: 80,
  };

  const confidenceScore: Record<RouteOption["confidence"], number> = {
    exact: 40,
    verified: 20,
    advisory: 0,
  };

  return [...routes].sort((a, b) => {
    const aScore =
      kindScore[a.kind] +
      confidenceScore[a.confidence] -
      a.transferStops.length * 15 -
      (a.stopCount ?? 0) -
      (a.stationCount ?? 0);
    const bScore =
      kindScore[b.kind] +
      confidenceScore[b.confidence] -
      b.transferStops.length * 15 -
      (b.stopCount ?? 0) -
      (b.stationCount ?? 0);

    return bScore - aScore;
  });
}

function buildRouteAdvisories(
  originResolution: ResolvedTransitInput,
  originPoint: TransitPoint,
  destinationResolution: ResolvedTransitInput,
  destinationPoint: TransitPoint,
) {
  return Array.from(
    new Set([
      ...buildAccessAdvisories(originResolution, originPoint, "origin"),
      ...buildAccessAdvisories(destinationResolution, destinationPoint, "destination"),
    ]),
  );
}

function findIndexOnRoute(route: DhakaBusSeedRoute, labels: string[]) {
  let best: { label: string; index: number } | null = null;

  for (const label of labels) {
    const index = route.stopLabels.findIndex(
      (stopLabel) => normalizeTransitText(stopLabel) === normalizeTransitText(label),
    );

    if (index >= 0 && (!best || index < best.index)) {
      best = { label, index };
    }
  }

  return best;
}

function findDirectBusLegs(originLabels: string[], destinationLabels: string[]) {
  const legs: BusLeg[] = [];

  for (const route of dhakaBusSeedRoutes) {
    const boarding = findIndexOnRoute(route, originLabels);
    const alighting = findIndexOnRoute(route, destinationLabels);

    if (!boarding || !alighting || boarding.index >= alighting.index) {
      continue;
    }

    legs.push({
      route,
      boardingLabel: route.stopLabels[boarding.index],
      alightingLabel: route.stopLabels[alighting.index],
      stopCount: alighting.index - boarding.index,
      serviceWindowText: buildServiceWindowText(route),
    });
  }

  return legs;
}

function findTransferBusLegs(originLabels: string[], destinationLabels: string[]) {
  const legs: Array<{
    firstLeg: BusLeg;
    secondLeg: BusLeg;
    transferLabel: string;
  }> = [];

  for (const firstRoute of dhakaBusSeedRoutes) {
    const firstBoarding = findIndexOnRoute(firstRoute, originLabels);
    if (!firstBoarding) {
      continue;
    }

    for (let transferIndex = firstBoarding.index + 1; transferIndex < firstRoute.stopLabels.length; transferIndex++) {
      const transferLabel = firstRoute.stopLabels[transferIndex];

      if (!preferredTransferLabels.has(normalizeTransitText(transferLabel))) {
        continue;
      }

      for (const secondRoute of dhakaBusSeedRoutes) {
        if (secondRoute.id === firstRoute.id) {
          continue;
        }

        const secondTransfer = secondRoute.stopLabels.findIndex(
          (stopLabel) => normalizeTransitText(stopLabel) === normalizeTransitText(transferLabel),
        );
        const secondAlighting = findIndexOnRoute(secondRoute, destinationLabels);

        if (secondTransfer < 0 || !secondAlighting || secondTransfer >= secondAlighting.index) {
          continue;
        }

        legs.push({
          firstLeg: {
            route: firstRoute,
            boardingLabel: firstRoute.stopLabels[firstBoarding.index],
            alightingLabel: transferLabel,
            stopCount: transferIndex - firstBoarding.index,
            serviceWindowText: buildServiceWindowText(firstRoute),
          },
          secondLeg: {
            route: secondRoute,
            boardingLabel: transferLabel,
            alightingLabel: secondRoute.stopLabels[secondAlighting.index],
            stopCount: secondAlighting.index - secondTransfer,
            serviceWindowText: buildServiceWindowText(secondRoute),
          },
          transferLabel,
        });
      }
    }
  }

  return legs;
}

function getMetroFare(originStationId: string, destinationStationId: string) {
  const origin = getMetroStationById(originStationId);
  const destination = getMetroStationById(destinationStationId);

  if (!origin || !destination) {
    return null;
  }

  const delta = Math.abs(origin.fareFromNorth - destination.fareFromNorth);
  return Math.max(20, delta);
}

function createDirectBusRoute(
  leg: BusLeg,
  originResolution: ResolvedTransitInput,
  originPoint: TransitPoint,
  destinationResolution: ResolvedTransitInput,
  destinationPoint: TransitPoint,
) {
  const advisories = buildRouteAdvisories(
    originResolution,
    originPoint,
    destinationResolution,
    destinationPoint,
  );
  const busName = getBusDisplayName(leg.route);

  return routeOptionSchema.parse({
    id: `${leg.route.id}-${normalizeTransitText(leg.boardingLabel)}-${normalizeTransitText(leg.alightingLabel)}`,
    kind: "bus_direct",
    confidence: "verified",
    summary: `${busName} direct`,
    fareType: "unknown",
    fareText: "Bus fare not verified",
    serviceWindowText: leg.serviceWindowText,
    stopCount: leg.stopCount,
    boarding: makeStopReference(leg.boardingLabel),
    alighting: makeStopReference(leg.alightingLabel),
    transferStops: [],
    segments: [
      {
        mode: "bus",
        instruction: `Board ${busName}`,
        startLocation: leg.boardingLabel,
        endLocation: leg.alightingLabel,
        note: "Verified from the Dhaka bus stop-order dataset.",
        serviceWindowText: leg.serviceWindowText,
        fareText: "Fare not verified",
        stopCount: leg.stopCount,
      },
    ],
    mapPreview: buildMapPreview(leg.boardingLabel, leg.alightingLabel),
    advisories,
  });
}

function createTransferBusRoute(
  transfer: {
    firstLeg: BusLeg;
    secondLeg: BusLeg;
    transferLabel: string;
  },
  originResolution: ResolvedTransitInput,
  originPoint: TransitPoint,
  destinationResolution: ResolvedTransitInput,
  destinationPoint: TransitPoint,
) {
  const advisories = buildRouteAdvisories(
    originResolution,
    originPoint,
    destinationResolution,
    destinationPoint,
  );
  const firstBusName = getBusDisplayName(transfer.firstLeg.route);
  const secondBusName = getBusDisplayName(transfer.secondLeg.route);

  return routeOptionSchema.parse({
    id: `${transfer.firstLeg.route.id}-${transfer.secondLeg.route.id}-${normalizeTransitText(transfer.transferLabel)}`,
    kind: "bus_transfer",
    confidence: "verified",
    summary: `${firstBusName} -> ${secondBusName}`,
    fareType: "unknown",
    fareText: "Bus fares not verified",
    serviceWindowText:
      `${firstBusName}: ${transfer.firstLeg.serviceWindowText ?? "N/A"} | ` +
      `${secondBusName}: ${transfer.secondLeg.serviceWindowText ?? "N/A"}`,
    stopCount: transfer.firstLeg.stopCount + transfer.secondLeg.stopCount,
    boarding: makeStopReference(transfer.firstLeg.boardingLabel),
    alighting: makeStopReference(transfer.secondLeg.alightingLabel),
    transferStops: [makeStopReference(transfer.transferLabel, "hub")],
    segments: [
      {
        mode: "bus",
        instruction: `Board ${firstBusName}`,
        startLocation: transfer.firstLeg.boardingLabel,
        endLocation: transfer.transferLabel,
        note: "First bus segment.",
        serviceWindowText: transfer.firstLeg.serviceWindowText,
        fareText: "Fare not verified",
        stopCount: transfer.firstLeg.stopCount,
      },
      {
        mode: "walk",
        instruction: "Change buses",
        startLocation: transfer.transferLabel,
        endLocation: transfer.transferLabel,
        note: "Transfer at a shared bus stop or hub.",
      },
      {
        mode: "bus",
        instruction: `Board ${secondBusName}`,
        startLocation: transfer.transferLabel,
        endLocation: transfer.secondLeg.alightingLabel,
        note: "Second bus segment.",
        serviceWindowText: transfer.secondLeg.serviceWindowText,
        fareText: "Fare not verified",
        stopCount: transfer.secondLeg.stopCount,
      },
    ],
    mapPreview: buildMapPreview(
      transfer.firstLeg.boardingLabel,
      transfer.secondLeg.alightingLabel,
    ),
    advisories,
  });
}

function createMetroRoute(
  originStationId: string,
  destinationStationId: string,
  originResolution: ResolvedTransitInput,
  originPoint: TransitPoint,
  destinationResolution: ResolvedTransitInput,
  destinationPoint: TransitPoint,
) {
  const originStation = getMetroStationById(originStationId);
  const destinationStation = getMetroStationById(destinationStationId);
  if (!originStation || !destinationStation || originStation.id === destinationStation.id) {
    return null;
  }

  const stationCount = Math.abs(originStation.sequence - destinationStation.sequence);
  const fare = getMetroFare(originStation.id, destinationStation.id);
  const advisories = buildRouteAdvisories(
    originResolution,
    originPoint,
    destinationResolution,
    destinationPoint,
  );

  return routeOptionSchema.parse({
    id: `${originStation.id}-${destinationStation.id}`,
    kind: "metro_direct",
    confidence: "exact",
    summary: "Metro direct",
    fareType: "exact",
    fareText: fare ? `BDT ${fare}` : "Metro fare unavailable",
    totalCost: fare ?? undefined,
    stationCount,
    boarding: makeMetroReference(originStation.id),
    alighting: makeMetroReference(destinationStation.id),
    transferStops: [],
    segments: [
      {
        mode: "metro",
        instruction: "Ride Metro Rail Line 6",
        startLocation: originStation.name,
        endLocation: destinationStation.name,
        note: "Exact station order and fare are taken from the curated metro dataset.",
        fareText: fare ? `BDT ${fare}` : undefined,
        stationCount,
      },
    ],
    mapPreview: buildMapPreview(originStation.name, destinationStation.name),
    advisories,
  });
}

function createHybridRoute(
  busLeg: BusLeg,
  interchangeStationId: string,
  destinationStationId: string,
  originResolution: ResolvedTransitInput,
  originPoint: TransitPoint,
  destinationResolution: ResolvedTransitInput,
  destinationPoint: TransitPoint,
  direction: "bus_then_metro" | "metro_then_bus",
) {
  const interchangeStation = getMetroStationById(interchangeStationId);
  const destinationStation = getMetroStationById(destinationStationId);
  const fare = getMetroFare(interchangeStationId, destinationStationId);
  const stationCount =
    interchangeStation && destinationStation
      ? Math.abs(interchangeStation.sequence - destinationStation.sequence)
      : 0;
  const busName = getBusDisplayName(busLeg.route);
  const advisories = buildRouteAdvisories(
    originResolution,
    originPoint,
    destinationResolution,
    destinationPoint,
  );

  if (!interchangeStation || !destinationStation || stationCount <= 0) {
    return null;
  }

  const segments =
    direction === "bus_then_metro"
      ? [
          {
            mode: "bus" as const,
            instruction: `Board ${busName}`,
            startLocation: busLeg.boardingLabel,
            endLocation: busLeg.alightingLabel,
            note: "Ride to a metro interchange hub.",
            serviceWindowText: busLeg.serviceWindowText,
            fareText: "Bus fare not verified",
            stopCount: busLeg.stopCount,
          },
          {
            mode: "metro" as const,
            instruction: "Continue by Metro Rail Line 6",
            startLocation: interchangeStation.name,
            endLocation: destinationStation.name,
            note: "Metro fare is exact for the station pair.",
            fareText: fare ? `BDT ${fare}` : undefined,
            stationCount,
          },
        ]
      : [
          {
            mode: "metro" as const,
            instruction: "Start with Metro Rail Line 6",
            startLocation: interchangeStation.name,
            endLocation: destinationStation.name,
            note: "Metro fare is exact for the station pair.",
            fareText: fare ? `BDT ${fare}` : undefined,
            stationCount,
          },
          {
            mode: "bus" as const,
            instruction: `Then board ${busName}`,
            startLocation: busLeg.boardingLabel,
            endLocation: busLeg.alightingLabel,
            note: "Final bus segment after leaving the metro.",
            serviceWindowText: busLeg.serviceWindowText,
            fareText: "Bus fare not verified",
            stopCount: busLeg.stopCount,
          },
        ];

  return routeOptionSchema.parse({
    id: `${busLeg.route.id}-${interchangeStationId}-${destinationStationId}-${direction}`,
    kind: "bus_metro_hybrid",
    confidence: "verified",
    summary: `${busName} + Metro`,
    fareType: "unknown",
    fareText: fare ? `Metro BDT ${fare}; bus fare not verified` : "Bus fare not verified",
    serviceWindowText: busLeg.serviceWindowText,
    stopCount: busLeg.stopCount,
    stationCount,
    boarding:
      direction === "bus_then_metro"
        ? makeStopReference(busLeg.boardingLabel)
        : makeMetroReference(interchangeStationId),
    alighting:
      direction === "bus_then_metro"
        ? makeMetroReference(destinationStationId)
        : makeStopReference(busLeg.alightingLabel),
    transferStops: [
      direction === "bus_then_metro"
        ? makeMetroReference(interchangeStationId)
        : makeStopReference(busLeg.boardingLabel, "hub"),
    ],
    segments,
    mapPreview: buildMapPreview(
      direction === "bus_then_metro" ? busLeg.boardingLabel : interchangeStation.name,
      direction === "bus_then_metro" ? destinationStation.name : busLeg.alightingLabel,
    ),
    advisories,
  });
}

function createAdvisoryRoute(
  originResolution: ResolvedTransitInput,
  originPoint: TransitPoint,
  destinationResolution: ResolvedTransitInput,
  destinationPoint: TransitPoint,
) {
  const advisories = buildRouteAdvisories(
    originResolution,
    originPoint,
    destinationResolution,
    destinationPoint,
  );

  return routeOptionSchema.parse({
    id: randomUUID(),
    kind: "advisory_connector",
    confidence: "advisory",
    summary: "Reach a major transit hub first",
    fareType: "advisory",
    fareText: "Negotiated or corridor-based",
    boarding: {
      label: originPoint.name,
      type: originPoint.type,
      id: originPoint.id,
    },
    alighting: {
      label: destinationPoint.name,
      type: destinationPoint.type,
      id: destinationPoint.id,
    },
    transferStops: [],
    segments: [
      {
        mode: "rickshaw",
        instruction: `Reach ${originPoint.name} first`,
        startLocation: originResolution.displayName,
        endLocation: originPoint.name,
        note: "No verified direct bus or metro route was found for this pair yet.",
        fareText: "Negotiated locally",
      },
    ],
    mapPreview: buildMapPreview(originPoint.name, destinationPoint.name),
    advisories: advisories.length
      ? advisories
      : ["Ask nearby drivers or local passengers for the best corridor option."],
  });
}

function collectDirectBusRoutes(
  originResolution: ResolvedTransitInput,
  originPoint: TransitPoint,
  destinationResolution: ResolvedTransitInput,
  destinationPoint: TransitPoint,
) {
  return findDirectBusLegs(originPoint.busStopLabels, destinationPoint.busStopLabels).map((leg) =>
    createDirectBusRoute(
      leg,
      originResolution,
      originPoint,
      destinationResolution,
      destinationPoint,
    ),
  );
}

function collectTransferBusRoutes(
  originResolution: ResolvedTransitInput,
  originPoint: TransitPoint,
  destinationResolution: ResolvedTransitInput,
  destinationPoint: TransitPoint,
) {
  return findTransferBusLegs(originPoint.busStopLabels, destinationPoint.busStopLabels).map(
    (transfer) =>
      createTransferBusRoute(
        transfer,
        originResolution,
        originPoint,
        destinationResolution,
        destinationPoint,
      ),
  );
}

function collectHybridRoutes(
  originResolution: ResolvedTransitInput,
  originPoint: TransitPoint,
  destinationResolution: ResolvedTransitInput,
  destinationPoint: TransitPoint,
) {
  const routes: RouteOption[] = [];
  const interchangePoints = DHAKA_ACCESS_POINTS.filter(
    (point) => point.metroStationId && point.busStopLabels.length,
  );

  if (originPoint.busStopLabels.length && destinationPoint.metroStationId) {
    for (const interchange of interchangePoints) {
      const legs = findDirectBusLegs(originPoint.busStopLabels, interchange.busStopLabels);
      for (const leg of legs) {
        const route = createHybridRoute(
          leg,
          interchange.metroStationId!,
          destinationPoint.metroStationId,
          originResolution,
          originPoint,
          destinationResolution,
          destinationPoint,
          "bus_then_metro",
        );

        if (route) {
          routes.push(route);
        }
      }
    }
  }

  if (originPoint.metroStationId && destinationPoint.busStopLabels.length) {
    for (const interchange of interchangePoints) {
      const legs = findDirectBusLegs(interchange.busStopLabels, destinationPoint.busStopLabels);
      for (const leg of legs) {
        const route = createHybridRoute(
          leg,
          originPoint.metroStationId,
          interchange.metroStationId!,
          originResolution,
          originPoint,
          destinationResolution,
          destinationPoint,
          "metro_then_bus",
        );

        if (route) {
          routes.push(route);
        }
      }
    }
  }

  return routes;
}

export async function calculateRoutes(payload: CalculateRouteRequest) {
  const [originResolution, destinationResolution] = await Promise.all([
    resolveTransitInput(payload.origin),
    resolveTransitInput(payload.destination),
  ]);

  const routes: RouteOption[] = [];

  for (const originPoint of originResolution.candidates) {
    for (const destinationPoint of destinationResolution.candidates) {
      if (originPoint.id === destinationPoint.id) {
        continue;
      }

      if (originPoint.metroStationId && destinationPoint.metroStationId) {
        const metroRoute = createMetroRoute(
          originPoint.metroStationId,
          destinationPoint.metroStationId,
          originResolution,
          originPoint,
          destinationResolution,
          destinationPoint,
        );

        if (metroRoute) {
          routes.push(metroRoute);
        }
      }

      if (originPoint.busStopLabels.length && destinationPoint.busStopLabels.length) {
        routes.push(
          ...collectDirectBusRoutes(
            originResolution,
            originPoint,
            destinationResolution,
            destinationPoint,
          ),
        );
        routes.push(
          ...collectTransferBusRoutes(
            originResolution,
            originPoint,
            destinationResolution,
            destinationPoint,
          ),
        );
      }

      routes.push(
        ...collectHybridRoutes(
          originResolution,
          originPoint,
          destinationResolution,
          destinationPoint,
        ),
      );
    }
  }

  const rankedRoutes = rankRoutes(dedupeRoutes(routes)).slice(0, 6);

  const finalRoutes =
    rankedRoutes.length > 0
      ? rankedRoutes
      : originResolution.candidates[0] && destinationResolution.candidates[0]
        ? [
            createAdvisoryRoute(
              originResolution,
              originResolution.candidates[0],
              destinationResolution,
              destinationResolution.candidates[0],
            ),
          ]
        : [];

  return calculateRouteResponseSchema.parse({
    routes: finalRoutes,
    source: "deterministic",
  });
}
