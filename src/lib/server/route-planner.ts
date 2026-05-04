import { randomUUID } from "crypto";

import {
  dhakaBusSeedRoutes,
  dhakaBusSeedStops,
  getDhakaBusStopCoordinatesByLabel,
  type DhakaBusSeedRoute,
} from "@/lib/data/dhaka-bus-seed";
import { DHAKA_ACCESS_POINTS } from "@/lib/data/dhaka-access-points";
import {
  DHAKA_METRO_STATIONS,
  getDhakaMetroFareBdtBySequence,
} from "@/lib/data/dhaka-metro";
import {
  getBusStopPointByLabel,
  getMetroStationById,
  resolveTransitInput,
  type ResolvedTransitInput,
  type TransitPoint,
} from "@/lib/server/transit-resolver";
import { getRoadSnappedRouteGeometry } from "@/lib/server/geoapify-routing";
import {
  haversineDistanceKm,
  normalizeTransitText,
} from "@/lib/server/transit-support";
import {
  calculateRouteResponseSchema,
  routeOptionSchema,
  type ConnectorBurden,
  type ConnectorType,
  type CalculateRouteRequest,
  type DistanceSource,
  type PricingConfidence,
  type RouteConfidence,
  type RouteMapLine,
  type RouteMapPoint,
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
  costLowBdt?: number;
  costHighBdt?: number;
}

interface AccessLeg {
  connectorType: ConnectorType;
  mode: TransportMode;
  distanceKm: number;
  durationMinutes: number;
  costBdt?: number;
  costLowBdt?: number;
  costHighBdt?: number;
  startLocation: string;
  endLocation: string;
  note: string;
  pricingConfidence?: PricingConfidence;
  distanceSource?: DistanceSource;
}

interface ConnectorCandidate {
  point: TransitPoint;
  accessLeg: AccessLeg | null;
  score: number;
}

interface FallbackDirectBusCandidate {
  leg: BusLeg;
  alightingCoordinates: [number, number];
  remainingDistanceKm: number;
  busDistanceKm: number;
  progressDistanceKm?: number;
  progressShare?: number;
  directionScore: number;
}

interface FallbackTransferBusCandidate {
  firstLeg: BusLeg;
  secondLeg: BusLeg;
  transferLabel: string;
  alightingCoordinates: [number, number];
  remainingDistanceKm: number;
  busDistanceKm: number;
  progressDistanceKm?: number;
  progressShare?: number;
  directionScore: number;
}

const busStopCoordinateLookup = new Map(
  DHAKA_ACCESS_POINTS.flatMap((point) =>
    point.coordinates
      ? point.busStopLabels.map(
          (label) => [normalizeTransitText(label), point.coordinates] as const,
        )
      : [],
  ),
);

const preferredTransferLabels = new Set(
  [
    ...DHAKA_ACCESS_POINTS.flatMap((point) => point.busStopLabels),
    ...dhakaBusSeedStops
      .filter((stop) => stop.routeCount >= 4)
      .map((stop) => stop.label),
  ].map((label) => normalizeTransitText(label)),
);
const directBusLegCache = new Map<string, BusLeg[]>();
const transferBusLegCache = new Map<
  string,
  Array<{
    firstLeg: BusLeg;
    secondLeg: BusLeg;
    transferLabel: string;
  }>
>();

const ACCESS_WALK_MAX_KM = 0.8;
const ACCESS_RICKSHAW_MAX_KM = 3.5;
const LONG_RICKSHAW_MAX_KM = 6;
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
const BUS_FARE_PER_KM_BDT = 2.42;
const CANDIDATE_POOL_LIMIT = 20;
const SURFACED_CANDIDATE_LIMIT = 8;
const confidencePriority: Record<RouteConfidence, number> = {
  exact: 3,
  verified: 2,
  advisory: 1,
};

function roundDistanceKm(distanceKm: number) {
  return Math.round(distanceKm * 10) / 10;
}

function formatApproxFare(costBdt: number) {
  return `Approx. BDT ${Math.round(costBdt)}`;
}

function formatApproxFareRange(lowBdt: number, highBdt: number) {
  return lowBdt === highBdt
    ? `Approx. BDT ${Math.round(lowBdt)}`
    : `Approx. BDT ${Math.round(lowBdt)}-${Math.round(highBdt)}`;
}

function formatExactFare(costBdt: number) {
  return `BDT ${Math.round(costBdt)}`;
}

function formatRouteTotal(
  costBdt?: number,
  fareType: "exact" | "advisory" = "advisory",
  costLowBdt?: number,
  costHighBdt?: number,
) {
  if (costBdt === undefined) {
    return "Fare varies";
  }

  if (
    fareType !== "exact" &&
    costLowBdt !== undefined &&
    costHighBdt !== undefined
  ) {
    return formatApproxFareRange(costLowBdt, costHighBdt);
  }

  return fareType === "exact"
    ? formatExactFare(costBdt)
    : formatApproxFare(costBdt);
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function findBusStopCoordinates(label: string) {
  return (
    getDhakaBusStopCoordinatesByLabel(label) ??
    busStopCoordinateLookup.get(normalizeTransitText(label))
  );
}

function sumCoordinateDistanceKm(coordinates: [number, number][]) {
  return coordinates.reduce((distanceKm, coordinate, index) => {
    if (index === 0) {
      return distanceKm;
    }

    return (
      distanceKm + haversineDistanceKm(coordinates[index - 1]!, coordinate)
    );
  }, 0);
}

function findBusLegStopIndices(leg: BusLeg) {
  const boardingIndex = leg.route.stopLabels.findIndex(
    (stopLabel) =>
      normalizeTransitText(stopLabel) ===
      normalizeTransitText(leg.boardingLabel),
  );

  if (boardingIndex < 0) {
    return null;
  }

  const alightingOffset = leg.route.stopLabels
    .slice(boardingIndex + 1)
    .findIndex(
      (stopLabel) =>
        normalizeTransitText(stopLabel) ===
        normalizeTransitText(leg.alightingLabel),
    );

  if (alightingOffset < 0) {
    return null;
  }

  return {
    boardingIndex,
    alightingIndex: boardingIndex + alightingOffset + 1,
  };
}

function combineRouteMetrics(parts: RouteMetrics[]) {
  const totalDistanceKm = parts.reduce(
    (sum, part) => sum + (part.distanceKm ?? 0),
    0,
  );
  const totalDurationMinutes = parts.reduce(
    (sum, part) => sum + (part.durationMinutes ?? 0),
    0,
  );
  const costParts = parts.filter((part) => part.costBdt !== undefined);

  return {
    totalCost:
      costParts.length > 0
        ? costParts.reduce((sum, part) => sum + (part.costBdt ?? 0), 0)
        : undefined,
    costLowBdt:
      costParts.length > 0
        ? costParts.reduce(
            (sum, part) => sum + (part.costLowBdt ?? part.costBdt ?? 0),
            0,
          )
        : undefined,
    costHighBdt:
      costParts.length > 0
        ? costParts.reduce(
            (sum, part) => sum + (part.costHighBdt ?? part.costBdt ?? 0),
            0,
          )
        : undefined,
    estimatedDistanceKm:
      totalDistanceKm > 0 ? roundDistanceKm(totalDistanceKm) : undefined,
    estimatedDurationMinutes:
      totalDurationMinutes > 0 ? Math.round(totalDurationMinutes) : undefined,
  };
}

function isMatchedTransitPoint(
  resolution: ResolvedTransitInput,
  point: TransitPoint,
) {
  if (resolution.matchedPointIds.includes(point.id)) {
    return true;
  }

  if (
    point.variantId &&
    resolution.matchedPointIds.includes(point.variantId)
  ) {
    return true;
  }

  if (
    point.canonicalBusStopId &&
    resolution.matchedPointIds.includes(point.canonicalBusStopId)
  ) {
    return true;
  }

  if (
    point.metroStationId &&
    resolution.matchedPointIds.includes(point.metroStationId)
  ) {
    return true;
  }

  return false;
}

export function estimateRickshawFareBdt(distanceKm: number) {
  if (distanceKm <= 0) {
    return undefined;
  }

  if (distanceKm <= 0.5) {
    return 20;
  }

  return Math.ceil((20 + (distanceKm - 0.5) * 20) / 10) * 10;
}

function estimateRickshawFareRangeBdt(distanceKm: number) {
  const estimate = estimateRickshawFareBdt(distanceKm);

  if (estimate === undefined) {
    return {
      estimate: undefined,
      low: undefined,
      high: undefined,
    };
  }

  return {
    estimate,
    low: Math.max(20, estimate - 10),
    high: estimate + 10,
  };
}

function estimateExtendedRickshawFareBdt(distanceKm: number) {
  return estimateRickshawFareBdt(distanceKm);
}

function createAccessLeg(
  resolution: ResolvedTransitInput,
  point: TransitPoint,
  role: "origin" | "destination",
): AccessLeg | null {
  if (
    isMatchedTransitPoint(resolution, point) ||
    !resolution.place?.coordinates ||
    !point.coordinates
  ) {
    return null;
  }

  const distanceKm = haversineDistanceKm(
    resolution.place.coordinates,
    point.coordinates,
  );

  if (!Number.isFinite(distanceKm) || distanceKm <= 0.05) {
    return null;
  }

  if (distanceKm <= ACCESS_WALK_MAX_KM) {
    return {
      connectorType: "walk",
      mode: "walk",
      distanceKm,
      durationMinutes: Math.max(
        4,
        Math.round((distanceKm / WALK_SPEED_KMPH) * 60),
      ),
      startLocation: role === "origin" ? resolution.displayName : point.name,
      endLocation: role === "origin" ? point.name : resolution.displayName,
      distanceSource: "local_estimate",
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
      durationMinutes: Math.max(
        6,
        Math.round((distanceKm / RICKSHAW_SPEED_KMPH) * 60),
      ),
      costBdt: estimateRickshawFareBdt(distanceKm),
      costLowBdt: estimateRickshawFareRangeBdt(distanceKm).low,
      costHighBdt: estimateRickshawFareRangeBdt(distanceKm).high,
      startLocation: role === "origin" ? resolution.displayName : point.name,
      endLocation: role === "origin" ? point.name : resolution.displayName,
      pricingConfidence: "estimated",
      distanceSource: "local_estimate",
      note:
        role === "origin"
          ? `Rickshaw connector to ${point.name}.`
          : `Rickshaw connector from ${point.name}.`,
    };
  }

  if (distanceKm <= LONG_RICKSHAW_MAX_KM) {
    const fare = estimateRickshawFareRangeBdt(distanceKm);

    return {
      connectorType: "long_rickshaw",
      mode: "rickshaw",
      distanceKm,
      durationMinutes: Math.max(
        10,
        Math.round((distanceKm / RICKSHAW_SPEED_KMPH) * 60),
      ),
      costBdt: fare.estimate,
      costLowBdt: fare.low,
      costHighBdt: fare.high,
      startLocation: role === "origin" ? resolution.displayName : point.name,
      endLocation: role === "origin" ? point.name : resolution.displayName,
      pricingConfidence: "estimated",
      distanceSource: "local_estimate",
      note:
        role === "origin"
          ? `Long rickshaw connector to ${point.name}.`
          : `Long rickshaw connector from ${point.name}.`,
    };
  }

  return {
    connectorType: "advisory",
    mode: "ride_share",
    distanceKm,
    durationMinutes: Math.max(
      10,
      Math.round((distanceKm / ADVISORY_CONNECTOR_SPEED_KMPH) * 60),
    ),
    startLocation: role === "origin" ? resolution.displayName : point.name,
    endLocation: role === "origin" ? point.name : resolution.displayName,
    distanceSource: "local_estimate",
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
      durationMinutes: Math.max(
        4,
        Math.round((distanceKm / WALK_SPEED_KMPH) * 60),
      ),
      startLocation,
      endLocation,
      distanceSource: "local_estimate",
      note: `Short walking connector from ${startLocation} to ${endLocation}.`,
    };
  }

  const fare = estimateRickshawFareRangeBdt(distanceKm);

  return {
    connectorType:
      distanceKm <= ACCESS_RICKSHAW_MAX_KM ? "rickshaw" : "long_rickshaw",
    mode: "rickshaw",
    distanceKm,
    durationMinutes: Math.max(
      6,
      Math.round((distanceKm / RICKSHAW_SPEED_KMPH) * 60),
    ),
    costBdt: estimateExtendedRickshawFareBdt(distanceKm),
    costLowBdt: fare.low,
    costHighBdt: fare.high,
    startLocation,
    endLocation,
    pricingConfidence: "estimated",
    distanceSource: "local_estimate",
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
    costLowBdt: leg.costLowBdt,
    costHighBdt: leg.costHighBdt,
  };
}

function buildAccessSegment(leg: AccessLeg): RouteSegment {
  const fareText =
    leg.mode === "rickshaw" && leg.costBdt !== undefined
      ? leg.costLowBdt !== undefined && leg.costHighBdt !== undefined
        ? formatApproxFareRange(leg.costLowBdt, leg.costHighBdt)
        : formatApproxFare(leg.costBdt)
      : undefined;

  const instruction =
    leg.connectorType === "walk"
      ? "Walk connector"
      : leg.connectorType === "rickshaw"
        ? "Rickshaw connector"
        : leg.connectorType === "long_rickshaw"
          ? "Long rickshaw connector"
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
    distanceSource: leg.distanceSource,
    pricingConfidence: leg.pricingConfidence,
    costLowBdt: leg.costLowBdt,
    costHighBdt: leg.costHighBdt,
  };
}

function estimateBusOperationalDistanceKm(leg: BusLeg) {
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

function isReasonableBusAnchorEstimate(
  estimatedDistanceKm: number,
  anchorDistancesKm: number[],
  directDistanceKm: number | undefined,
  stopCount: number,
) {
  if (!Number.isFinite(estimatedDistanceKm) || estimatedDistanceKm <= 0) {
    return false;
  }

  const maxAnchorGapKm = anchorDistancesKm.length
    ? Math.max(...anchorDistancesKm)
    : 0;
  const maxReasonableGapKm =
    directDistanceKm !== undefined
      ? Math.max(6, directDistanceKm * 0.75)
      : 8;

  if (maxAnchorGapKm > maxReasonableGapKm) {
    return false;
  }

  const maxReasonableDistanceKm =
    directDistanceKm !== undefined
      ? Math.max(
          directDistanceKm * 2.4,
          stopCount * 1.8,
          directDistanceKm + 6,
        )
      : Math.max(stopCount * 1.8, 10);

  return estimatedDistanceKm <= maxReasonableDistanceKm;
}

export function estimateBusLegDistanceKm(leg: BusLeg) {
  const legIndices = findBusLegStopIndices(leg);
  const boardingCoordinates = findBusStopCoordinates(leg.boardingLabel);
  const alightingCoordinates = findBusStopCoordinates(leg.alightingLabel);
  const directDistanceKm =
    boardingCoordinates && alightingCoordinates
      ? haversineDistanceKm(boardingCoordinates, alightingCoordinates)
      : undefined;

  if (legIndices) {
    const knownAnchors = leg.route.stopLabels
      .slice(legIndices.boardingIndex, legIndices.alightingIndex + 1)
      .map((stopLabel, offset) => {
        const coordinates = findBusStopCoordinates(stopLabel);

        return coordinates
          ? {
              index: legIndices.boardingIndex + offset,
              coordinates,
            }
          : null;
      })
      .filter(
        (anchor): anchor is { index: number; coordinates: [number, number] } =>
          anchor !== null,
      );

    if (knownAnchors.length >= 2) {
      const anchorStepDistancesKm = knownAnchors
        .slice(1)
        .map((anchor, index) =>
          haversineDistanceKm(
            knownAnchors[index]!.coordinates,
            anchor.coordinates,
          ),
        );
      const anchorDistanceKm = sumCoordinateDistanceKm(
        knownAnchors.map((anchor) => anchor.coordinates),
      );
      const coveredIntervals =
        knownAnchors[knownAnchors.length - 1]!.index - knownAnchors[0]!.index;

      if (coveredIntervals > 0) {
        const corridorAdjustment = knownAnchors.length > 2 ? 1.08 : 1.2;
        const averageIntervalDistanceKm =
          (anchorDistanceKm * corridorAdjustment) / coveredIntervals;
        const estimatedDistanceKm = Math.max(
          1.5,
          averageIntervalDistanceKm * leg.stopCount,
        );

        if (
          isReasonableBusAnchorEstimate(
            estimatedDistanceKm,
            anchorStepDistancesKm,
            directDistanceKm,
            leg.stopCount,
          )
        ) {
          return estimatedDistanceKm;
        }
      }
    }
  }

  return estimateBusOperationalDistanceKm(leg);
}

function estimateMetroOperationalDistanceKm(
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

export function estimateMetroDistanceKm(
  originStationId: string,
  destinationStationId: string,
  stationCount: number,
) {
  const origin = getMetroStationById(originStationId);
  const destination = getMetroStationById(destinationStationId);

  if (origin && destination) {
    const startSequence = Math.min(origin.sequence, destination.sequence);
    const endSequence = Math.max(origin.sequence, destination.sequence);
    const stationPath = DHAKA_METRO_STATIONS.filter(
      (station) =>
        station.sequence >= startSequence && station.sequence <= endSequence,
    )
      .sort((a, b) => a.sequence - b.sequence)
      .map((station) => station.coordinates)
      .filter(
        (coordinates): coordinates is [number, number] =>
          coordinates !== undefined,
      );

    if (stationPath.length >= 2) {
      return Math.max(1.2, sumCoordinateDistanceKm(stationPath));
    }
  }

  return estimateMetroOperationalDistanceKm(
    originStationId,
    destinationStationId,
    stationCount,
  );
}

function estimateBusFareBdt(distanceKm: number, stopCount: number) {
  const effectiveDistanceKm = Math.max(
    distanceKm,
    stopCount * BUS_STOP_SPACING_KM,
  );

  return Math.max(10, Math.ceil(effectiveDistanceKm * BUS_FARE_PER_KM_BDT));
}

function estimateBusDurationMinutes(distanceKm: number, stopCount: number) {
  const runningMinutes = (distanceKm / BUS_SPEED_KMPH) * 60;
  const dwellMinutes = stopCount * BUS_STOP_DELAY_MINUTES;

  return Math.max(10, Math.round(runningMinutes + dwellMinutes + 5));
}

function estimateMetroDurationMinutes(
  distanceKm: number,
  stationCount: number,
) {
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

  return (
    [route.openingTimeText, route.closingTimeText]
      .filter(Boolean)
      .join(" - ") || undefined
  );
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
    points: [],
    lines: [],
  };
}

function findMetroStationByLabel(label: string) {
  const normalizedLabel = normalizeTransitText(label);

  return DHAKA_METRO_STATIONS.find((station) =>
    [station.name, ...station.aliases].some(
      (value) => normalizeTransitText(value) === normalizedLabel,
    ),
  );
}

function dedupeAdjacentCoordinates(coordinates: [number, number][]) {
  return coordinates.filter((coordinate, index) => {
    const previous = coordinates[index - 1];

    return !previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1];
  });
}

function findBusSegmentCoordinates(startLabel: string, endLabel: string) {
  return findBusSegmentStops(startLabel, endLabel)?.map((stop) => stop.coordinates);
}

function findBusSegmentStops(startLabel: string, endLabel: string) {
  const normalizedStart = normalizeTransitText(startLabel);
  const normalizedEnd = normalizeTransitText(endLabel);
  const candidates = dhakaBusSeedRoutes.flatMap((route) => {
    const startIndex = route.stopLabels.findIndex(
      (label) => normalizeTransitText(label) === normalizedStart,
    );

    if (startIndex < 0) {
      return [];
    }

    const endOffset = route.stopLabels
      .slice(startIndex + 1)
      .findIndex((label) => normalizeTransitText(label) === normalizedEnd);

    if (endOffset < 0) {
      return [];
    }

    const stopLabels = route.stopLabels.slice(startIndex, startIndex + endOffset + 2);
    const stops = stopLabels.flatMap((label) => {
      const coordinates = findBusStopCoordinates(label);

      return coordinates ? [{ label, coordinates }] : [];
    });
    const coordinates = dedupeAdjacentCoordinates(stops.map((stop) => stop.coordinates));

    return coordinates.length >= 2
      ? [{ stops, coordinates, stopCount: stopLabels.length }]
      : [];
  });

  return candidates.sort((a, b) => a.stopCount - b.stopCount)[0]?.stops;
}

function findMetroSegmentCoordinates(startLabel: string, endLabel: string) {
  const startStation = findMetroStationByLabel(startLabel);
  const endStation = findMetroStationByLabel(endLabel);

  if (!startStation || !endStation) {
    return undefined;
  }

  const startSequence = Math.min(startStation.sequence, endStation.sequence);
  const endSequence = Math.max(startStation.sequence, endStation.sequence);
  const coordinates = DHAKA_METRO_STATIONS.filter(
    (station) => station.sequence >= startSequence && station.sequence <= endSequence,
  )
    .sort((a, b) =>
      startStation.sequence <= endStation.sequence
        ? a.sequence - b.sequence
        : b.sequence - a.sequence,
    )
    .map((station) => station.coordinates)
    .filter(
      (coordinates): coordinates is [number, number] => coordinates !== undefined,
    );

  return coordinates.length >= 2 ? dedupeAdjacentCoordinates(coordinates) : undefined;
}

function findRouteLabelCoordinates(
  label: string,
  route: RouteOption,
  preview: RouteMapPreview,
) {
  const normalizedLabel = normalizeTransitText(label);
  const knownPoints: Array<{ label: string; coordinates?: [number, number] }> = [
    { label: preview.originLabel, coordinates: preview.originCoordinates },
    { label: preview.destinationLabel, coordinates: preview.destinationCoordinates },
    { label: route.boarding.label, coordinates: route.boarding.coordinates },
    { label: route.boarding.canonicalLabel ?? "", coordinates: route.boarding.coordinates },
    { label: route.alighting.label, coordinates: route.alighting.coordinates },
    { label: route.alighting.canonicalLabel ?? "", coordinates: route.alighting.coordinates },
    ...route.transferStops.flatMap((stop) => [
      { label: stop.label, coordinates: stop.coordinates },
      { label: stop.canonicalLabel ?? "", coordinates: stop.coordinates },
    ]),
  ];

  return knownPoints.find(
    (point) => point.coordinates && normalizeTransitText(point.label) === normalizedLabel,
  )?.coordinates;
}

async function createRouteMapLine(
  route: RouteOption,
  preview: RouteMapPreview,
  segment: RouteSegment,
  snapRoads: boolean,
): Promise<RouteMapLine | null> {
  const start = findRouteLabelCoordinates(segment.startLocation, route, preview);
  const end = findRouteLabelCoordinates(segment.endLocation, route, preview);
  const fallbackCoordinates = start && end ? dedupeAdjacentCoordinates([start, end]) : [];
  const localCoordinates =
    segment.mode === "bus"
      ? findBusSegmentCoordinates(segment.startLocation, segment.endLocation) ??
        fallbackCoordinates
      : segment.mode === "metro"
        ? findMetroSegmentCoordinates(segment.startLocation, segment.endLocation) ??
          fallbackCoordinates
        : fallbackCoordinates;
  const snappedCoordinates =
    !snapRoads || segment.mode === "metro"
      ? null
      : await getRoadSnappedRouteGeometry(segment.mode, localCoordinates);
  const coordinates = snappedCoordinates ?? localCoordinates;

  if (coordinates.length < 2) {
    return null;
  }

  return {
    mode: segment.mode,
    label: segment.instruction,
    coordinates,
    confidence: segment.mode === "metro" || snappedCoordinates ? "exact" : "estimated",
  } satisfies RouteMapLine;
}

async function buildRouteMapGeometry(
  route: RouteOption,
  preview: RouteMapPreview,
  snapRoads: boolean,
): Promise<{ points: RouteMapPoint[]; lines: RouteMapLine[] }> {
  const intermediateBusStops = route.segments.flatMap((segment) => {
    if (segment.mode !== "bus") {
      return [];
    }

    return (
      findBusSegmentStops(segment.startLocation, segment.endLocation)
        ?.slice(1, -1)
        .map((stop) => ({
          label: stop.label,
          coordinates: stop.coordinates,
          role: "stop" as const,
        })) ?? []
    );
  });
  const pointCandidates: Array<RouteMapPoint | null> = [
    preview.originCoordinates
      ? {
          label: preview.originLabel,
          coordinates: preview.originCoordinates,
          role: "origin",
        }
      : null,
    preview.destinationCoordinates
      ? {
          label: preview.destinationLabel,
          coordinates: preview.destinationCoordinates,
          role: "destination",
        }
      : null,
    route.boarding.coordinates
      ? {
          label: route.boarding.label,
          coordinates: route.boarding.coordinates,
          role: "boarding",
        }
      : null,
    route.alighting.coordinates
      ? {
          label: route.alighting.label,
          coordinates: route.alighting.coordinates,
          role: "alighting",
        }
      : null,
    ...route.transferStops.map((stop) =>
      stop.coordinates
        ? {
            label: stop.label,
            coordinates: stop.coordinates,
            role: "transfer" as const,
          }
        : null,
    ),
    ...intermediateBusStops,
  ];
  const seenPoints = new Set<string>();
  const points = pointCandidates.filter((point): point is RouteMapPoint => {
    if (!point) {
      return false;
    }

    const key = `${point.role}:${point.coordinates[0]}:${point.coordinates[1]}`;
    if (seenPoints.has(key)) {
      return false;
    }

    seenPoints.add(key);
    return true;
  });
  const lines = (
    await Promise.all(
      route.segments.map((segment) =>
        createRouteMapLine(route, preview, segment, snapRoads),
      ),
    )
  ).filter((line): line is RouteMapLine => line !== null);

  return {
    points,
    lines,
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
    points: [],
    lines: [],
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
      label: busStop.name,
      type: "bus_stop",
      variantId: busStop.variantId,
      canonicalId: busStop.canonicalBusStopId ?? busStop.id,
      canonicalLabel: busStop.canonicalBusStopLabel ?? label,
      coordinates: busStop.coordinates,
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
    canonicalId: station?.id ?? stationId,
    canonicalLabel: station?.name ?? stationId,
    coordinates: station?.coordinates,
  };
}

function makePointReference(point: TransitPoint): RouteStopReference {
  if (point.type === "metro_station" && point.metroStationId) {
    return {
      id: point.id,
      label: point.name,
      type: point.type,
      canonicalId: point.metroStationId,
      canonicalLabel: point.name,
      coordinates: point.coordinates,
    };
  }

  return {
    id: point.id,
    label: point.name,
    type: point.type,
    variantId: point.variantId,
    canonicalId: point.canonicalBusStopId ?? point.id,
    canonicalLabel: point.canonicalBusStopLabel ?? point.name,
    coordinates: point.coordinates,
  };
}

function pointSupportsBusLabel(point: TransitPoint, label: string) {
  return point.busStopLabels.some(
    (stopLabel) =>
      normalizeTransitText(stopLabel) === normalizeTransitText(label),
  );
}

function makeBusReferenceForPoint(point: TransitPoint, label: string) {
  return pointSupportsBusLabel(point, label)
    ? makePointReference(point)
    : makeStopReference(label);
}

function compareConnectorCandidates(
  left: ConnectorCandidate,
  right: ConnectorCandidate,
) {
  if (left.score !== right.score) {
    return left.score - right.score;
  }

  const leftDistance = left.accessLeg?.distanceKm ?? 0;
  const rightDistance = right.accessLeg?.distanceKm ?? 0;

  if (leftDistance !== rightDistance) {
    return leftDistance - rightDistance;
  }

  return left.point.name.localeCompare(right.point.name);
}

function connectorCandidateScore(accessLeg: AccessLeg | null) {
  if (!accessLeg) {
    return 0;
  }

  const distancePenalty = accessLeg.distanceKm;

  switch (accessLeg.connectorType) {
    case "walk":
      return distancePenalty * 2 + accessLeg.durationMinutes / 3;
    case "rickshaw":
      return 8 + distancePenalty * 3 + accessLeg.durationMinutes / 2;
    case "long_rickshaw":
      return 26 + distancePenalty * 5 + accessLeg.durationMinutes;
    default:
      return 60 + distancePenalty * 8 + accessLeg.durationMinutes;
  }
}

function addUniqueConnectorCandidate(
  target: ConnectorCandidate[],
  seen: Set<string>,
  candidate?: ConnectorCandidate,
) {
  if (!candidate || seen.has(candidate.point.id)) {
    return;
  }

  seen.add(candidate.point.id);
  target.push(candidate);
}

function selectDiverseConnectorCandidates(
  candidates: ConnectorCandidate[],
  limit: number,
) {
  const sorted = [...candidates].sort(compareConnectorCandidates);
  const selected: ConnectorCandidate[] = [];
  const seen = new Set<string>();

  addUniqueConnectorCandidate(selected, seen, sorted.find((candidate) => candidate.point.type === "metro_station"));
  addUniqueConnectorCandidate(selected, seen, sorted.find((candidate) => candidate.point.type === "bus_stop"));
  addUniqueConnectorCandidate(selected, seen, sorted.find((candidate) => candidate.point.type === "hub"));

  for (const candidate of sorted) {
    addUniqueConnectorCandidate(selected, seen, candidate);

    if (selected.length >= limit) {
      break;
    }
  }

  return selected;
}

async function buildConnectorCandidates(
  resolution: ResolvedTransitInput,
  role: "origin" | "destination",
) {
  const matchedCandidates = resolution.candidates.filter((point) =>
    isMatchedTransitPoint(resolution, point),
  );
  if (
    matchedCandidates.length > 0 &&
    matchedCandidates.every((point) => point.type === "metro_station")
  ) {
    return matchedCandidates.slice(0, 1).map((point) => ({
      point,
      accessLeg: null,
      score: 0,
    }));
  }

  const prefilteredCandidates =
    matchedCandidates.length > 0
      ? [
          ...matchedCandidates,
          ...resolution.candidates
            .filter((point) => !isMatchedTransitPoint(resolution, point))
            .slice(0, Math.max(2, Math.min(4, CANDIDATE_POOL_LIMIT - matchedCandidates.length))),
        ]
      : resolution.candidates.slice(0, CANDIDATE_POOL_LIMIT);
  const evaluated: ConnectorCandidate[] = [];

  for (const point of prefilteredCandidates) {
    const accessLeg = createAccessLeg(resolution, point, role);

    evaluated.push({
      point,
      accessLeg,
      score: connectorCandidateScore(accessLeg),
    });
  }

  const normalCandidates = evaluated
    .filter(
      (candidate) =>
        candidate.accessLeg?.connectorType !== "advisory" ||
        candidate.accessLeg.distanceKm <= LONG_RICKSHAW_MAX_KM,
    )
    .sort(compareConnectorCandidates);

  if (normalCandidates.length > 0) {
    return selectDiverseConnectorCandidates(
      normalCandidates,
      SURFACED_CANDIDATE_LIMIT,
    );
  }

  return selectDiverseConnectorCandidates(evaluated, SURFACED_CANDIDATE_LIMIT);
}

export function createPathSignature(
  route: Pick<
    RouteOption,
    | "kind"
    | "boarding"
    | "alighting"
    | "transferStops"
    | "segments"
    | "mapPreview"
  >,
) {
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
    route.transferStops
      .map((stop) => normalizeTransitText(stop.label))
      .join(">"),
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
    highlights.push(
      `${route.transferCount} transfer${route.transferCount > 1 ? "s" : ""}`,
    );
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
    tradeoffs.push(
      `Also available via ${route.serviceLabels.slice(1).join(", ")}`,
    );
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
    ...(destinationAccess?.connectorType === "advisory"
      ? [destinationAccess.note]
      : []),
  ]);
}

function finalizeRoute(
  route: Omit<RouteOption, "pathSignature" | "highlights" | "tradeoffs">,
) {
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

async function applyTripMapPreview(
  routes: RouteOption[],
  mapPreview: RouteMapPreview,
  options: { snapRoads: boolean },
) {
  return Promise.all(routes.map(async (route) => {
    const geometry = await buildRouteMapGeometry(route, mapPreview, options.snapRoads);
    const nextMapPreview = {
      ...mapPreview,
      ...geometry,
    };
    const nextRoute: RouteOption = {
      ...route,
      mapPreview: nextMapPreview,
      pathSignature: createPathSignature({
        kind: route.kind,
        boarding: route.boarding,
        alighting: route.alighting,
        transferStops: route.transferStops,
        segments: route.segments,
        mapPreview: nextMapPreview,
      }),
    };

    return routeOptionSchema.parse(nextRoute);
  }));
}

function pickBestRouteCandidate(current: RouteOption, incoming: RouteOption) {
  const currentDuration =
    current.estimatedDurationMinutes ?? FALLBACK_SORT_VALUE;
  const incomingDuration =
    incoming.estimatedDurationMinutes ?? FALLBACK_SORT_VALUE;

  if (incomingDuration !== currentDuration) {
    return incomingDuration < currentDuration ? incoming : current;
  }

  const currentCost = current.totalCost ?? FALLBACK_SORT_VALUE;
  const incomingCost = incoming.totalCost ?? FALLBACK_SORT_VALUE;

  if (incomingCost !== currentCost) {
    return incomingCost < currentCost ? incoming : current;
  }

  if (
    confidencePriority[incoming.confidence] !==
    confidencePriority[current.confidence]
  ) {
    return confidencePriority[incoming.confidence] >
      confidencePriority[current.confidence]
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
    const serviceLabels = dedupeStrings([
      ...existing.serviceLabels,
      ...route.serviceLabels,
    ]);
    const advisories = dedupeStrings([
      ...existing.advisories,
      ...route.advisories,
    ]);
    const serviceWindowText = dedupeStrings(
      [existing.serviceWindowText, route.serviceWindowText].filter(
        Boolean,
      ) as string[],
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
    route.transferStops
      .map((stop) => normalizeTransitText(stop.label))
      .join(">"),
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
    const serviceLabels = dedupeStrings([
      ...existing.serviceLabels,
      ...route.serviceLabels,
    ]);
    const advisories = dedupeStrings([
      ...existing.advisories,
      ...route.advisories,
    ]);
    const serviceWindowText = dedupeStrings(
      [existing.serviceWindowText, route.serviceWindowText].filter(
        Boolean,
      ) as string[],
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

function routeUsesMetro(route: RouteOption) {
  return route.segments.some((segment) => segment.mode === "metro");
}

function countConnectorSegments(
  route: RouteOption,
  connectorType: ConnectorType,
) {
  return route.segments.filter(
    (segment) => segment.connectorType === connectorType,
  ).length;
}

function totalConnectorDistanceOverTwoKm(route: RouteOption) {
  return route.segments.reduce((sum, segment) => {
    const distanceKm = segment.connectorDistanceKm ?? 0;
    return distanceKm > 2 ? sum + (distanceKm - 2) : sum;
  }, 0);
}

function getConfidenceBonus(route: RouteOption) {
  if (
    route.segments.some(
      (segment) =>
        segment.pricingConfidence === "exact" ||
        segment.pricingConfidence === "regulated_estimate" ||
        segment.distanceSource === "metro_exact",
    )
  ) {
    return 8;
  }

  if (
    route.confidence !== "advisory" ||
    route.segments.some(
      (segment) =>
        segment.distanceSource === "local_estimate",
    )
  ) {
    return 5;
  }

  return 0;
}

function getRecommendedScore(route: RouteOption) {
  const duration = route.estimatedDurationMinutes ?? FALLBACK_SORT_VALUE;
  const cost = route.totalCost ?? FALLBACK_SORT_VALUE;
  const walkConnectorCount = countConnectorSegments(route, "walk");
  const rickshawConnectorCount =
    countConnectorSegments(route, "rickshaw") +
    countConnectorSegments(route, "long_rickshaw");
  const anyLongRickshaw = countConnectorSegments(route, "long_rickshaw") > 0;

  return (
    duration +
    cost / 4 +
    route.transferCount * 10 +
    walkConnectorCount * 3 +
    rickshawConnectorCount * 6 +
    (anyLongRickshaw ? 18 : 0) +
    totalConnectorDistanceOverTwoKm(route) * 4 -
    getConfidenceBonus(route)
  );
}

function getConnectorBurden(route: RouteOption): ConnectorBurden {
  const connectorCount = route.segments.filter(
    (segment) => segment.connectorType,
  ).length;
  const longConnectorCount = countConnectorSegments(route, "long_rickshaw");
  const advisoryCount = countConnectorSegments(route, "advisory");
  const longDistance = totalConnectorDistanceOverTwoKm(route);

  if (advisoryCount > 0 || longConnectorCount > 0 || longDistance > 2.5) {
    return "high";
  }

  if (connectorCount >= 2 || longDistance > 0.8) {
    return "medium";
  }

  return "low";
}

function connectorBurdenRank(burden: ConnectorBurden) {
  switch (burden) {
    case "low":
      return 0;
    case "medium":
      return 1;
    default:
      return 2;
  }
}

function getRouteRankingValues(route: RouteOption, optimization: RouteOptimization) {
  const duration = route.estimatedDurationMinutes ?? FALLBACK_SORT_VALUE;
  const cost = route.totalCost ?? FALLBACK_SORT_VALUE;
  const recommended = getRecommendedScore(route);
  const longConnectorPenalty =
    countConnectorSegments(route, "long_rickshaw") > 0 ||
    countConnectorSegments(route, "advisory") > 0
      ? 1
      : 0;

  if (optimization === "fastest") {
    return [duration, longConnectorPenalty, route.transferCount, cost];
  }

  if (optimization === "cheapest") {
    return [cost, longConnectorPenalty, duration, route.transferCount];
  }

  return [recommended, longConnectorPenalty, route.transferCount, duration, cost];
}

function compareByOptimization(
  left: RouteOption,
  right: RouteOption,
  optimization: RouteOptimization,
) {
  const leftValues = getRouteRankingValues(left, optimization);
  const rightValues = getRouteRankingValues(right, optimization);

  for (let index = 0; index < leftValues.length; index += 1) {
    if (leftValues[index] !== rightValues[index]) {
      return leftValues[index]! - rightValues[index]!;
    }
  }

  const leftConfidence = confidencePriority[left.confidence];
  const rightConfidence = confidencePriority[right.confidence];

  if (leftConfidence !== rightConfidence) {
    return rightConfidence - leftConfidence;
  }

  return left.id.localeCompare(right.id);
}

function describePrimaryReason(optimization: RouteOptimization) {
  if (optimization === "fastest") {
    return "Fastest total travel time";
  }

  if (optimization === "cheapest") {
    return "Lowest total fare";
  }

  return "Best overall balance";
}

function pickAlternativeReason(route: RouteOption, primary: RouteOption) {
  if (route.transferCount < primary.transferCount) {
    return "Fewer transfers";
  }

  if (
    route.totalCost !== undefined &&
    primary.totalCost !== undefined &&
    route.totalCost < primary.totalCost
  ) {
    return "Lower total fare";
  }

  if (
    confidencePriority[route.confidence] >
    confidencePriority[primary.confidence]
  ) {
    return "Higher confidence";
  }

  if (
    connectorBurdenRank(getConnectorBurden(route)) <
    connectorBurdenRank(getConnectorBurden(primary))
  ) {
    return "Lighter connector burden";
  }

  if (route.kind !== primary.kind) {
    return "Different mode mix";
  }

  return "Strong alternative";
}

function scoreAlternativeCandidate(
  route: RouteOption,
  primary: RouteOption,
  optimization: RouteOptimization,
) {
  const reasonBoost =
    (route.transferCount < primary.transferCount ? 18 : 0) +
    (route.kind !== primary.kind ? 14 : 0) +
    (route.totalCost !== undefined &&
    primary.totalCost !== undefined &&
    route.totalCost < primary.totalCost
      ? 16
      : 0) +
    (confidencePriority[route.confidence] >
    confidencePriority[primary.confidence]
      ? 10
      : 0);

  return -getRouteRankingValues(route, optimization)[0]! + reasonBoost;
}

function decorateRouteScoring(
  route: RouteOption,
  optimization: RouteOptimization,
  primaryReason?: string,
) {
  const scoringReason =
    optimization === "fastest"
      ? `Fastest score based on ${route.estimatedDurationMinutes ?? "N/A"} min total time.`
      : optimization === "cheapest"
        ? `Cheapest score based on BDT ${Math.round(route.totalCost ?? 0)} estimated fare.`
        : `Recommended score ${getRecommendedScore(route).toFixed(1)} from total time, fare, transfers, and connector burden.`;

  return finalizeRoute({
    ...route,
    id: route.id,
    primaryReason,
    totalCostLowBdt: route.totalCostLowBdt ?? route.totalCost,
    totalCostHighBdt: route.totalCostHighBdt ?? route.totalCost,
    scoringReason,
    connectorBurden: getConnectorBurden(route),
  });
}

export function surfaceRoutes(
  routes: RouteOption[],
  optimization: RouteOptimization,
) {
  if (!routes.length) {
    return [];
  }

  const grouped = groupRoutesByPresentation(groupRoutesByPath(routes)).map((route) =>
    decorateRouteScoring(route, optimization),
  );
  const primary = [...grouped].sort((a, b) =>
    compareByOptimization(a, b, optimization),
  )[0];

  let alternativeCandidates = grouped.filter(
    (route) => route.pathSignature !== primary.pathSignature,
  );

  if (routeUsesMetro(primary)) {
    alternativeCandidates = alternativeCandidates.filter(
      (route) => !routeUsesMetro(route),
    );
  }

  const alternatives = alternativeCandidates
    .sort((a, b) => {
      const aScore = scoreAlternativeCandidate(a, primary, optimization);
      const bScore = scoreAlternativeCandidate(b, primary, optimization);
      return bScore - aScore;
    })
    .slice(0, 2);

  const surfaced = [
    decorateRouteScoring(primary, optimization, describePrimaryReason(optimization)),
  ];

  for (const alternative of alternatives) {
    surfaced.push(
      decorateRouteScoring(
        alternative,
        optimization,
        pickAlternativeReason(alternative, primary),
      ),
    );
  }

  return surfaced.slice(0, 3);
}

function findIndexOnRoute(route: DhakaBusSeedRoute, labels: string[]) {
  let best: { label: string; index: number } | null = null;

  for (const label of labels) {
    const index = route.stopLabels.findIndex(
      (stopLabel) =>
        normalizeTransitText(stopLabel) === normalizeTransitText(label),
    );

    if (index >= 0 && (!best || index < best.index)) {
      best = { label, index };
    }
  }

  return best;
}

function createLabelPairCacheKey(originLabels: string[], destinationLabels: string[]) {
  const originKey = originLabels.map((label) => normalizeTransitText(label)).sort().join("|");
  const destinationKey = destinationLabels
    .map((label) => normalizeTransitText(label))
    .sort()
    .join("|");

  return `${originKey}=>${destinationKey}`;
}

function findDirectBusLegs(
  originLabels: string[],
  destinationLabels: string[],
) {
  const cacheKey = createLabelPairCacheKey(originLabels, destinationLabels);
  const cached = directBusLegCache.get(cacheKey);

  if (cached) {
    return cached;
  }

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

  directBusLegCache.set(cacheKey, legs);

  return legs;
}

function buildFallbackDirectionMetrics(
  originCoordinates: [number, number] | undefined,
  destinationCoordinates: [number, number],
  remainingDistanceKm: number,
  busDistanceKm: number,
) {
  if (!originCoordinates) {
    return {
      progressDistanceKm: undefined,
      progressShare: undefined,
      directionScore: remainingDistanceKm * 6 + busDistanceKm,
    };
  }

  const baselineDistanceKm = haversineDistanceKm(
    originCoordinates,
    destinationCoordinates,
  );
  const progressDistanceKm = baselineDistanceKm - remainingDistanceKm;
  const progressShare =
    baselineDistanceKm > 0 ? progressDistanceKm / baselineDistanceKm : 0;
  const detourPenaltyKm = Math.max(
    0,
    busDistanceKm - Math.max(progressDistanceKm, 0),
  );

  return {
    progressDistanceKm,
    progressShare,
    directionScore:
      remainingDistanceKm * 6 +
      detourPenaltyKm * 4 +
      busDistanceKm -
      Math.max(progressDistanceKm, 0) * 3 -
      Math.max(progressShare, 0) * 20,
  };
}

function shouldKeepFallbackCandidate(
  remainingDistanceKm: number,
  busDistanceKm: number,
  progressDistanceKm?: number,
  progressShare?: number,
) {
  if (remainingDistanceKm <= 3) {
    return true;
  }

  if (progressDistanceKm === undefined || progressShare === undefined) {
    return true;
  }

  if (progressDistanceKm <= 0) {
    return false;
  }

  if (
    remainingDistanceKm > 5 &&
    progressDistanceKm < 2 &&
    progressShare < 0.2
  ) {
    return false;
  }

  if (
    remainingDistanceKm > 5 &&
    busDistanceKm > 0 &&
    progressDistanceKm / busDistanceKm < 0.55
  ) {
    return false;
  }

  return true;
}

function findTransferBusLegs(
  originLabels: string[],
  destinationLabels: string[],
) {
  const cacheKey = createLabelPairCacheKey(originLabels, destinationLabels);
  const cached = transferBusLegCache.get(cacheKey);

  if (cached) {
    return cached;
  }

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

    for (
      let transferIndex = firstBoarding.index + 1;
      transferIndex < firstRoute.stopLabels.length;
      transferIndex++
    ) {
      const transferLabel = firstRoute.stopLabels[transferIndex];

      if (!preferredTransferLabels.has(normalizeTransitText(transferLabel))) {
        continue;
      }

      for (const secondRoute of dhakaBusSeedRoutes) {
        if (secondRoute.id === firstRoute.id) {
          continue;
        }

        const secondTransfer = secondRoute.stopLabels.findIndex(
          (stopLabel) =>
            normalizeTransitText(stopLabel) ===
            normalizeTransitText(transferLabel),
        );
        const secondAlighting = findIndexOnRoute(
          secondRoute,
          destinationLabels,
        );

        if (
          secondTransfer < 0 ||
          !secondAlighting ||
          secondTransfer >= secondAlighting.index
        ) {
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

  transferBusLegCache.set(cacheKey, legs);

  return legs;
}

function findClosestDirectBusCandidates(
  originLabels: string[],
  originCoordinates: [number, number] | undefined,
  destinationCoordinates: [number, number],
) {
  const candidates: FallbackDirectBusCandidate[] = [];

  for (const route of dhakaBusSeedRoutes) {
    const boarding = findIndexOnRoute(route, originLabels);

    if (!boarding) {
      continue;
    }

    for (
      let alightingIndex = boarding.index + 1;
      alightingIndex < route.stopLabels.length;
      alightingIndex++
    ) {
      const alightingLabel = route.stopLabels[alightingIndex];
      const alightingCoordinates = findBusStopCoordinates(alightingLabel);

      if (!alightingCoordinates) {
        continue;
      }

      const leg: BusLeg = {
        route,
        boardingLabel: route.stopLabels[boarding.index],
        alightingLabel,
        stopCount: alightingIndex - boarding.index,
        serviceWindowText: buildServiceWindowText(route),
      };
      const remainingDistanceKm = haversineDistanceKm(
        alightingCoordinates,
        destinationCoordinates,
      );
      const busDistanceKm = estimateBusLegDistanceKm(leg);
      const directionMetrics = buildFallbackDirectionMetrics(
        originCoordinates,
        destinationCoordinates,
        remainingDistanceKm,
        busDistanceKm,
      );

      if (
        !shouldKeepFallbackCandidate(
          remainingDistanceKm,
          busDistanceKm,
          directionMetrics.progressDistanceKm,
          directionMetrics.progressShare,
        )
      ) {
        continue;
      }

      candidates.push({
        leg,
        alightingCoordinates,
        remainingDistanceKm,
        busDistanceKm,
        progressDistanceKm: directionMetrics.progressDistanceKm,
        progressShare: directionMetrics.progressShare,
        directionScore: directionMetrics.directionScore,
      });
    }
  }

  return candidates
    .sort((a, b) => {
      if (a.directionScore !== b.directionScore) {
        return a.directionScore - b.directionScore;
      }

      if (a.remainingDistanceKm !== b.remainingDistanceKm) {
        return a.remainingDistanceKm - b.remainingDistanceKm;
      }

      return a.leg.stopCount - b.leg.stopCount;
    })
    .slice(0, 6);
}

function findClosestTransferBusCandidates(
  originLabels: string[],
  originCoordinates: [number, number] | undefined,
  destinationCoordinates: [number, number],
) {
  const candidates: FallbackTransferBusCandidate[] = [];

  for (const firstRoute of dhakaBusSeedRoutes) {
    const firstBoarding = findIndexOnRoute(firstRoute, originLabels);

    if (!firstBoarding) {
      continue;
    }

    for (
      let transferIndex = firstBoarding.index + 1;
      transferIndex < firstRoute.stopLabels.length;
      transferIndex++
    ) {
      const transferLabel = firstRoute.stopLabels[transferIndex];

      if (!preferredTransferLabels.has(normalizeTransitText(transferLabel))) {
        continue;
      }

      for (const secondRoute of dhakaBusSeedRoutes) {
        if (secondRoute.id === firstRoute.id) {
          continue;
        }

        const secondTransfer = secondRoute.stopLabels.findIndex(
          (stopLabel) =>
            normalizeTransitText(stopLabel) ===
            normalizeTransitText(transferLabel),
        );

        if (secondTransfer < 0) {
          continue;
        }

        for (
          let secondAlightingIndex = secondTransfer + 1;
          secondAlightingIndex < secondRoute.stopLabels.length;
          secondAlightingIndex++
        ) {
          const alightingLabel = secondRoute.stopLabels[secondAlightingIndex];
          const alightingCoordinates = findBusStopCoordinates(alightingLabel);

          if (!alightingCoordinates) {
            continue;
          }

          const firstLeg: BusLeg = {
            route: firstRoute,
            boardingLabel: firstRoute.stopLabels[firstBoarding.index],
            alightingLabel: transferLabel,
            stopCount: transferIndex - firstBoarding.index,
            serviceWindowText: buildServiceWindowText(firstRoute),
          };
          const secondLeg: BusLeg = {
            route: secondRoute,
            boardingLabel: transferLabel,
            alightingLabel,
            stopCount: secondAlightingIndex - secondTransfer,
            serviceWindowText: buildServiceWindowText(secondRoute),
          };
          const remainingDistanceKm = haversineDistanceKm(
            alightingCoordinates,
            destinationCoordinates,
          );
          const busDistanceKm =
            estimateBusLegDistanceKm(firstLeg) +
            estimateBusLegDistanceKm(secondLeg);
          const directionMetrics = buildFallbackDirectionMetrics(
            originCoordinates,
            destinationCoordinates,
            remainingDistanceKm,
            busDistanceKm,
          );

          if (
            !shouldKeepFallbackCandidate(
              remainingDistanceKm,
              busDistanceKm,
              directionMetrics.progressDistanceKm,
              directionMetrics.progressShare,
            )
          ) {
            continue;
          }

          candidates.push({
            firstLeg,
            secondLeg,
            transferLabel,
            alightingCoordinates,
            remainingDistanceKm,
            busDistanceKm,
            progressDistanceKm: directionMetrics.progressDistanceKm,
            progressShare: directionMetrics.progressShare,
            directionScore:
              directionMetrics.directionScore + TRANSFER_BUFFER_MINUTES,
          });
        }
      }
    }
  }

  return candidates
    .sort((a, b) => {
      if (a.directionScore !== b.directionScore) {
        return a.directionScore - b.directionScore;
      }

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
  originCandidate: ConnectorCandidate,
  destinationCandidate: ConnectorCandidate,
) {
  const originPoint = originCandidate.point;
  const destinationPoint = destinationCandidate.point;
  const busName = getBusDisplayName(leg.route);
  const busDistanceKm = estimateBusLegDistanceKm(leg);
  const busOperationalDistanceKm = estimateBusOperationalDistanceKm(leg);
  const busDurationMinutes = estimateBusDurationMinutes(
    busOperationalDistanceKm,
    leg.stopCount,
  );
  const busFare = estimateBusFareBdt(busOperationalDistanceKm, leg.stopCount);
  const originAccess = originCandidate.accessLeg;
  const destinationAccess = destinationCandidate.accessLeg;
  const metrics = combineRouteMetrics([
    accessLegMetrics(originAccess),
    {
      distanceKm: busDistanceKm,
      durationMinutes: busDurationMinutes,
      costBdt: busFare,
      costLowBdt: busFare,
      costHighBdt: busFare,
    },
    accessLegMetrics(destinationAccess),
  ]);

  return finalizeRoute({
    id: `${leg.route.id}-${normalizeTransitText(leg.boardingLabel)}-${normalizeTransitText(leg.alightingLabel)}`,
    kind: "bus_direct",
    confidence: "verified",
    summary: `${busName} direct`,
    fareType: "advisory",
    fareText: formatRouteTotal(
      metrics.totalCost,
      "advisory",
      metrics.costLowBdt,
      metrics.costHighBdt,
    ),
    totalCost: metrics.totalCost,
    totalCostLowBdt: metrics.costLowBdt,
    totalCostHighBdt: metrics.costHighBdt,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    serviceWindowText: leg.serviceWindowText,
    stopCount: leg.stopCount,
    stationCount: undefined,
    transferCount: 0,
    boarding: makeBusReferenceForPoint(originPoint, leg.boardingLabel),
    alighting: makeBusReferenceForPoint(destinationPoint, leg.alightingLabel),
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
        distanceSource: "local_estimate",
        pricingConfidence: "regulated_estimate",
        costLowBdt: busFare,
        costHighBdt: busFare,
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
  originCandidate: ConnectorCandidate,
  destinationCandidate: ConnectorCandidate,
) {
  const originPoint = originCandidate.point;
  const destinationPoint = destinationCandidate.point;
  const firstBusName = getBusDisplayName(transfer.firstLeg.route);
  const secondBusName = getBusDisplayName(transfer.secondLeg.route);
  const firstDistanceKm = estimateBusLegDistanceKm(transfer.firstLeg);
  const secondDistanceKm = estimateBusLegDistanceKm(transfer.secondLeg);
  const firstOperationalDistanceKm = estimateBusOperationalDistanceKm(
    transfer.firstLeg,
  );
  const secondOperationalDistanceKm = estimateBusOperationalDistanceKm(
    transfer.secondLeg,
  );
  const firstFare = estimateBusFareBdt(
    firstOperationalDistanceKm,
    transfer.firstLeg.stopCount,
  );
  const secondFare = estimateBusFareBdt(
    secondOperationalDistanceKm,
    transfer.secondLeg.stopCount,
  );
  const firstDurationMinutes = estimateBusDurationMinutes(
    firstOperationalDistanceKm,
    transfer.firstLeg.stopCount,
  );
  const secondDurationMinutes = estimateBusDurationMinutes(
    secondOperationalDistanceKm,
    transfer.secondLeg.stopCount,
  );
  const originAccess = originCandidate.accessLeg;
  const destinationAccess = destinationCandidate.accessLeg;
  const metrics = combineRouteMetrics([
    accessLegMetrics(originAccess),
    {
      distanceKm: firstDistanceKm,
      durationMinutes: firstDurationMinutes,
      costBdt: firstFare,
      costLowBdt: firstFare,
      costHighBdt: firstFare,
    },
    {
      distanceKm: secondDistanceKm,
      durationMinutes: secondDurationMinutes,
      costBdt: secondFare,
      costLowBdt: secondFare,
      costHighBdt: secondFare,
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
    fareText: formatRouteTotal(
      metrics.totalCost,
      "advisory",
      metrics.costLowBdt,
      metrics.costHighBdt,
    ),
    totalCost: metrics.totalCost,
    totalCostLowBdt: metrics.costLowBdt,
    totalCostHighBdt: metrics.costHighBdt,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    serviceWindowText:
      `${firstBusName}: ${transfer.firstLeg.serviceWindowText ?? "N/A"} | ` +
      `${secondBusName}: ${transfer.secondLeg.serviceWindowText ?? "N/A"}`,
    stopCount: transfer.firstLeg.stopCount + transfer.secondLeg.stopCount,
    stationCount: undefined,
    transferCount: 1,
    boarding: makeBusReferenceForPoint(originPoint, transfer.firstLeg.boardingLabel),
    alighting: makeBusReferenceForPoint(
      destinationPoint,
      transfer.secondLeg.alightingLabel,
    ),
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
        distanceSource: "local_estimate",
        pricingConfidence: "regulated_estimate",
        costLowBdt: firstFare,
        costHighBdt: firstFare,
      },
      {
        mode: "walk",
        instruction: "Change buses",
        startLocation: transfer.transferLabel,
        endLocation: transfer.transferLabel,
        note: "Transfer at a shared bus stop or hub.",
        estimatedDurationMinutes: TRANSFER_BUFFER_MINUTES,
        distanceSource: "local_estimate",
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
        distanceSource: "local_estimate",
        pricingConfidence: "regulated_estimate",
        costLowBdt: secondFare,
        costHighBdt: secondFare,
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
  originCandidate: ConnectorCandidate,
  destinationResolution: ResolvedTransitInput,
) {
  const originPoint = originCandidate.point;
  const busName = getBusDisplayName(candidate.leg.route);
  const busDistanceKm = estimateBusLegDistanceKm(candidate.leg);
  const busOperationalDistanceKm = estimateBusOperationalDistanceKm(
    candidate.leg,
  );
  const busFare = estimateBusFareBdt(
    busOperationalDistanceKm,
    candidate.leg.stopCount,
  );
  const busDurationMinutes = estimateBusDurationMinutes(
    busOperationalDistanceKm,
    candidate.leg.stopCount,
  );
  const originAccess = originCandidate.accessLeg;
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
      costLowBdt: busFare,
      costHighBdt: busFare,
    },
    accessLegMetrics(destinationAccess),
  ]);

  return finalizeRoute({
    id: `${candidate.leg.route.id}-${normalizeTransitText(candidate.leg.boardingLabel)}-${normalizeTransitText(candidate.leg.alightingLabel)}-fallback`,
    kind: "bus_direct",
    confidence: "advisory",
    summary: `${busName} close match`,
    fareType: "advisory",
    fareText: formatRouteTotal(
      metrics.totalCost,
      "advisory",
      metrics.costLowBdt,
      metrics.costHighBdt,
    ),
    totalCost: metrics.totalCost,
    totalCostLowBdt: metrics.costLowBdt,
    totalCostHighBdt: metrics.costHighBdt,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    serviceWindowText: candidate.leg.serviceWindowText,
    stopCount: candidate.leg.stopCount,
    stationCount: undefined,
    transferCount: 0,
    boarding: makeBusReferenceForPoint(originPoint, candidate.leg.boardingLabel),
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
        distanceSource: "local_estimate",
        pricingConfidence: "regulated_estimate",
        costLowBdt: busFare,
        costHighBdt: busFare,
      },
      ...(destinationAccess ? [buildAccessSegment(destinationAccess)] : []),
    ],
    mapPreview: buildMapPreview(
      candidate.leg.boardingLabel,
      candidate.leg.alightingLabel,
    ),
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
  originCandidate: ConnectorCandidate,
  destinationResolution: ResolvedTransitInput,
) {
  const originPoint = originCandidate.point;
  const firstBusName = getBusDisplayName(candidate.firstLeg.route);
  const secondBusName = getBusDisplayName(candidate.secondLeg.route);
  const firstDistanceKm = estimateBusLegDistanceKm(candidate.firstLeg);
  const secondDistanceKm = estimateBusLegDistanceKm(candidate.secondLeg);
  const firstOperationalDistanceKm = estimateBusOperationalDistanceKm(
    candidate.firstLeg,
  );
  const secondOperationalDistanceKm = estimateBusOperationalDistanceKm(
    candidate.secondLeg,
  );
  const firstFare = estimateBusFareBdt(
    firstOperationalDistanceKm,
    candidate.firstLeg.stopCount,
  );
  const secondFare = estimateBusFareBdt(
    secondOperationalDistanceKm,
    candidate.secondLeg.stopCount,
  );
  const firstDurationMinutes = estimateBusDurationMinutes(
    firstOperationalDistanceKm,
    candidate.firstLeg.stopCount,
  );
  const secondDurationMinutes = estimateBusDurationMinutes(
    secondOperationalDistanceKm,
    candidate.secondLeg.stopCount,
  );
  const originAccess = originCandidate.accessLeg;
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
      costLowBdt: firstFare,
      costHighBdt: firstFare,
    },
    {
      distanceKm: secondDistanceKm,
      durationMinutes: secondDurationMinutes,
      costBdt: secondFare,
      costLowBdt: secondFare,
      costHighBdt: secondFare,
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
    fareText: formatRouteTotal(
      metrics.totalCost,
      "advisory",
      metrics.costLowBdt,
      metrics.costHighBdt,
    ),
    totalCost: metrics.totalCost,
    totalCostLowBdt: metrics.costLowBdt,
    totalCostHighBdt: metrics.costHighBdt,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    serviceWindowText:
      `${firstBusName}: ${candidate.firstLeg.serviceWindowText ?? "N/A"} | ` +
      `${secondBusName}: ${candidate.secondLeg.serviceWindowText ?? "N/A"}`,
    stopCount: candidate.firstLeg.stopCount + candidate.secondLeg.stopCount,
    stationCount: undefined,
    transferCount: 1,
    boarding: makeBusReferenceForPoint(originPoint, candidate.firstLeg.boardingLabel),
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
        distanceSource: "local_estimate",
        pricingConfidence: "regulated_estimate",
        costLowBdt: firstFare,
        costHighBdt: firstFare,
      },
      {
        mode: "walk",
        instruction: "Change buses",
        startLocation: candidate.transferLabel,
        endLocation: candidate.transferLabel,
        note: "Short transfer between bus services.",
        estimatedDurationMinutes: TRANSFER_BUFFER_MINUTES,
        distanceSource: "local_estimate",
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
        distanceSource: "local_estimate",
        pricingConfidence: "regulated_estimate",
        costLowBdt: secondFare,
        costHighBdt: secondFare,
      },
      ...(destinationAccess ? [buildAccessSegment(destinationAccess)] : []),
    ],
    mapPreview: buildMapPreview(
      candidate.firstLeg.boardingLabel,
      candidate.secondLeg.alightingLabel,
    ),
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
  originCandidate: ConnectorCandidate,
  destinationCandidate: ConnectorCandidate,
) {
  const originPoint = originCandidate.point;
  const destinationPoint = destinationCandidate.point;
  const originStation = getMetroStationById(originStationId);
  const destinationStation = getMetroStationById(destinationStationId);

  if (
    !originStation ||
    !destinationStation ||
    originStation.id === destinationStation.id
  ) {
    return null;
  }

  const stationCount = Math.abs(
    originStation.sequence - destinationStation.sequence,
  );
  const fare = getMetroFare(originStation.id, destinationStation.id);
  const metroDistanceKm = estimateMetroDistanceKm(
    originStation.id,
    destinationStation.id,
    stationCount,
  );
  const metroOperationalDistanceKm = estimateMetroOperationalDistanceKm(
    originStation.id,
    destinationStation.id,
    stationCount,
  );
  const metroDurationMinutes = estimateMetroDurationMinutes(
    metroOperationalDistanceKm,
    stationCount,
  );
  const originAccess = originCandidate.accessLeg;
  const destinationAccess = destinationCandidate.accessLeg;
  const metrics = combineRouteMetrics([
    accessLegMetrics(originAccess),
    {
      distanceKm: metroDistanceKm,
      durationMinutes: metroDurationMinutes,
      costBdt: fare ?? undefined,
      costLowBdt: fare ?? undefined,
      costHighBdt: fare ?? undefined,
    },
    accessLegMetrics(destinationAccess),
  ]);

  return finalizeRoute({
    id: `${originStation.id}-${destinationStation.id}`,
    kind: "metro_direct",
    confidence: "exact",
    summary: "Metro direct",
    fareType: "exact",
    fareText: formatRouteTotal(
      metrics.totalCost,
      "exact",
      metrics.costLowBdt,
      metrics.costHighBdt,
    ),
    totalCost: metrics.totalCost,
    totalCostLowBdt: metrics.costLowBdt,
    totalCostHighBdt: metrics.costHighBdt,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    serviceWindowText: METRO_SERVICE_WINDOW_TEXT,
    stopCount: undefined,
    stationCount,
    transferCount: 0,
    boarding: makePointReference(originPoint),
    alighting: makePointReference(destinationPoint),
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
        distanceSource: "metro_exact",
        pricingConfidence: "exact",
        costLowBdt: fare ?? undefined,
        costHighBdt: fare ?? undefined,
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
  originCandidate: ConnectorCandidate,
  destinationCandidate: ConnectorCandidate,
  direction: "bus_then_metro" | "metro_then_bus",
) {
  const originPoint = originCandidate.point;
  const destinationPoint = destinationCandidate.point;
  const interchangeStation = getMetroStationById(interchangeStationId);
  const destinationStation = getMetroStationById(destinationStationId);

  if (!interchangeStation || !destinationStation) {
    return null;
  }

  const stationCount = Math.abs(
    interchangeStation.sequence - destinationStation.sequence,
  );

  if (stationCount <= 0) {
    return null;
  }

  const busName = getBusDisplayName(busLeg.route);
  const fare = getMetroFare(interchangeStationId, destinationStationId);
  const busDistanceKm = estimateBusLegDistanceKm(busLeg);
  const busOperationalDistanceKm = estimateBusOperationalDistanceKm(busLeg);
  const busFare = estimateBusFareBdt(
    busOperationalDistanceKm,
    busLeg.stopCount,
  );
  const busDurationMinutes = estimateBusDurationMinutes(
    busOperationalDistanceKm,
    busLeg.stopCount,
  );
  const metroDistanceKm = estimateMetroDistanceKm(
    interchangeStationId,
    destinationStationId,
    stationCount,
  );
  const metroOperationalDistanceKm = estimateMetroOperationalDistanceKm(
    interchangeStationId,
    destinationStationId,
    stationCount,
  );
  const metroDurationMinutes = estimateMetroDurationMinutes(
    metroOperationalDistanceKm,
    stationCount,
  );
  const originAccess = originCandidate.accessLeg;
  const destinationAccess = destinationCandidate.accessLeg;
  const metrics = combineRouteMetrics([
    accessLegMetrics(originAccess),
    {
      distanceKm: busDistanceKm,
      durationMinutes: busDurationMinutes,
      costBdt: busFare,
      costLowBdt: busFare,
      costHighBdt: busFare,
    },
    {
      distanceKm: metroDistanceKm,
      durationMinutes: metroDurationMinutes,
      costBdt: fare ?? undefined,
      costLowBdt: fare ?? undefined,
      costHighBdt: fare ?? undefined,
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
            distanceSource: "local_estimate",
            pricingConfidence: "regulated_estimate",
            costLowBdt: busFare,
            costHighBdt: busFare,
          },
          {
            mode: "walk",
            instruction: "Switch to metro",
            startLocation: interchangeStation.name,
            endLocation: interchangeStation.name,
            note: "Buffer time for station entry and platform transfer.",
            estimatedDurationMinutes: TRANSFER_BUFFER_MINUTES,
            distanceSource: "local_estimate",
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
            distanceSource: "metro_exact",
            pricingConfidence: "exact",
            costLowBdt: fare ?? undefined,
            costHighBdt: fare ?? undefined,
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
            distanceSource: "metro_exact",
            pricingConfidence: "exact",
            costLowBdt: fare ?? undefined,
            costHighBdt: fare ?? undefined,
          },
          {
            mode: "walk",
            instruction: "Exit the metro and transfer",
            startLocation: busLeg.boardingLabel,
            endLocation: busLeg.boardingLabel,
            note: "Buffer time between the station exit and bus boarding area.",
            estimatedDurationMinutes: TRANSFER_BUFFER_MINUTES,
            distanceSource: "local_estimate",
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
            distanceSource: "local_estimate",
            pricingConfidence: "regulated_estimate",
            costLowBdt: busFare,
            costHighBdt: busFare,
          },
        ];

  return finalizeRoute({
    id: `${busLeg.route.id}-${interchangeStationId}-${destinationStationId}-${direction}`,
    kind: "bus_metro_hybrid",
    confidence: "verified",
    summary: `${busName} + Metro`,
    fareType: "advisory",
    fareText: formatRouteTotal(
      metrics.totalCost,
      "advisory",
      metrics.costLowBdt,
      metrics.costHighBdt,
    ),
    totalCost: metrics.totalCost,
    totalCostLowBdt: metrics.costLowBdt,
    totalCostHighBdt: metrics.costHighBdt,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    serviceWindowText: joinServiceWindows([
      busLeg.serviceWindowText
        ? `${busName}: ${busLeg.serviceWindowText}`
        : undefined,
      `MRT Line 6: ${METRO_SERVICE_WINDOW_TEXT}`,
    ]),
    stopCount: busLeg.stopCount,
    stationCount,
    transferCount: 1,
    boarding:
      direction === "bus_then_metro"
        ? makeBusReferenceForPoint(originPoint, busLeg.boardingLabel)
        : makePointReference(originPoint),
    alighting:
      direction === "bus_then_metro"
        ? makePointReference(destinationPoint)
        : makeBusReferenceForPoint(destinationPoint, busLeg.alightingLabel),
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
      direction === "bus_then_metro"
        ? busLeg.boardingLabel
        : interchangeStation.name,
      direction === "bus_then_metro"
        ? destinationStation.name
        : busLeg.alightingLabel,
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
  originCandidate: ConnectorCandidate,
  destinationCandidate: ConnectorCandidate,
) {
  const originPoint = originCandidate.point;
  const destinationPoint = destinationCandidate.point;
  const originAccess = originCandidate.accessLeg;
  const destinationAccess = destinationCandidate.accessLeg;
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
    fareText:
      metrics.totalCost !== undefined
        ? formatRouteTotal(
            metrics.totalCost,
            "advisory",
            metrics.costLowBdt,
            metrics.costHighBdt,
          )
        : "Fare varies",
    totalCost: metrics.totalCost,
    totalCostLowBdt: metrics.costLowBdt,
    totalCostHighBdt: metrics.costHighBdt,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    serviceWindowText: undefined,
    stopCount: undefined,
    stationCount: undefined,
    transferCount: 0,
    boarding: {
      ...makePointReference(originPoint),
    },
    alighting: {
      ...makePointReference(destinationPoint),
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
        startLocation: originAccess?.startLocation ?? originPoint.name,
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
  originCandidate: ConnectorCandidate,
  destinationCandidate: ConnectorCandidate,
) {
  return findDirectBusLegs(
    originCandidate.point.busStopLabels,
    destinationCandidate.point.busStopLabels,
  ).map((leg) =>
    createDirectBusRoute(
      leg,
      originCandidate,
      destinationCandidate,
    ),
  );
}

function collectTransferBusRoutes(
  originCandidate: ConnectorCandidate,
  destinationCandidate: ConnectorCandidate,
) {
  return findTransferBusLegs(
    originCandidate.point.busStopLabels,
    destinationCandidate.point.busStopLabels,
  ).map((transfer) =>
    createTransferBusRoute(
      transfer,
      originCandidate,
      destinationCandidate,
    ),
  );
}

function collectHybridRoutes(
  originCandidate: ConnectorCandidate,
  destinationCandidate: ConnectorCandidate,
) {
  const routes: RouteOption[] = [];
  const interchangePoints = DHAKA_ACCESS_POINTS.filter(
    (point) => point.metroStationId && point.busStopLabels.length,
  );
  const originPoint = originCandidate.point;
  const destinationPoint = destinationCandidate.point;

  if (originPoint.busStopLabels.length && destinationPoint.metroStationId) {
    for (const interchange of interchangePoints) {
      const legs = findDirectBusLegs(
        originPoint.busStopLabels,
        interchange.busStopLabels,
      );
      for (const leg of legs) {
        const route = createHybridRoute(
          leg,
          interchange.metroStationId!,
          destinationPoint.metroStationId,
          originCandidate,
          destinationCandidate,
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
      const legs = findDirectBusLegs(
        interchange.busStopLabels,
        destinationPoint.busStopLabels,
      );
      for (const leg of legs) {
        const route = createHybridRoute(
          leg,
          originPoint.metroStationId,
          interchange.metroStationId!,
          originCandidate,
          destinationCandidate,
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
  originCandidates: ConnectorCandidate[],
  destinationResolution: ResolvedTransitInput,
) {
  const destinationCoordinates =
    destinationResolution.place?.coordinates ??
    destinationResolution.candidates[0]?.coordinates;

  if (!destinationCoordinates) {
    return [];
  }

  const routes: RouteOption[] = [];

  for (const originCandidate of originCandidates.slice(0, 2)) {
    const originPoint = originCandidate.point;

    if (!originPoint.busStopLabels.length) {
      continue;
    }

    const directCandidates = findClosestDirectBusCandidates(
      originPoint.busStopLabels,
      originPoint.coordinates,
      destinationCoordinates,
    );

    for (const candidate of directCandidates) {
      routes.push(
        createFallbackDirectBusRoute(
          candidate,
          originCandidate,
          destinationResolution,
        ),
      );
    }

    if (directCandidates.length) {
      continue;
    }

    for (const candidate of findClosestTransferBusCandidates(
      originPoint.busStopLabels,
      originPoint.coordinates,
      destinationCoordinates,
    )) {
      routes.push(
        createFallbackTransferBusRoute(
          candidate,
          originCandidate,
          destinationResolution,
        ),
      );
    }
  }

  return routes;
}

function pickPlanningCandidates(
  candidates: ConnectorCandidate[],
  directMatch: boolean,
) {
  return selectDiverseConnectorCandidates(candidates, directMatch ? 2 : 3);
}

async function runPlanner(
  payload: CalculateRouteRequest,
  originResolution: ResolvedTransitInput,
  destinationResolution: ResolvedTransitInput,
) {
  const [originCandidates, destinationCandidates] = await Promise.all([
    buildConnectorCandidates(
      originResolution,
      "origin",
    ),
    buildConnectorCandidates(
      destinationResolution,
      "destination",
    ),
  ]);
  const planningOriginCandidates = pickPlanningCandidates(
    originCandidates,
    originResolution.directMatch,
  );
  const planningDestinationCandidates = pickPlanningCandidates(
    destinationCandidates,
    destinationResolution.directMatch,
  );
  const primaryOriginCandidate = planningOriginCandidates[0];
  const primaryDestinationCandidate = planningDestinationCandidates[0];

  if (
    primaryOriginCandidate?.point.metroStationId &&
    primaryDestinationCandidate?.point.metroStationId &&
    isMatchedTransitPoint(originResolution, primaryOriginCandidate.point) &&
    isMatchedTransitPoint(
      destinationResolution,
      primaryDestinationCandidate.point,
    )
  ) {
    const metroRoute = createMetroRoute(
      primaryOriginCandidate.point.metroStationId,
      primaryDestinationCandidate.point.metroStationId,
      primaryOriginCandidate,
      primaryDestinationCandidate,
    );

    if (metroRoute) {
      const decoratedMetroRoute = decorateRouteScoring(
        metroRoute,
        payload.optimization,
        describePrimaryReason(payload.optimization),
      );

      return {
        routes: [decoratedMetroRoute],
        debugRoutes: [decoratedMetroRoute],
      };
    }
  }

  const routes: RouteOption[] = [];

  for (const [originIndex, originCandidate] of planningOriginCandidates.entries()) {
    for (const [destinationIndex, destinationCandidate] of planningDestinationCandidates.entries()) {
      const originPoint = originCandidate.point;
      const destinationPoint = destinationCandidate.point;
      const shouldExploreComplexRoutes =
        originIndex < 2 && destinationIndex < 2;

      if (originPoint.id === destinationPoint.id) {
        continue;
      }

      if (originPoint.metroStationId && destinationPoint.metroStationId) {
        const metroRoute = createMetroRoute(
          originPoint.metroStationId,
          destinationPoint.metroStationId,
          originCandidate,
          destinationCandidate,
        );

        if (metroRoute) {
          routes.push(metroRoute);
        }
      }

      if (
        originPoint.busStopLabels.length &&
        destinationPoint.busStopLabels.length
      ) {
        const directBusRoutes = collectDirectBusRoutes(
          originCandidate,
          destinationCandidate,
        );

        routes.push(...directBusRoutes);

        if (!directBusRoutes.length && shouldExploreComplexRoutes) {
          routes.push(
            ...collectTransferBusRoutes(
              originCandidate,
              destinationCandidate,
            ),
          );
        }
      }

      if (shouldExploreComplexRoutes) {
        routes.push(
          ...collectHybridRoutes(
            originCandidate,
            destinationCandidate,
          ),
        );
      }
    }
  }

  const groupedRoutes = groupRoutesByPresentation(groupRoutesByPath(routes));
  const routedCandidates = groupedRoutes.map((route) =>
    decorateRouteScoring(route, payload.optimization),
  );
  const surfacedRoutes = surfaceRoutes(routedCandidates, payload.optimization);
  const fallbackCandidates =
    surfacedRoutes.length > 0
      ? []
      : collectFallbackBusRoutes(
          originCandidates,
          destinationResolution,
        );
  const fallbackGrouped = groupRoutesByPresentation(groupRoutesByPath(fallbackCandidates));
  const enrichedFallbackRoutes =
    surfacedRoutes.length > 0
      ? []
      : fallbackGrouped.map((route) => decorateRouteScoring(route, payload.optimization));
  const fallbackRoutes =
    surfacedRoutes.length > 0
      ? []
      : surfaceRoutes(enrichedFallbackRoutes, payload.optimization);

  return {
    routes:
      surfacedRoutes.length > 0
        ? surfacedRoutes
        : fallbackRoutes.length > 0
          ? fallbackRoutes
          : originCandidates[0] && destinationCandidates[0]
            ? [
                createAdvisoryRoute(
                  originCandidates[0],
                  destinationCandidates[0],
                ),
              ]
            : [],
    debugRoutes:
      surfacedRoutes.length > 0
        ? routedCandidates
        : fallbackRoutes.length > 0
          ? enrichedFallbackRoutes
          : [],
  };
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
  const primaryResult = await runPlanner(payload, originResolution, destinationResolution);

  return calculateRouteResponseSchema.parse({
    routes: await applyTripMapPreview(primaryResult.routes, tripMapPreview, {
      snapRoads: true,
    }),
    debugRoutes: await applyTripMapPreview(primaryResult.debugRoutes, tripMapPreview, {
      snapRoads: false,
    }),
    source: "deterministic",
  });
}
