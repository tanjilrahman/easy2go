import { randomUUID } from "crypto";

import { dhakaBusSeedRoutes, dhakaBusSeedStops, type DhakaBusSeedRoute } from "@/lib/data/dhaka-bus-seed";
import { DHAKA_ACCESS_POINTS } from "@/lib/data/dhaka-access-points";
import { getDhakaMetroFareBdtBySequence } from "@/lib/data/dhaka-metro";
import {
  getBusStopPointByLabel,
  getMetroStationById,
  resolveTransitInput,
  type ResolvedTransitInput,
  type TransitPoint,
} from "@/lib/server/transit-resolver";
import { haversineDistanceKm, normalizeTransitText } from "@/lib/server/transit-support";
import {
  calculateRouteResponseSchema,
  routeOptionSchema,
  type ConnectorType,
  type CalculateRouteRequest,
  type RouteConfidence,
  type RouteKind,
  type RouteMapPreview,
  type RouteOption,
  type RouteOptimization,
  type RouteSegment,
  type RouteStopReference,
  type TransportMode,
} from "@/lib/validations/routes";

interface BusLeg {
  route: DhakaBusSeedRoute;
  boardingLabel: string;
  alightingLabel: string;
  stopCount: number;
  serviceWindowText?: string;
}

interface RouteMetrics {
  distanceKm?: number;
  durationMinutes?: number;
  costBdt?: number;
}

interface AccessLeg {
  connectorType: ConnectorType;
  mode: TransportMode;
  distanceKm: number;
  durationMinutes: number;
  costBdt?: number;
  startLocation: string;
  endLocation: string;
  note: string;
}

interface FallbackDirectBusCandidate {
  leg: BusLeg;
  alightingCoordinates: [number, number];
  remainingDistanceKm: number;
}

interface FallbackTransferBusCandidate {
  firstLeg: BusLeg;
  secondLeg: BusLeg;
  transferLabel: string;
  alightingCoordinates: [number, number];
  remainingDistanceKm: number;
}

const preferredTransferLabels = new Set(
  [
    ...DHAKA_ACCESS_POINTS.flatMap((point) => point.busStopLabels),
    ...dhakaBusSeedStops.filter((stop) => stop.routeCount >= 4).map((stop) => stop.label),
  ].map((label) => normalizeTransitText(label)),
);

const ACCESS_WALK_MAX_KM = 0.8;
const ACCESS_RICKSHAW_MAX_KM = 2.5;
const BUS_STOP_SPACING_KM = 0.9;
const METRO_STATION_SPACING_KM = 1.35;
const BUS_SPEED_KMPH = 13;
// Calibrated against the published Uttara North <-> Motijheel end-to-end timetable.
const METRO_SPEED_KMPH = 32;
const WALK_SPEED_KMPH = 4.6;
const RICKSHAW_SPEED_KMPH = 10;
const ADVISORY_CONNECTOR_SPEED_KMPH = 12;
const BUS_STOP_DELAY_MINUTES = 0.7;
const METRO_STATION_DELAY_MINUTES = 0.7;
const METRO_TERMINAL_BUFFER_MINUTES = 2;
const METRO_SERVICE_WINDOW_TEXT =
  "Weekdays & Sat/holidays: Uttara North 06:30-21:30, Motijheel 07:15-22:10 | Friday: Uttara North 15:00-21:00, Motijheel 15:20-21:40";
const TRANSFER_BUFFER_MINUTES = 6;
const FALLBACK_SORT_VALUE = 99_999;

const confidencePriority: Record<RouteConfidence, number> = {
  exact: 3,
  verified: 2,
  advisory: 1,
};

const kindPriority: Record<RouteKind, number> = {
  metro_direct: 5,
  bus_direct: 4,
  bus_metro_hybrid: 3,
  bus_transfer: 2,
  advisory_connector: 1,
};

function roundDistanceKm(distanceKm: number) {
  return Math.round(distanceKm * 10) / 10;
}

function formatApproxFare(costBdt: number) {
  return `Approx. BDT ${Math.round(costBdt)}`;
}

function formatExactFare(costBdt: number) {
  return `BDT ${Math.round(costBdt)}`;
}

function formatRouteTotal(costBdt?: number, fareType: "exact" | "advisory" = "advisory") {
  if (costBdt === undefined) {
    return "Fare varies";
  }

  return fareType === "exact" ? formatExactFare(costBdt) : formatApproxFare(costBdt);
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function findBusStopCoordinates(label: string) {
  const normalizedLabel = normalizeTransitText(label);

  return DHAKA_ACCESS_POINTS.find((point) =>
    point.busStopLabels.some(
      (stopLabel) => normalizeTransitText(stopLabel) === normalizedLabel,
    ),
  )?.coordinates;
}

function combineRouteMetrics(parts: RouteMetrics[]) {
  const totalDistanceKm = parts.reduce((sum, part) => sum + (part.distanceKm ?? 0), 0);
  const totalDurationMinutes = parts.reduce((sum, part) => sum + (part.durationMinutes ?? 0), 0);
  const costParts = parts.filter((part) => part.costBdt !== undefined);

  return {
    totalCost:
      costParts.length > 0
        ? costParts.reduce((sum, part) => sum + (part.costBdt ?? 0), 0)
        : undefined,
    estimatedDistanceKm: totalDistanceKm > 0 ? roundDistanceKm(totalDistanceKm) : undefined,
    estimatedDurationMinutes:
      totalDurationMinutes > 0 ? Math.round(totalDurationMinutes) : undefined,
  };
}

export function estimateRickshawFareBdt(distanceKm: number) {
  if (distanceKm <= 0) {
    return undefined;
  }

  if (distanceKm <= 1) {
    return 25;
  }

  const extraSteps = Math.ceil((distanceKm - 1) / 0.5);
  return Math.min(70, 25 + extraSteps * 10);
}

function estimateExtendedRickshawFareBdt(distanceKm: number) {
  if (distanceKm <= 0) {
    return undefined;
  }

  if (distanceKm <= ACCESS_RICKSHAW_MAX_KM) {
    return estimateRickshawFareBdt(distanceKm);
  }

  const extraSteps = Math.ceil((distanceKm - 1) / 0.5);
  return 25 + extraSteps * 10;
}

function createAccessLeg(
  resolution: ResolvedTransitInput,
  point: TransitPoint,
  role: "origin" | "destination",
): AccessLeg | null {
  if (resolution.directMatch || !resolution.place?.coordinates || !point.coordinates) {
    return null;
  }

  const distanceKm = haversineDistanceKm(resolution.place.coordinates, point.coordinates);

  if (!Number.isFinite(distanceKm) || distanceKm <= 0.05) {
    return null;
  }

  if (distanceKm <= ACCESS_WALK_MAX_KM) {
    return {
      connectorType: "walk",
      mode: "walk",
      distanceKm,
      durationMinutes: Math.max(4, Math.round((distanceKm / WALK_SPEED_KMPH) * 60)),
      startLocation: role === "origin" ? resolution.displayName : point.name,
      endLocation: role === "origin" ? point.name : resolution.displayName,
      note:
        role === "origin"
          ? `Short walking connector to ${point.name}.`
          : `Short walking connector from ${point.name}.`,
    };
  }

  if (distanceKm <= ACCESS_RICKSHAW_MAX_KM) {
    return {
      connectorType: "rickshaw",
      mode: "rickshaw",
      distanceKm,
      durationMinutes: Math.max(6, Math.round((distanceKm / RICKSHAW_SPEED_KMPH) * 60)),
      costBdt: estimateRickshawFareBdt(distanceKm),
      startLocation: role === "origin" ? resolution.displayName : point.name,
      endLocation: role === "origin" ? point.name : resolution.displayName,
      note:
        role === "origin"
          ? `Rickshaw connector to ${point.name}.`
          : `Rickshaw connector from ${point.name}.`,
    };
  }

  return {
    connectorType: "advisory",
    mode: "ride_share",
    distanceKm,
    durationMinutes: Math.max(10, Math.round((distanceKm / ADVISORY_CONNECTOR_SPEED_KMPH) * 60)),
    startLocation: role === "origin" ? resolution.displayName : point.name,
    endLocation: role === "origin" ? point.name : resolution.displayName,
    note:
      role === "origin"
        ? `${point.name} is farther from ${resolution.displayName}; plan a longer rickshaw or ride-share connector.`
        : `${resolution.displayName} sits beyond short rickshaw range from ${point.name}; plan a longer connector after transit.`,
  };
}

function createConnectorLegBetween(
  startLocation: string,
  startCoordinates: [number, number] | undefined,
  endLocation: string,
  endCoordinates: [number, number] | undefined,
  preference: "auto" | "prefer_rickshaw" = "auto",
): AccessLeg | null {
  if (!startCoordinates || !endCoordinates) {
    return null;
  }

  const distanceKm = haversineDistanceKm(startCoordinates, endCoordinates);

  if (!Number.isFinite(distanceKm) || distanceKm <= 0.05) {
    return null;
  }

  if (preference === "auto" && distanceKm <= ACCESS_WALK_MAX_KM) {
    return {
      connectorType: "walk",
      mode: "walk",
      distanceKm,
      durationMinutes: Math.max(4, Math.round((distanceKm / WALK_SPEED_KMPH) * 60)),
      startLocation,
      endLocation,
      note: `Short walking connector from ${startLocation} to ${endLocation}.`,
    };
  }

  return {
    connectorType: "rickshaw",
    mode: "rickshaw",
    distanceKm,
    durationMinutes: Math.max(6, Math.round((distanceKm / RICKSHAW_SPEED_KMPH) * 60)),
    costBdt: estimateExtendedRickshawFareBdt(distanceKm),
    startLocation,
    endLocation,
    note:
      distanceKm <= ACCESS_RICKSHAW_MAX_KM
        ? `Rickshaw connector from ${startLocation} to ${endLocation}.`
        : `Continue from ${startLocation} by rickshaw for the remaining distance to ${endLocation}.`,
  };
}

function accessLegMetrics(leg?: AccessLeg | null): RouteMetrics {
  if (!leg) {
    return {};
  }

  return {
    distanceKm: leg.distanceKm,
    durationMinutes: leg.durationMinutes,
    costBdt: leg.costBdt,
  };
}

function buildAccessSegment(leg: AccessLeg): RouteSegment {
  const fareText =
    leg.connectorType === "rickshaw" && leg.costBdt !== undefined
      ? formatApproxFare(leg.costBdt)
      : undefined;

  const instruction =
    leg.connectorType === "walk"
      ? "Walk connector"
      : leg.connectorType === "rickshaw"
        ? "Rickshaw connector"
        : "Long connector";

  return {
    mode: leg.mode,
    instruction,
    startLocation: leg.startLocation,
    endLocation: leg.endLocation,
    note: leg.note,
    fareText,
    estimatedDistanceKm: roundDistanceKm(leg.distanceKm),
    estimatedDurationMinutes: leg.durationMinutes,
    connectorType: leg.connectorType,
    connectorDistanceKm: roundDistanceKm(leg.distanceKm),
    connectorFare: leg.costBdt,
  };
}

function estimateBusLegDistanceKm(leg: BusLeg) {
  const boardingCoordinates = findBusStopCoordinates(leg.boardingLabel);
  const alightingCoordinates = findBusStopCoordinates(leg.alightingLabel);

  if (boardingCoordinates && alightingCoordinates) {
    return Math.max(
      1.5,
      haversineDistanceKm(boardingCoordinates, alightingCoordinates) * 1.2,
    );
  }

  return Math.max(1.5, leg.stopCount * BUS_STOP_SPACING_KM);
}

function estimateMetroDistanceKm(
  originStationId: string,
  destinationStationId: string,
  stationCount: number,
) {
  const origin = getMetroStationById(originStationId);
  const destination = getMetroStationById(destinationStationId);

  if (origin?.coordinates && destination?.coordinates) {
    return Math.max(
      1.2,
      haversineDistanceKm(origin.coordinates, destination.coordinates) * 1.08,
    );
  }

  return Math.max(1.2, stationCount * METRO_STATION_SPACING_KM);
}

function estimateBusFareBdt(distanceKm: number, stopCount: number) {
  const effectiveDistanceKm = Math.max(distanceKm, stopCount * BUS_STOP_SPACING_KM);

  if (effectiveDistanceKm <= 4) {
    return 10;
  }

  if (effectiveDistanceKm <= 8) {
    return 15;
  }

  if (effectiveDistanceKm <= 12) {
    return 20;
  }

  if (effectiveDistanceKm <= 16) {
    return 25;
  }

  if (effectiveDistanceKm <= 20) {
    return 30;
  }

  if (effectiveDistanceKm <= 24) {
    return 35;
  }

  return 40;
}

function estimateBusDurationMinutes(distanceKm: number, stopCount: number) {
  const runningMinutes = (distanceKm / BUS_SPEED_KMPH) * 60;
  const dwellMinutes = stopCount * BUS_STOP_DELAY_MINUTES;

  return Math.max(10, Math.round(runningMinutes + dwellMinutes + 5));
}

function estimateMetroDurationMinutes(distanceKm: number, stationCount: number) {
  const runningMinutes = (distanceKm / METRO_SPEED_KMPH) * 60;
  const dwellMinutes = stationCount * METRO_STATION_DELAY_MINUTES;

  return Math.max(
    6,
    Math.round(runningMinutes + dwellMinutes + METRO_TERMINAL_BUFFER_MINUTES),
  );
}

function buildServiceWindowText(route: DhakaBusSeedRoute) {
  if (route.openingTime24h && route.closingTime24h) {
    return `${route.openingTime24h} - ${route.closingTime24h}`;
  }

  return [route.openingTimeText, route.closingTimeText].filter(Boolean).join(" - ") || undefined;
}

function joinServiceWindows(windows: Array<string | undefined>) {
  const joined = dedupeStrings(windows.filter(Boolean) as string[]).join(" | ");
  return joined || undefined;
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

function buildTripMapPreview(
  originInput: CalculateRouteRequest["origin"],
  destinationInput: CalculateRouteRequest["destination"],
  originResolution: ResolvedTransitInput,
  destinationResolution: ResolvedTransitInput,
): RouteMapPreview {
  const originLabel = originResolution.displayName;
  const destinationLabel = destinationResolution.displayName;

  return {
    originLabel,
    destinationLabel,
    originQuery:
      originResolution.place?.address ??
      originInput.address ??
      `${originLabel}, Dhaka, Bangladesh`,
    destinationQuery:
      destinationResolution.place?.address ??
      destinationInput.address ??
      `${destinationLabel}, Dhaka, Bangladesh`,
    originCoordinates:
      originResolution.place?.coordinates ??
      originInput.coordinates ??
      originResolution.candidates[0]?.coordinates,
    destinationCoordinates:
      destinationResolution.place?.coordinates ??
      destinationInput.coordinates ??
      destinationResolution.candidates[0]?.coordinates,
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

export function createPathSignature(route: Pick<
  RouteOption,
  "kind" | "boarding" | "alighting" | "transferStops" | "segments" | "mapPreview"
>) {
  const segmentSignature = route.segments
    .map((segment) =>
      [
        segment.mode,
        normalizeTransitText(segment.startLocation),
        normalizeTransitText(segment.endLocation),
        segment.connectorType ?? "main",
      ].join(":"),
    )
    .join("|");

  return [
    route.kind,
    normalizeTransitText(route.boarding.label),
    normalizeTransitText(route.alighting.label),
    route.transferStops.map((stop) => normalizeTransitText(stop.label)).join(">"),
    normalizeTransitText(route.mapPreview.originLabel),
    normalizeTransitText(route.mapPreview.destinationLabel),
    segmentSignature,
  ].join("::");
}

function buildGroupedSummary(route: RouteOption) {
  if (route.kind === "metro_direct") {
    return "Metro direct";
  }

  if (route.kind === "bus_direct") {
    return route.serviceLabels.length > 1
      ? "Direct bus corridor"
      : `${route.primaryServiceLabel ?? "Bus"} direct`;
  }

  if (route.kind === "bus_transfer") {
    return "Bus transfer corridor";
  }

  if (route.kind === "bus_metro_hybrid") {
    return route.serviceLabels.length > 1
      ? "Bus + Metro link"
      : `${route.primaryServiceLabel ?? "Bus"} + Metro`;
  }

  return "Reach a transit corridor first";
}

function createHighlights(route: RouteOption) {
  const highlights: string[] = [];

  if (route.estimatedDurationMinutes) {
    highlights.push(`${route.estimatedDurationMinutes} min`);
  }

  if (route.totalCost !== undefined) {
    highlights.push(`BDT ${Math.round(route.totalCost)}`);
  }

  if (route.transferCount === 0) {
    highlights.push("No transfers");
  } else {
    highlights.push(`${route.transferCount} transfer${route.transferCount > 1 ? "s" : ""}`);
  }

  if (route.stationCount) {
    highlights.push(`${route.stationCount} stations`);
  } else if (route.stopCount) {
    highlights.push(`${route.stopCount} stops`);
  }

  return dedupeStrings(highlights).slice(0, 4);
}

function createTradeoffs(route: RouteOption) {
  const tradeoffs: string[] = [];

  if (route.confidence === "advisory") {
    tradeoffs.push("Advisory path");
  }

  if (route.segments.some((segment) => segment.connectorType === "advisory")) {
    tradeoffs.push("Long connector");
  }

  if (route.transferCount > 0) {
    tradeoffs.push(
      `${route.transferCount} transfer${route.transferCount > 1 ? "s" : ""} to manage`,
    );
  }

  if (route.serviceLabels.length > 1) {
    tradeoffs.push(`Also available via ${route.serviceLabels.slice(1).join(", ")}`);
  }

  return dedupeStrings(tradeoffs).slice(0, 3);
}

function createRouteAdvisories(
  originPoint: TransitPoint,
  destinationPoint: TransitPoint,
  originAccess: AccessLeg | null,
  destinationAccess: AccessLeg | null,
) {
  return dedupeStrings([
    ...originPoint.advisories,
    ...destinationPoint.advisories,
    ...(originAccess?.connectorType === "advisory" ? [originAccess.note] : []),
    ...(destinationAccess?.connectorType === "advisory" ? [destinationAccess.note] : []),
  ]);
}

function finalizeRoute(route: Omit<RouteOption, "pathSignature" | "highlights" | "tradeoffs">) {
  const withDefaults: RouteOption = {
    ...route,
    pathSignature: "",
    highlights: [],
    tradeoffs: [],
  };

  const pathSignature = createPathSignature(withDefaults);

  return routeOptionSchema.parse({
    ...withDefaults,
    pathSignature,
    summary: buildGroupedSummary({
      ...withDefaults,
      pathSignature,
      highlights: [],
      tradeoffs: [],
    }),
    highlights: createHighlights({
      ...withDefaults,
      pathSignature,
      highlights: [],
      tradeoffs: [],
    }),
    tradeoffs: createTradeoffs({
      ...withDefaults,
      pathSignature,
      highlights: [],
      tradeoffs: [],
    }),
  });
}

function applyTripMapPreview(routes: RouteOption[], mapPreview: RouteMapPreview) {
  return routes.map((route) => {
    const nextRoute: RouteOption = {
      ...route,
      mapPreview,
      pathSignature: createPathSignature({
        kind: route.kind,
        boarding: route.boarding,
        alighting: route.alighting,
        transferStops: route.transferStops,
        segments: route.segments,
        mapPreview,
      }),
    };

    return routeOptionSchema.parse(nextRoute);
  });
}

function pickBestRouteCandidate(current: RouteOption, incoming: RouteOption) {
  const currentDuration = current.estimatedDurationMinutes ?? FALLBACK_SORT_VALUE;
  const incomingDuration = incoming.estimatedDurationMinutes ?? FALLBACK_SORT_VALUE;

  if (incomingDuration !== currentDuration) {
    return incomingDuration < currentDuration ? incoming : current;
  }

  const currentCost = current.totalCost ?? FALLBACK_SORT_VALUE;
  const incomingCost = incoming.totalCost ?? FALLBACK_SORT_VALUE;

  if (incomingCost !== currentCost) {
    return incomingCost < currentCost ? incoming : current;
  }

  if (confidencePriority[incoming.confidence] !== confidencePriority[current.confidence]) {
    return confidencePriority[incoming.confidence] > confidencePriority[current.confidence]
      ? incoming
      : current;
  }

  return current;
}

function groupRoutesByPath(routes: RouteOption[]) {
  const grouped = new Map<string, RouteOption>();

  for (const route of routes) {
    const existing = grouped.get(route.pathSignature);

    if (!existing) {
      grouped.set(route.pathSignature, route);
      continue;
    }

    const base = pickBestRouteCandidate(existing, route);
    const serviceLabels = dedupeStrings([...existing.serviceLabels, ...route.serviceLabels]);
    const advisories = dedupeStrings([...existing.advisories, ...route.advisories]);
    const serviceWindowText = dedupeStrings(
      [existing.serviceWindowText, route.serviceWindowText].filter(Boolean) as string[],
    ).join(" | ");

    grouped.set(
      route.pathSignature,
      finalizeRoute({
        ...base,
        id: route.pathSignature,
        serviceLabels,
        primaryServiceLabel: serviceLabels[0],
        advisories,
        serviceWindowText: serviceWindowText || undefined,
        transferCount: base.transferStops.length,
      }),
    );
  }

  return [...grouped.values()];
}

function createPresentationSignature(route: RouteOption) {
  return [
    route.kind,
    normalizeTransitText(route.summary),
    normalizeTransitText(route.boarding.label),
    normalizeTransitText(route.alighting.label),
    route.transferStops.map((stop) => normalizeTransitText(stop.label)).join(">"),
    [...route.serviceLabels]
      .map((label) => normalizeTransitText(label))
      .sort()
      .join("|"),
  ].join("::");
}

function groupRoutesByPresentation(routes: RouteOption[]) {
  const grouped = new Map<string, RouteOption>();

  for (const route of routes) {
    const presentationSignature = createPresentationSignature(route);
    const existing = grouped.get(presentationSignature);

    if (!existing) {
      grouped.set(presentationSignature, route);
      continue;
    }

    const base = pickBestRouteCandidate(existing, route);
    const serviceLabels = dedupeStrings([...existing.serviceLabels, ...route.serviceLabels]);
    const advisories = dedupeStrings([...existing.advisories, ...route.advisories]);
    const serviceWindowText = dedupeStrings(
      [existing.serviceWindowText, route.serviceWindowText].filter(Boolean) as string[],
    ).join(" | ");

    grouped.set(
      presentationSignature,
      finalizeRoute({
        ...base,
        id: base.id,
        serviceLabels,
        primaryServiceLabel: serviceLabels[0],
        advisories,
        serviceWindowText: serviceWindowText || undefined,
        transferCount: base.transferStops.length,
      }),
    );
  }

  return [...grouped.values()];
}

function routeScore(route: RouteOption, optimization: RouteOptimization) {
  const duration = route.estimatedDurationMinutes ?? FALLBACK_SORT_VALUE;
  const cost = route.totalCost ?? FALLBACK_SORT_VALUE;
  const distance = route.estimatedDistanceKm ?? FALLBACK_SORT_VALUE;

  if (optimization === "fastest") {
    return -(duration * 12 + route.transferCount * 40 + cost * 2 + distance);
  }

  if (optimization === "cheapest") {
    return -(cost * 12 + duration * 3 + route.transferCount * 30 + distance);
  }

  return (
    kindPriority[route.kind] * 36 +
    confidencePriority[route.confidence] * 24 -
    route.transferCount * 20 -
    duration / 4 -
    cost / 5 -
    distance / 3
  );
}

function routeUsesMetro(route: RouteOption) {
  return route.segments.some((segment) => segment.mode === "metro");
}

function pickAlternativeReason(route: RouteOption, fastest: RouteOption) {
  if (route.transferCount < fastest.transferCount) {
    return "Fewer transfers";
  }

  if (
    route.totalCost !== undefined &&
    fastest.totalCost !== undefined &&
    route.totalCost < fastest.totalCost
  ) {
    return "Lower total fare";
  }

  if (confidencePriority[route.confidence] > confidencePriority[fastest.confidence]) {
    return "Higher confidence";
  }

  if (route.kind !== fastest.kind) {
    return "Different mode mix";
  }

  return "Strong alternative";
}

export function surfaceRoutes(routes: RouteOption[], optimization: RouteOptimization) {
  if (!routes.length) {
    return [];
  }

  const grouped = groupRoutesByPresentation(groupRoutesByPath(routes));
  const fastest = [...grouped].sort((a, b) => {
    const aDuration = a.estimatedDurationMinutes ?? FALLBACK_SORT_VALUE;
    const bDuration = b.estimatedDurationMinutes ?? FALLBACK_SORT_VALUE;

    if (aDuration !== bDuration) {
      return aDuration - bDuration;
    }

    const aCost = a.totalCost ?? FALLBACK_SORT_VALUE;
    const bCost = b.totalCost ?? FALLBACK_SORT_VALUE;

    if (aCost !== bCost) {
      return aCost - bCost;
    }

    if (a.transferCount !== b.transferCount) {
      return a.transferCount - b.transferCount;
    }

    return confidencePriority[b.confidence] - confidencePriority[a.confidence];
  })[0];

  let alternativeCandidates = grouped.filter(
    (route) => route.pathSignature !== fastest.pathSignature,
  );

  if (routeUsesMetro(fastest)) {
    alternativeCandidates = alternativeCandidates.filter((route) => !routeUsesMetro(route));
  }

  const alternative = alternativeCandidates
    .sort((a, b) => {
      const aReasonBoost =
        (a.transferCount < fastest.transferCount ? 18 : 0) +
        (a.kind !== fastest.kind ? 14 : 0) +
        (a.totalCost !== undefined &&
        fastest.totalCost !== undefined &&
        a.totalCost < fastest.totalCost
          ? 16
          : 0) +
        (confidencePriority[a.confidence] > confidencePriority[fastest.confidence] ? 10 : 0);
      const bReasonBoost =
        (b.transferCount < fastest.transferCount ? 18 : 0) +
        (b.kind !== fastest.kind ? 14 : 0) +
        (b.totalCost !== undefined &&
        fastest.totalCost !== undefined &&
        b.totalCost < fastest.totalCost
          ? 16
          : 0) +
        (confidencePriority[b.confidence] > confidencePriority[fastest.confidence] ? 10 : 0);

      const aScore = routeScore(a, optimization) + aReasonBoost;
      const bScore = routeScore(b, optimization) + bReasonBoost;
      return bScore - aScore;
    })[0];

  const surfaced = [
    finalizeRoute({
      ...fastest,
      primaryReason: "Fastest total travel time",
      id: fastest.id,
    }),
  ];

  if (alternative) {
    surfaced.push(
      finalizeRoute({
        ...alternative,
        primaryReason: pickAlternativeReason(alternative, fastest),
        id: alternative.id,
      }),
    );
  }

  return surfaced.slice(0, 2);
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

function findClosestDirectBusCandidates(
  originLabels: string[],
  destinationCoordinates: [number, number],
) {
  const candidates: FallbackDirectBusCandidate[] = [];

  for (const route of dhakaBusSeedRoutes) {
    const boarding = findIndexOnRoute(route, originLabels);

    if (!boarding) {
      continue;
    }

    for (let alightingIndex = boarding.index + 1; alightingIndex < route.stopLabels.length; alightingIndex++) {
      const alightingLabel = route.stopLabels[alightingIndex];
      const alightingCoordinates = findBusStopCoordinates(alightingLabel);

      if (!alightingCoordinates) {
        continue;
      }

      candidates.push({
        leg: {
          route,
          boardingLabel: route.stopLabels[boarding.index],
          alightingLabel,
          stopCount: alightingIndex - boarding.index,
          serviceWindowText: buildServiceWindowText(route),
        },
        alightingCoordinates,
        remainingDistanceKm: haversineDistanceKm(alightingCoordinates, destinationCoordinates),
      });
    }
  }

  return candidates
    .sort((a, b) => {
      if (a.remainingDistanceKm !== b.remainingDistanceKm) {
        return a.remainingDistanceKm - b.remainingDistanceKm;
      }

      return a.leg.stopCount - b.leg.stopCount;
    })
    .slice(0, 6);
}

function findClosestTransferBusCandidates(
  originLabels: string[],
  destinationCoordinates: [number, number],
) {
  const candidates: FallbackTransferBusCandidate[] = [];

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

        if (secondTransfer < 0) {
          continue;
        }

        for (let secondAlightingIndex = secondTransfer + 1; secondAlightingIndex < secondRoute.stopLabels.length; secondAlightingIndex++) {
          const alightingLabel = secondRoute.stopLabels[secondAlightingIndex];
          const alightingCoordinates = findBusStopCoordinates(alightingLabel);

          if (!alightingCoordinates) {
            continue;
          }

          candidates.push({
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
              alightingLabel,
              stopCount: secondAlightingIndex - secondTransfer,
              serviceWindowText: buildServiceWindowText(secondRoute),
            },
            transferLabel,
            alightingCoordinates,
            remainingDistanceKm: haversineDistanceKm(alightingCoordinates, destinationCoordinates),
          });
        }
      }
    }
  }

  return candidates
    .sort((a, b) => {
      if (a.remainingDistanceKm !== b.remainingDistanceKm) {
        return a.remainingDistanceKm - b.remainingDistanceKm;
      }

      return (
        a.firstLeg.stopCount +
        a.secondLeg.stopCount -
        (b.firstLeg.stopCount + b.secondLeg.stopCount)
      );
    })
    .slice(0, 6);
}

function getMetroFare(originStationId: string, destinationStationId: string) {
  const origin = getMetroStationById(originStationId);
  const destination = getMetroStationById(destinationStationId);

  if (!origin || !destination) {
    return null;
  }

  return getDhakaMetroFareBdtBySequence(origin.sequence, destination.sequence);
}

function createDirectBusRoute(
  leg: BusLeg,
  originResolution: ResolvedTransitInput,
  originPoint: TransitPoint,
  destinationResolution: ResolvedTransitInput,
  destinationPoint: TransitPoint,
) {
  const busName = getBusDisplayName(leg.route);
  const busDistanceKm = estimateBusLegDistanceKm(leg);
  const busDurationMinutes = estimateBusDurationMinutes(busDistanceKm, leg.stopCount);
  const busFare = estimateBusFareBdt(busDistanceKm, leg.stopCount);
  const originAccess = createAccessLeg(originResolution, originPoint, "origin");
  const destinationAccess = createAccessLeg(destinationResolution, destinationPoint, "destination");
  const metrics = combineRouteMetrics([
    accessLegMetrics(originAccess),
    {
      distanceKm: busDistanceKm,
      durationMinutes: busDurationMinutes,
      costBdt: busFare,
    },
    accessLegMetrics(destinationAccess),
  ]);

  return finalizeRoute({
    id: `${leg.route.id}-${normalizeTransitText(leg.boardingLabel)}-${normalizeTransitText(leg.alightingLabel)}`,
    kind: "bus_direct",
    confidence: "verified",
    summary: `${busName} direct`,
    fareType: "advisory",
    fareText: formatRouteTotal(metrics.totalCost),
    totalCost: metrics.totalCost,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    serviceWindowText: leg.serviceWindowText,
    stopCount: leg.stopCount,
    stationCount: undefined,
    transferCount: 0,
    boarding: makeStopReference(leg.boardingLabel),
    alighting: makeStopReference(leg.alightingLabel),
    transferStops: [],
    serviceLabels: [busName],
    primaryServiceLabel: busName,
    primaryReason: undefined,
    segments: [
      ...(originAccess ? [buildAccessSegment(originAccess)] : []),
      {
        mode: "bus",
        instruction: `Board ${busName}`,
        startLocation: leg.boardingLabel,
        endLocation: leg.alightingLabel,
        note: "Verified from the Dhaka bus stop-order dataset. Fare and travel time are estimated from route length and stop count.",
        serviceWindowText: leg.serviceWindowText,
        fareText: formatApproxFare(busFare),
        estimatedDistanceKm: roundDistanceKm(busDistanceKm),
        estimatedDurationMinutes: busDurationMinutes,
        stopCount: leg.stopCount,
      },
      ...(destinationAccess ? [buildAccessSegment(destinationAccess)] : []),
    ],
    mapPreview: buildMapPreview(leg.boardingLabel, leg.alightingLabel),
    advisories: createRouteAdvisories(
      originPoint,
      destinationPoint,
      originAccess,
      destinationAccess,
    ),
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
  const firstBusName = getBusDisplayName(transfer.firstLeg.route);
  const secondBusName = getBusDisplayName(transfer.secondLeg.route);
  const firstDistanceKm = estimateBusLegDistanceKm(transfer.firstLeg);
  const secondDistanceKm = estimateBusLegDistanceKm(transfer.secondLeg);
  const firstFare = estimateBusFareBdt(firstDistanceKm, transfer.firstLeg.stopCount);
  const secondFare = estimateBusFareBdt(secondDistanceKm, transfer.secondLeg.stopCount);
  const firstDurationMinutes = estimateBusDurationMinutes(firstDistanceKm, transfer.firstLeg.stopCount);
  const secondDurationMinutes = estimateBusDurationMinutes(secondDistanceKm, transfer.secondLeg.stopCount);
  const originAccess = createAccessLeg(originResolution, originPoint, "origin");
  const destinationAccess = createAccessLeg(destinationResolution, destinationPoint, "destination");
  const metrics = combineRouteMetrics([
    accessLegMetrics(originAccess),
    {
      distanceKm: firstDistanceKm,
      durationMinutes: firstDurationMinutes,
      costBdt: firstFare,
    },
    {
      distanceKm: secondDistanceKm,
      durationMinutes: secondDurationMinutes,
      costBdt: secondFare,
    },
    { durationMinutes: TRANSFER_BUFFER_MINUTES },
    accessLegMetrics(destinationAccess),
  ]);

  return finalizeRoute({
    id: `${transfer.firstLeg.route.id}-${transfer.secondLeg.route.id}-${normalizeTransitText(transfer.transferLabel)}`,
    kind: "bus_transfer",
    confidence: "verified",
    summary: `${firstBusName} -> ${secondBusName}`,
    fareType: "advisory",
    fareText: formatRouteTotal(metrics.totalCost),
    totalCost: metrics.totalCost,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    serviceWindowText:
      `${firstBusName}: ${transfer.firstLeg.serviceWindowText ?? "N/A"} | ` +
      `${secondBusName}: ${transfer.secondLeg.serviceWindowText ?? "N/A"}`,
    stopCount: transfer.firstLeg.stopCount + transfer.secondLeg.stopCount,
    stationCount: undefined,
    transferCount: 1,
    boarding: makeStopReference(transfer.firstLeg.boardingLabel),
    alighting: makeStopReference(transfer.secondLeg.alightingLabel),
    transferStops: [makeStopReference(transfer.transferLabel, "hub")],
    serviceLabels: [firstBusName, secondBusName],
    primaryServiceLabel: firstBusName,
    primaryReason: undefined,
    segments: [
      ...(originAccess ? [buildAccessSegment(originAccess)] : []),
      {
        mode: "bus",
        instruction: `Board ${firstBusName}`,
        startLocation: transfer.firstLeg.boardingLabel,
        endLocation: transfer.transferLabel,
        note: "First bus segment with estimated fare and travel time.",
        serviceWindowText: transfer.firstLeg.serviceWindowText,
        fareText: formatApproxFare(firstFare),
        estimatedDistanceKm: roundDistanceKm(firstDistanceKm),
        estimatedDurationMinutes: firstDurationMinutes,
        stopCount: transfer.firstLeg.stopCount,
      },
      {
        mode: "walk",
        instruction: "Change buses",
        startLocation: transfer.transferLabel,
        endLocation: transfer.transferLabel,
        note: "Transfer at a shared bus stop or hub.",
        estimatedDurationMinutes: TRANSFER_BUFFER_MINUTES,
      },
      {
        mode: "bus",
        instruction: `Board ${secondBusName}`,
        startLocation: transfer.transferLabel,
        endLocation: transfer.secondLeg.alightingLabel,
        note: "Second bus segment with estimated fare and travel time.",
        serviceWindowText: transfer.secondLeg.serviceWindowText,
        fareText: formatApproxFare(secondFare),
        estimatedDistanceKm: roundDistanceKm(secondDistanceKm),
        estimatedDurationMinutes: secondDurationMinutes,
        stopCount: transfer.secondLeg.stopCount,
      },
      ...(destinationAccess ? [buildAccessSegment(destinationAccess)] : []),
    ],
    mapPreview: buildMapPreview(
      transfer.firstLeg.boardingLabel,
      transfer.secondLeg.alightingLabel,
    ),
    advisories: createRouteAdvisories(
      originPoint,
      destinationPoint,
      originAccess,
      destinationAccess,
    ),
  });
}

function createFallbackDirectBusRoute(
  candidate: FallbackDirectBusCandidate,
  originResolution: ResolvedTransitInput,
  originPoint: TransitPoint,
  destinationResolution: ResolvedTransitInput,
) {
  const busName = getBusDisplayName(candidate.leg.route);
  const busDistanceKm = estimateBusLegDistanceKm(candidate.leg);
  const busFare = estimateBusFareBdt(busDistanceKm, candidate.leg.stopCount);
  const busDurationMinutes = estimateBusDurationMinutes(busDistanceKm, candidate.leg.stopCount);
  const originAccess = createAccessLeg(originResolution, originPoint, "origin");
  const destinationAccess = createConnectorLegBetween(
    candidate.leg.alightingLabel,
    candidate.alightingCoordinates,
    destinationResolution.displayName,
    destinationResolution.place?.coordinates,
    "prefer_rickshaw",
  );
  const metrics = combineRouteMetrics([
    accessLegMetrics(originAccess),
    {
      distanceKm: busDistanceKm,
      durationMinutes: busDurationMinutes,
      costBdt: busFare,
    },
    accessLegMetrics(destinationAccess),
  ]);

  return finalizeRoute({
    id: `${candidate.leg.route.id}-${normalizeTransitText(candidate.leg.boardingLabel)}-${normalizeTransitText(candidate.leg.alightingLabel)}-fallback`,
    kind: "bus_direct",
    confidence: "advisory",
    summary: `${busName} close match`,
    fareType: "advisory",
    fareText: formatRouteTotal(metrics.totalCost),
    totalCost: metrics.totalCost,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    serviceWindowText: candidate.leg.serviceWindowText,
    stopCount: candidate.leg.stopCount,
    stationCount: undefined,
    transferCount: 0,
    boarding: makeStopReference(candidate.leg.boardingLabel),
    alighting: makeStopReference(candidate.leg.alightingLabel),
    transferStops: [],
    serviceLabels: [busName],
    primaryServiceLabel: busName,
    primaryReason: undefined,
    segments: [
      ...(originAccess ? [buildAccessSegment(originAccess)] : []),
      {
        mode: "bus",
        instruction: `Board ${busName}`,
        startLocation: candidate.leg.boardingLabel,
        endLocation: candidate.leg.alightingLabel,
        note: "Verified bus corridor to the closest matched stop. Fare and travel time are estimated from route length and stop count.",
        serviceWindowText: candidate.leg.serviceWindowText,
        fareText: formatApproxFare(busFare),
        estimatedDistanceKm: roundDistanceKm(busDistanceKm),
        estimatedDurationMinutes: busDurationMinutes,
        stopCount: candidate.leg.stopCount,
      },
      ...(destinationAccess ? [buildAccessSegment(destinationAccess)] : []),
    ],
    mapPreview: buildMapPreview(candidate.leg.boardingLabel, candidate.leg.alightingLabel),
    advisories: dedupeStrings([
      ...originPoint.advisories,
      originAccess?.connectorType === "advisory" ? originAccess.note : "",
      destinationAccess?.note ?? "",
      `Continue from ${candidate.leg.alightingLabel} to ${destinationResolution.displayName} by rickshaw.`,
    ]),
  });
}

function createFallbackTransferBusRoute(
  candidate: FallbackTransferBusCandidate,
  originResolution: ResolvedTransitInput,
  originPoint: TransitPoint,
  destinationResolution: ResolvedTransitInput,
) {
  const firstBusName = getBusDisplayName(candidate.firstLeg.route);
  const secondBusName = getBusDisplayName(candidate.secondLeg.route);
  const firstDistanceKm = estimateBusLegDistanceKm(candidate.firstLeg);
  const secondDistanceKm = estimateBusLegDistanceKm(candidate.secondLeg);
  const firstFare = estimateBusFareBdt(firstDistanceKm, candidate.firstLeg.stopCount);
  const secondFare = estimateBusFareBdt(secondDistanceKm, candidate.secondLeg.stopCount);
  const firstDurationMinutes = estimateBusDurationMinutes(firstDistanceKm, candidate.firstLeg.stopCount);
  const secondDurationMinutes = estimateBusDurationMinutes(secondDistanceKm, candidate.secondLeg.stopCount);
  const originAccess = createAccessLeg(originResolution, originPoint, "origin");
  const destinationAccess = createConnectorLegBetween(
    candidate.secondLeg.alightingLabel,
    candidate.alightingCoordinates,
    destinationResolution.displayName,
    destinationResolution.place?.coordinates,
    "prefer_rickshaw",
  );
  const metrics = combineRouteMetrics([
    accessLegMetrics(originAccess),
    {
      distanceKm: firstDistanceKm,
      durationMinutes: firstDurationMinutes,
      costBdt: firstFare,
    },
    {
      distanceKm: secondDistanceKm,
      durationMinutes: secondDurationMinutes,
      costBdt: secondFare,
    },
    { durationMinutes: TRANSFER_BUFFER_MINUTES },
    accessLegMetrics(destinationAccess),
  ]);

  return finalizeRoute({
    id: `${candidate.firstLeg.route.id}-${candidate.secondLeg.route.id}-${normalizeTransitText(candidate.transferLabel)}-fallback`,
    kind: "bus_transfer",
    confidence: "advisory",
    summary: `${firstBusName} -> ${secondBusName}`,
    fareType: "advisory",
    fareText: formatRouteTotal(metrics.totalCost),
    totalCost: metrics.totalCost,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    serviceWindowText:
      `${firstBusName}: ${candidate.firstLeg.serviceWindowText ?? "N/A"} | ` +
      `${secondBusName}: ${candidate.secondLeg.serviceWindowText ?? "N/A"}`,
    stopCount: candidate.firstLeg.stopCount + candidate.secondLeg.stopCount,
    stationCount: undefined,
    transferCount: 1,
    boarding: makeStopReference(candidate.firstLeg.boardingLabel),
    alighting: makeStopReference(candidate.secondLeg.alightingLabel),
    transferStops: [makeStopReference(candidate.transferLabel, "hub")],
    serviceLabels: [firstBusName, secondBusName],
    primaryServiceLabel: firstBusName,
    primaryReason: undefined,
    segments: [
      ...(originAccess ? [buildAccessSegment(originAccess)] : []),
      {
        mode: "bus",
        instruction: `Board ${firstBusName}`,
        startLocation: candidate.firstLeg.boardingLabel,
        endLocation: candidate.transferLabel,
        note: "First bus corridor on the closest available path.",
        serviceWindowText: candidate.firstLeg.serviceWindowText,
        fareText: formatApproxFare(firstFare),
        estimatedDistanceKm: roundDistanceKm(firstDistanceKm),
        estimatedDurationMinutes: firstDurationMinutes,
        stopCount: candidate.firstLeg.stopCount,
      },
      {
        mode: "walk",
        instruction: "Change buses",
        startLocation: candidate.transferLabel,
        endLocation: candidate.transferLabel,
        note: "Short transfer between bus services.",
        estimatedDurationMinutes: TRANSFER_BUFFER_MINUTES,
      },
      {
        mode: "bus",
        instruction: `Then board ${secondBusName}`,
        startLocation: candidate.transferLabel,
        endLocation: candidate.secondLeg.alightingLabel,
        note: "Second bus corridor bringing you closest to the destination.",
        serviceWindowText: candidate.secondLeg.serviceWindowText,
        fareText: formatApproxFare(secondFare),
        estimatedDistanceKm: roundDistanceKm(secondDistanceKm),
        estimatedDurationMinutes: secondDurationMinutes,
        stopCount: candidate.secondLeg.stopCount,
      },
      ...(destinationAccess ? [buildAccessSegment(destinationAccess)] : []),
    ],
    mapPreview: buildMapPreview(candidate.firstLeg.boardingLabel, candidate.secondLeg.alightingLabel),
    advisories: dedupeStrings([
      ...originPoint.advisories,
      originAccess?.connectorType === "advisory" ? originAccess.note : "",
      destinationAccess?.note ?? "",
      `Continue from ${candidate.secondLeg.alightingLabel} to ${destinationResolution.displayName} by rickshaw.`,
    ]),
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
  const metroDistanceKm = estimateMetroDistanceKm(originStation.id, destinationStation.id, stationCount);
  const metroDurationMinutes = estimateMetroDurationMinutes(metroDistanceKm, stationCount);
  const originAccess = createAccessLeg(originResolution, originPoint, "origin");
  const destinationAccess = createAccessLeg(destinationResolution, destinationPoint, "destination");
  const metrics = combineRouteMetrics([
    accessLegMetrics(originAccess),
    {
      distanceKm: metroDistanceKm,
      durationMinutes: metroDurationMinutes,
      costBdt: fare ?? undefined,
    },
    accessLegMetrics(destinationAccess),
  ]);

  return finalizeRoute({
    id: `${originStation.id}-${destinationStation.id}`,
    kind: "metro_direct",
    confidence: "exact",
    summary: "Metro direct",
    fareType: "exact",
    fareText: formatRouteTotal(metrics.totalCost, "exact"),
    totalCost: metrics.totalCost,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    serviceWindowText: METRO_SERVICE_WINDOW_TEXT,
    stopCount: undefined,
    stationCount,
    transferCount: 0,
    boarding: makeMetroReference(originStation.id),
    alighting: makeMetroReference(destinationStation.id),
    transferStops: [],
    serviceLabels: ["MRT Line 6"],
    primaryServiceLabel: "MRT Line 6",
    primaryReason: undefined,
    segments: [
      ...(originAccess ? [buildAccessSegment(originAccess)] : []),
      {
        mode: "metro",
        instruction: "Ride Metro Rail Line 6",
        startLocation: originStation.name,
        endLocation: destinationStation.name,
        note: "Exact fare is taken from the official DMTCL chart, and travel time is calibrated from the published timetable.",
        serviceWindowText: METRO_SERVICE_WINDOW_TEXT,
        fareText: fare ? formatExactFare(fare) : undefined,
        estimatedDistanceKm: roundDistanceKm(metroDistanceKm),
        estimatedDurationMinutes: metroDurationMinutes,
        stationCount,
      },
      ...(destinationAccess ? [buildAccessSegment(destinationAccess)] : []),
    ],
    mapPreview: buildMapPreview(originStation.name, destinationStation.name),
    advisories: createRouteAdvisories(
      originPoint,
      destinationPoint,
      originAccess,
      destinationAccess,
    ),
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

  if (!interchangeStation || !destinationStation) {
    return null;
  }

  const stationCount = Math.abs(interchangeStation.sequence - destinationStation.sequence);

  if (stationCount <= 0) {
    return null;
  }

  const busName = getBusDisplayName(busLeg.route);
  const fare = getMetroFare(interchangeStationId, destinationStationId);
  const busDistanceKm = estimateBusLegDistanceKm(busLeg);
  const busFare = estimateBusFareBdt(busDistanceKm, busLeg.stopCount);
  const busDurationMinutes = estimateBusDurationMinutes(busDistanceKm, busLeg.stopCount);
  const metroDistanceKm = estimateMetroDistanceKm(interchangeStationId, destinationStationId, stationCount);
  const metroDurationMinutes = estimateMetroDurationMinutes(metroDistanceKm, stationCount);
  const originAccess = createAccessLeg(originResolution, originPoint, "origin");
  const destinationAccess = createAccessLeg(destinationResolution, destinationPoint, "destination");
  const metrics = combineRouteMetrics([
    accessLegMetrics(originAccess),
    {
      distanceKm: busDistanceKm,
      durationMinutes: busDurationMinutes,
      costBdt: busFare,
    },
    {
      distanceKm: metroDistanceKm,
      durationMinutes: metroDurationMinutes,
      costBdt: fare ?? undefined,
    },
    { durationMinutes: TRANSFER_BUFFER_MINUTES },
    accessLegMetrics(destinationAccess),
  ]);

  const segments: RouteSegment[] =
    direction === "bus_then_metro"
      ? [
          {
            mode: "bus",
            instruction: `Board ${busName}`,
            startLocation: busLeg.boardingLabel,
            endLocation: busLeg.alightingLabel,
            note: "Ride to a metro interchange hub. Bus fare and duration are estimated.",
            serviceWindowText: busLeg.serviceWindowText,
            fareText: formatApproxFare(busFare),
            estimatedDistanceKm: roundDistanceKm(busDistanceKm),
            estimatedDurationMinutes: busDurationMinutes,
            stopCount: busLeg.stopCount,
          },
          {
            mode: "walk",
            instruction: "Switch to metro",
            startLocation: interchangeStation.name,
            endLocation: interchangeStation.name,
            note: "Buffer time for station entry and platform transfer.",
            estimatedDurationMinutes: TRANSFER_BUFFER_MINUTES,
          },
          {
            mode: "metro",
            instruction: "Continue by Metro Rail Line 6",
            startLocation: interchangeStation.name,
            endLocation: destinationStation.name,
            note: "Metro fare is exact for the station pair.",
            serviceWindowText: METRO_SERVICE_WINDOW_TEXT,
            fareText: fare ? formatExactFare(fare) : undefined,
            estimatedDistanceKm: roundDistanceKm(metroDistanceKm),
            estimatedDurationMinutes: metroDurationMinutes,
            stationCount,
          },
        ]
      : [
          {
            mode: "metro",
            instruction: "Start with Metro Rail Line 6",
            startLocation: interchangeStation.name,
            endLocation: destinationStation.name,
            note: "Metro fare is exact for the station pair.",
            serviceWindowText: METRO_SERVICE_WINDOW_TEXT,
            fareText: fare ? formatExactFare(fare) : undefined,
            estimatedDistanceKm: roundDistanceKm(metroDistanceKm),
            estimatedDurationMinutes: metroDurationMinutes,
            stationCount,
          },
          {
            mode: "walk",
            instruction: "Exit the metro and transfer",
            startLocation: busLeg.boardingLabel,
            endLocation: busLeg.boardingLabel,
            note: "Buffer time between the station exit and bus boarding area.",
            estimatedDurationMinutes: TRANSFER_BUFFER_MINUTES,
          },
          {
            mode: "bus",
            instruction: `Then board ${busName}`,
            startLocation: busLeg.boardingLabel,
            endLocation: busLeg.alightingLabel,
            note: "Final bus segment after leaving the metro. Bus fare and duration are estimated.",
            serviceWindowText: busLeg.serviceWindowText,
            fareText: formatApproxFare(busFare),
            estimatedDistanceKm: roundDistanceKm(busDistanceKm),
            estimatedDurationMinutes: busDurationMinutes,
            stopCount: busLeg.stopCount,
          },
        ];

  return finalizeRoute({
    id: `${busLeg.route.id}-${interchangeStationId}-${destinationStationId}-${direction}`,
    kind: "bus_metro_hybrid",
    confidence: "verified",
    summary: `${busName} + Metro`,
    fareType: "advisory",
    fareText: formatRouteTotal(metrics.totalCost),
    totalCost: metrics.totalCost,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    serviceWindowText: joinServiceWindows([
      busLeg.serviceWindowText ? `${busName}: ${busLeg.serviceWindowText}` : undefined,
      `MRT Line 6: ${METRO_SERVICE_WINDOW_TEXT}`,
    ]),
    stopCount: busLeg.stopCount,
    stationCount,
    transferCount: 1,
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
    serviceLabels: [busName, "MRT Line 6"],
    primaryServiceLabel: busName,
    primaryReason: undefined,
    segments: [
      ...(originAccess ? [buildAccessSegment(originAccess)] : []),
      ...segments,
      ...(destinationAccess ? [buildAccessSegment(destinationAccess)] : []),
    ],
    mapPreview: buildMapPreview(
      direction === "bus_then_metro" ? busLeg.boardingLabel : interchangeStation.name,
      direction === "bus_then_metro" ? destinationStation.name : busLeg.alightingLabel,
    ),
    advisories: createRouteAdvisories(
      originPoint,
      destinationPoint,
      originAccess,
      destinationAccess,
    ),
  });
}

function createAdvisoryRoute(
  originResolution: ResolvedTransitInput,
  originPoint: TransitPoint,
  destinationResolution: ResolvedTransitInput,
  destinationPoint: TransitPoint,
) {
  const originAccess = createAccessLeg(originResolution, originPoint, "origin");
  const destinationAccess = createAccessLeg(destinationResolution, destinationPoint, "destination");
  const metrics = combineRouteMetrics([
    accessLegMetrics(originAccess),
    accessLegMetrics(destinationAccess),
  ]);

  return finalizeRoute({
    id: randomUUID(),
    kind: "advisory_connector",
    confidence: "advisory",
    summary: "Reach a major transit hub first",
    fareType: "advisory",
    fareText: metrics.totalCost !== undefined ? formatRouteTotal(metrics.totalCost) : "Fare varies",
    totalCost: metrics.totalCost,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    serviceWindowText: undefined,
    stopCount: undefined,
    stationCount: undefined,
    transferCount: 0,
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
    serviceLabels: [],
    primaryServiceLabel: undefined,
    primaryReason: undefined,
    segments: [
      ...(originAccess ? [buildAccessSegment(originAccess)] : []),
      {
        mode: "rickshaw",
        instruction: `Reach ${originPoint.name} first`,
        startLocation: originResolution.displayName,
        endLocation: originPoint.name,
        note: "No verified direct bus or metro route was found for this pair yet.",
        fareText: "Negotiated locally",
        connectorType: "advisory",
      },
      ...(destinationAccess ? [buildAccessSegment(destinationAccess)] : []),
    ],
    mapPreview: buildMapPreview(originPoint.name, destinationPoint.name),
    advisories: dedupeStrings([
      ...originPoint.advisories,
      ...destinationPoint.advisories,
      originAccess?.note ?? "",
      destinationAccess?.note ?? "",
      "Ask nearby drivers or local passengers for the best corridor option.",
    ]),
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

function collectFallbackBusRoutes(
  originResolution: ResolvedTransitInput,
  destinationResolution: ResolvedTransitInput,
) {
  const destinationCoordinates =
    destinationResolution.place?.coordinates ?? destinationResolution.candidates[0]?.coordinates;

  if (!destinationCoordinates) {
    return [];
  }

  const routes: RouteOption[] = [];

  for (const originPoint of originResolution.candidates) {
    if (!originPoint.busStopLabels.length) {
      continue;
    }

    const directCandidates = findClosestDirectBusCandidates(
      originPoint.busStopLabels,
      destinationCoordinates,
    );

    for (const candidate of directCandidates) {
      routes.push(
        createFallbackDirectBusRoute(
          candidate,
          originResolution,
          originPoint,
          destinationResolution,
        ),
      );
    }

    if (directCandidates.length) {
      continue;
    }

    for (const candidate of findClosestTransferBusCandidates(originPoint.busStopLabels, destinationCoordinates)) {
      routes.push(
        createFallbackTransferBusRoute(
          candidate,
          originResolution,
          originPoint,
          destinationResolution,
        ),
      );
    }
  }

  return routes;
}

export async function calculateRoutes(payload: CalculateRouteRequest) {
  const [originResolution, destinationResolution] = await Promise.all([
    resolveTransitInput(payload.origin),
    resolveTransitInput(payload.destination),
  ]);
  const tripMapPreview = buildTripMapPreview(
    payload.origin,
    payload.destination,
    originResolution,
    destinationResolution,
  );

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

  const allFoundRoutes = groupRoutesByPresentation(groupRoutesByPath(routes));
  const surfacedRoutes = surfaceRoutes(routes, payload.optimization);
  const fallbackCandidates =
    surfacedRoutes.length > 0
      ? []
      : collectFallbackBusRoutes(originResolution, destinationResolution);
  const allFoundFallbackRoutes =
    surfacedRoutes.length > 0
      ? []
      : groupRoutesByPresentation(groupRoutesByPath(fallbackCandidates));
  const fallbackRoutes =
    surfacedRoutes.length > 0 ? [] : surfaceRoutes(fallbackCandidates, payload.optimization);

  const finalRoutes =
    surfacedRoutes.length > 0
      ? surfacedRoutes
      : fallbackRoutes.length > 0
        ? fallbackRoutes
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
  const debugRoutes =
    surfacedRoutes.length > 0
      ? allFoundRoutes
      : fallbackRoutes.length > 0
        ? allFoundFallbackRoutes
        : [];

  return calculateRouteResponseSchema.parse({
    routes: applyTripMapPreview(finalRoutes, tripMapPreview),
    debugRoutes: applyTripMapPreview(debugRoutes, tripMapPreview),
    source: "deterministic",
  });
}
