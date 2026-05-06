import {
  dhakaBusSeedRoutes,
  dhakaBusSeedStops,
  getDhakaBusStopByLabel,
  getDhakaBusStopCoordinatesByLabel,
  type DhakaBusSeedRoute,
} from "@/lib/data/dhaka-bus-seed";
import {
  DHAKA_METRO_LINE_6_SHAPE,
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
import {
  haversineDistanceKm,
  normalizeTransitText,
} from "@/lib/server/transit-support";
import {
  getRoadSnappedRoute,
  type RoadSnappedRoute,
} from "@/lib/server/geoapify-routing";
import {
  calculateRouteResponseSchema,
  routeOptionSchema,
  type CalculateRouteRequest,
  type ConnectorType,
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

interface BusTransfer {
  firstLeg: BusLeg;
  secondLeg: BusLeg;
  transferLabel: string;
  transferWalkDistanceKm?: number;
  transferWalkDurationMinutes?: number;
}

interface AccessLeg {
  connectorType: ConnectorType;
  mode: TransportMode;
  distanceKm: number;
  durationMinutes: number;
  costBdt?: number;
  startLocation: string;
  endLocation: string;
}

interface TransitCandidate {
  point: TransitPoint;
  accessLeg: AccessLeg | null;
  score: number;
}

interface RouteMetrics {
  distanceKm: number;
  durationMinutes: number;
  costBdt?: number;
}

interface RouteScoreBreakdown {
  durationMinutes: number;
  fareBdt: number;
  transferCount: number;
  connectorDistanceKm: number;
  rickshawDistanceKm: number;
  walkDistanceKm: number;
  longRickshawCount: number;
  segmentCount: number;
  detourRatio: number;
  confidencePenalty: number;
}

interface ScoreProfile {
  id: "balanced" | "fastest_practical" | "lowest_hassle" | "lowest_fare";
  label: string;
  primaryReason: string;
  scoringReason: string;
  weights: {
    duration: number;
    fare: number;
    transfer: number;
    connector: number;
    rickshaw: number;
    walk: number;
    longRickshaw: number;
    complexity: number;
    detour: number;
    confidence: number;
    directBonus: number;
    metroBonus: number;
    purposefulLongConnectorBonus: number;
  };
}

// Tweakable route-planning configuration.
// Keep these values together so route behavior can be tuned without hunting through the planner.

// Connector classification.
const ACCESS_WALK_MAX_KM = 0.8;
const LONG_RICKSHAW_MIN_KM = 3.5;

// Speed and timing estimates.
const BUS_SPEED_KMPH = 13;
const METRO_SPEED_KMPH = 32;
const WALK_SPEED_KMPH = 4.6;
const RICKSHAW_SPEED_KMPH = 10;
const BUS_STOP_DELAY_MINUTES = 0.7;
const METRO_STATION_DELAY_MINUTES = 0.7;
const TRANSFER_BUFFER_MINUTES = 6;

// Distance fallbacks when exact coordinates/shape are incomplete.
const BUS_STOP_SPACING_KM = 0.9;
const METRO_STATION_SPACING_KM = 1.35;

// Fare estimates.
const BUS_FARE_PER_KM_BDT = 2.42;
const RICKSHAW_BASE_FARE_BDT = 20;
const RICKSHAW_BASE_DISTANCE_KM = 0.5;
const RICKSHAW_FARE_PER_EXTRA_KM_BDT = 20;
const RICKSHAW_FARE_ROUNDING_BDT = 10;
const BUS_MIN_FARE_BDT = 10;
const BUS_FARE_ROUNDING_BDT = 5;
const BUS_MIN_BILLABLE_KM_PER_STOP = 0.5;

// Candidate search limits and connector expansion.
const BASE_TRANSIT_CANDIDATE_LIMIT = 4;
const PURPOSEFUL_LONG_CONNECTOR_LIMIT = 2;
const ROUTE_USEFUL_CANDIDATE_LIMIT = 4;
const ROUTE_USEFUL_SOURCE_SCAN_LIMIT = 16;
const PURPOSEFUL_LONG_CONNECTOR_MIN_KM = 1.1;
const PURPOSEFUL_LONG_CONNECTOR_MAX_KM = 9;
const TRANSFER_SEARCH_PAIR_LIMIT = 8;
const TRANSIT_IMPORTANCE_SCORE_MULTIPLIER = 0.08;
const DIRECT_MATCH_CANDIDATE_BONUS = 20;

// Transfer and hybrid-route proximity limits.
const NEARBY_TRANSFER_MAX_KM = 0.45;
const METRO_BUS_TRANSFER_MAX_KM = 0.65;
const HYBRID_BRIDGE_STATION_LIMIT = 2;

// User-facing route notes/service windows.
const LONG_CONNECTOR_SHARED_TRANSPORT_NOTE =
  "Long connector may work better where local shared transport is available.";
const METRO_SERVICE_WINDOW_TEXT =
  "Weekdays & Sat/holidays: Uttara North 06:30-21:30, Motijheel 07:15-22:10 | Friday: Uttara North 15:00-21:00, Motijheel 15:20-21:40";

const SCORE_PROFILES = {
  balanced: {
    id: "balanced",
    label: "Best match",
    primaryReason: "Best overall balance",
    scoringReason:
      "Balanced score using time, fare, transfers, connector burden, detour, simplicity, and dataset confidence.",
    weights: {
      duration: 1,
      fare: 0.15,
      transfer: 16,
      connector: 5,
      rickshaw: 3,
      walk: 2,
      longRickshaw: 22,
      complexity: 2,
      detour: 18,
      confidence: 10,
      directBonus: 8,
      metroBonus: 4,
      purposefulLongConnectorBonus: 10,
    },
  },
  fastestPractical: {
    id: "fastest_practical",
    label: "Fastest practical",
    primaryReason: "Fastest practical option",
    scoringReason:
      "Fast score with guardrails for transfers, long connectors, detours, and route complexity.",
    weights: {
      duration: 1.35,
      fare: 0.05,
      transfer: 10,
      connector: 5,
      rickshaw: 3,
      walk: 1.5,
      longRickshaw: 24,
      complexity: 1.5,
      detour: 22,
      confidence: 8,
      directBonus: 4,
      metroBonus: 5,
      purposefulLongConnectorBonus: 14,
    },
  },
  lowestHassle: {
    id: "lowest_hassle",
    label: "Lowest hassle",
    primaryReason: "Simplest trip shape",
    scoringReason:
      "Hassle score prioritizing directness, short connectors, fewer steps, fewer transfers, and reliable dataset matches.",
    weights: {
      duration: 0.65,
      fare: 0.05,
      transfer: 28,
      connector: 8,
      rickshaw: 5,
      walk: 4,
      longRickshaw: 35,
      complexity: 5,
      detour: 16,
      confidence: 14,
      directBonus: 20,
      metroBonus: 8,
      purposefulLongConnectorBonus: 8,
    },
  },
  lowestFare: {
    id: "lowest_fare",
    label: "Lowest fare",
    primaryReason: "Lowest estimated fare",
    scoringReason:
      "Fare score using estimated fare first, with penalties for impractical transfers, connectors, and detours.",
    weights: {
      duration: 0.35,
      fare: 1,
      transfer: 12,
      connector: 4,
      rickshaw: 5,
      walk: 1,
      longRickshaw: 24,
      complexity: 2,
      detour: 12,
      confidence: 8,
      directBonus: 6,
      metroBonus: 2,
      purposefulLongConnectorBonus: 4,
    },
  },
} satisfies Record<string, ScoreProfile>;

// Runtime memoization. These are not tuning knobs.
const nearbyBusStopLabelsByMetroStationId = new Map<string, string[]>();
const directBusLegsCache = new Map<string, BusLeg[]>();

function roundDistanceKm(distanceKm: number) {
  return Math.round(distanceKm * 10) / 10;
}

function formatApproxFare(costBdt: number) {
  return `Approx. BDT ${Math.round(costBdt)}`;
}

function formatExactFare(costBdt: number) {
  return `BDT ${Math.round(costBdt)}`;
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function combineMetrics(parts: Array<Partial<RouteMetrics>>) {
  const distanceKm = parts.reduce(
    (sum, part) => sum + (part.distanceKm ?? 0),
    0,
  );
  const durationMinutes = parts.reduce(
    (sum, part) => sum + (part.durationMinutes ?? 0),
    0,
  );
  const costParts = parts
    .map((part) => part.costBdt)
    .filter((value): value is number => value !== undefined);
  const costBdt = costParts.length
    ? costParts.reduce((sum, value) => sum + value, 0)
    : undefined;

  return {
    estimatedDistanceKm:
      distanceKm > 0 ? roundDistanceKm(distanceKm) : undefined,
    estimatedDurationMinutes:
      durationMinutes > 0 ? Math.round(durationMinutes) : undefined,
    totalCost: costBdt,
  };
}

function confidencePenalty(route: RouteOption) {
  switch (route.confidence) {
    case "exact":
      return 0;
    case "verified":
      return 1;
    case "advisory":
      return 3;
  }
}

function routeEndpointCoordinates(route: RouteOption) {
  return {
    origin:
      route.mapPreview.originCoordinates ??
      route.boarding.coordinates ??
      findLabelCoordinates(route.boarding.label),
    destination:
      route.mapPreview.destinationCoordinates ??
      route.alighting.coordinates ??
      findLabelCoordinates(route.alighting.label),
  };
}

function getDetourRatio(route: RouteOption) {
  const totalDistance = route.estimatedDistanceKm;
  const { origin, destination } = routeEndpointCoordinates(route);

  if (!totalDistance || !origin || !destination) {
    return 1;
  }

  const directDistance = haversineDistanceKm(origin, destination);

  if (directDistance < 0.3) {
    return 1;
  }

  return Math.max(1, totalDistance / directDistance);
}

function analyzeRoute(route: RouteOption): RouteScoreBreakdown {
  const connectorSegments = route.segments.filter(
    (segment) => segment.connectorType,
  );
  const connectorDistanceKm = connectorSegments.reduce(
    (sum, segment) =>
      sum + (segment.connectorDistanceKm ?? segment.estimatedDistanceKm ?? 0),
    0,
  );
  const rickshawDistanceKm = connectorSegments
    .filter(
      (segment) => segment.mode === "rickshaw" || segment.mode === "ride_share",
    )
    .reduce(
      (sum, segment) =>
        sum + (segment.connectorDistanceKm ?? segment.estimatedDistanceKm ?? 0),
      0,
    );
  const walkDistanceKm = connectorSegments
    .filter((segment) => segment.mode === "walk")
    .reduce(
      (sum, segment) =>
        sum + (segment.connectorDistanceKm ?? segment.estimatedDistanceKm ?? 0),
      0,
    );

  return {
    durationMinutes: route.estimatedDurationMinutes ?? 999,
    fareBdt: route.totalCost ?? 999,
    transferCount: route.transferCount,
    connectorDistanceKm,
    rickshawDistanceKm,
    walkDistanceKm,
    longRickshawCount: connectorSegments.filter(
      (segment) => segment.connectorType === "long_rickshaw",
    ).length,
    segmentCount: route.segments.length,
    detourRatio: getDetourRatio(route),
    confidencePenalty: confidencePenalty(route),
  };
}

function connectorBurden(route: RouteOption): RouteOption["connectorBurden"] {
  const analysis = analyzeRoute(route);

  if (analysis.longRickshawCount > 0 || analysis.connectorDistanceKm > 4) {
    return "high";
  }

  if (analysis.connectorDistanceKm > 1.2 || analysis.transferCount > 0) {
    return "medium";
  }

  return "low";
}

function profileScore(route: RouteOption, profile: ScoreProfile) {
  const analysis = analyzeRoute(route);
  const detourPenalty = Math.max(0, analysis.detourRatio - 1.4);
  const walkPenalty = Math.max(0, analysis.walkDistanceKm - 0.6);
  const directBonus =
    route.transferCount === 0 ? profile.weights.directBonus : 0;
  const metroBonus =
    route.kind === "metro_direct" ? profile.weights.metroBonus : 0;
  const purposefulLongConnectorBonus =
    analysis.longRickshawCount > 0 && route.transferCount === 0
      ? profile.weights.purposefulLongConnectorBonus
      : 0;

  return (
    analysis.durationMinutes * profile.weights.duration +
    analysis.fareBdt * profile.weights.fare +
    analysis.transferCount * profile.weights.transfer +
    analysis.connectorDistanceKm * profile.weights.connector +
    analysis.rickshawDistanceKm * profile.weights.rickshaw +
    walkPenalty * profile.weights.walk +
    analysis.longRickshawCount * profile.weights.longRickshaw +
    Math.max(0, analysis.segmentCount - 1) * profile.weights.complexity +
    detourPenalty * profile.weights.detour +
    analysis.confidencePenalty * profile.weights.confidence -
    directBonus -
    metroBonus -
    purposefulLongConnectorBonus
  );
}

function scoreTieBreaker(left: RouteOption, right: RouteOption) {
  const leftDuration = left.estimatedDurationMinutes ?? Number.MAX_SAFE_INTEGER;
  const rightDuration =
    right.estimatedDurationMinutes ?? Number.MAX_SAFE_INTEGER;
  const leftCost = left.totalCost ?? Number.MAX_SAFE_INTEGER;
  const rightCost = right.totalCost ?? Number.MAX_SAFE_INTEGER;

  return (
    left.transferCount - right.transferCount ||
    leftDuration - rightDuration ||
    leftCost - rightCost ||
    left.id.localeCompare(right.id)
  );
}

function routeDiversityKey(route: RouteOption) {
  return [
    route.kind,
    route.serviceLabels.join("+"),
    normalizeTransitText(route.boarding.label),
    normalizeTransitText(route.alighting.label),
  ].join(":");
}

function routeServiceKey(route: RouteOption) {
  return (
    route.serviceLabels.join("+") || route.primaryServiceLabel || route.kind
  );
}

function mergeUniqueStrings(...groups: string[][]) {
  return Array.from(new Set(groups.flat().filter(Boolean)));
}

function diversityPenalty(route: RouteOption, selectedRoutes: RouteOption[]) {
  let penalty = 0;
  const key = routeDiversityKey(route);
  const serviceKey = routeServiceKey(route);

  for (const selected of selectedRoutes) {
    if (routeDiversityKey(selected) === key) {
      penalty += 40;
    }

    if (routeServiceKey(selected) === serviceKey) {
      penalty += 12;
    }

    if (selected.kind === route.kind) {
      penalty += 4;
    }
  }

  return penalty;
}

function profilesForOptimization(optimization: RouteOptimization) {
  if (optimization === "fastest") {
    return [
      SCORE_PROFILES.fastestPractical,
      SCORE_PROFILES.balanced,
      SCORE_PROFILES.lowestHassle,
    ];
  }

  if (optimization === "cheapest") {
    return [
      SCORE_PROFILES.lowestFare,
      SCORE_PROFILES.balanced,
      SCORE_PROFILES.lowestHassle,
    ];
  }

  return [
    SCORE_PROFILES.balanced,
    SCORE_PROFILES.fastestPractical,
    SCORE_PROFILES.lowestHassle,
  ];
}

function selectRouteForProfile(
  routes: RouteOption[],
  profile: ScoreProfile,
  selectedRoutes: RouteOption[],
) {
  return [...routes]
    .filter(
      (route) =>
        !selectedRoutes.some(
          (selected) => selected.pathSignature === route.pathSignature,
        ),
    )
    .sort((left, right) => {
      const leftScore =
        profileScore(left, profile) + diversityPenalty(left, selectedRoutes);
      const rightScore =
        profileScore(right, profile) + diversityPenalty(right, selectedRoutes);

      return leftScore - rightScore || scoreTieBreaker(left, right);
    })[0];
}

function annotateSurfaceRoute(route: RouteOption, profile: ScoreProfile) {
  const burden = connectorBurden(route);
  const analysis = analyzeRoute(route);

  return routeOptionSchema.parse({
    ...route,
    connectorBurden: burden,
    primaryReason: profile.primaryReason,
    scoringReason: profile.scoringReason,
    tradeoffs: dedupeStrings([
      ...route.tradeoffs,
      burden === "high" ? "High connector burden" : "",
      analysis.longRickshawCount > 0
        ? LONG_CONNECTOR_SHARED_TRANSPORT_NOTE
        : "",
      burden === "medium" ? "Moderate connector burden" : "",
      analysis.detourRatio > 1.8
        ? "Noticeable detour versus direct distance"
        : "",
      route.transferCount > 0
        ? `${route.transferCount} transfer to manage`
        : "",
    ]),
  });
}

function buildServiceWindowText(route: DhakaBusSeedRoute) {
  return (
    [route.openingTimeText, route.closingTimeText]
      .filter(Boolean)
      .join(" - ") || undefined
  );
}

function getBusDisplayName(route: DhakaBusSeedRoute) {
  return route.busLabelEn || route.busLabel;
}

function findBusStopCoordinates(label: string) {
  return getDhakaBusStopCoordinatesByLabel(label);
}

function findNearbyBusStopLabelsForMetroStation(stationId: string) {
  const cached = nearbyBusStopLabelsByMetroStationId.get(stationId);

  if (cached) {
    return cached;
  }

  const station = getMetroStationById(stationId);

  if (!station?.coordinates) {
    return [];
  }
  const stationCoordinates = station.coordinates;

  const labels = dhakaBusSeedStops
    .map((stop) => {
      const coordinates = getDhakaBusStopCoordinatesByLabel(stop.label);

      return coordinates
        ? {
            label: stop.label,
            distanceKm: haversineDistanceKm(stationCoordinates, coordinates),
            routeCount: stop.routeCount,
          }
        : null;
    })
    .filter(
      (
        item,
      ): item is { label: string; distanceKm: number; routeCount: number } =>
        Boolean(item && item.distanceKm <= METRO_BUS_TRANSFER_MAX_KM),
    )
    .sort(
      (left, right) =>
        left.distanceKm - right.distanceKm ||
        right.routeCount - left.routeCount,
    )
    .map((item) => item.label)
    .slice(0, 6);

  nearbyBusStopLabelsByMetroStationId.set(stationId, labels);

  return labels;
}

function findBusLegStopIndices(leg: BusLeg) {
  const boardingIndex = leg.route.stopLabels.findIndex(
    (label) =>
      normalizeTransitText(label) === normalizeTransitText(leg.boardingLabel),
  );

  if (boardingIndex < 0) {
    return null;
  }

  const alightingOffset = leg.route.stopLabels
    .slice(boardingIndex + 1)
    .findIndex(
      (label) =>
        normalizeTransitText(label) ===
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

export function estimateRickshawFareBdt(distanceKm: number) {
  if (distanceKm <= 0) {
    return undefined;
  }

  if (distanceKm <= RICKSHAW_BASE_DISTANCE_KM) {
    return RICKSHAW_BASE_FARE_BDT;
  }

  return (
    Math.ceil(
      (RICKSHAW_BASE_FARE_BDT +
        (distanceKm - RICKSHAW_BASE_DISTANCE_KM) *
          RICKSHAW_FARE_PER_EXTRA_KM_BDT) /
        RICKSHAW_FARE_ROUNDING_BDT,
    ) * RICKSHAW_FARE_ROUNDING_BDT
  );
}

function estimateBusFareBdt(distanceKm: number, stopCount: number) {
  return Math.max(
    BUS_MIN_FARE_BDT,
    Math.ceil(
      (Math.max(distanceKm, stopCount * BUS_MIN_BILLABLE_KM_PER_STOP) *
        BUS_FARE_PER_KM_BDT) /
        BUS_FARE_ROUNDING_BDT,
    ) * BUS_FARE_ROUNDING_BDT,
  );
}

function estimateBusDurationMinutes(distanceKm: number, stopCount: number) {
  return Math.max(
    5,
    Math.round(
      (distanceKm / BUS_SPEED_KMPH) * 60 + stopCount * BUS_STOP_DELAY_MINUTES,
    ),
  );
}

function estimateMetroDurationMinutes(
  distanceKm: number,
  stationCount: number,
) {
  return Math.max(
    3,
    Math.round(
      (distanceKm / METRO_SPEED_KMPH) * 60 +
        stationCount * METRO_STATION_DELAY_MINUTES,
    ),
  );
}

export function estimateBusLegDistanceKm(leg: BusLeg) {
  const indices = findBusLegStopIndices(leg);

  if (!indices) {
    return Math.max(1.5, leg.stopCount * BUS_STOP_SPACING_KM);
  }

  const coordinates = leg.route.stopLabels
    .slice(indices.boardingIndex, indices.alightingIndex + 1)
    .map(findBusStopCoordinates)
    .filter((coordinate): coordinate is [number, number] =>
      Boolean(coordinate),
    );

  if (coordinates.length >= 2) {
    return Math.max(1.5, sumCoordinateDistanceKm(coordinates));
  }

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

export function estimateMetroDistanceKm(
  originStationId: string,
  destinationStationId: string,
  stationCount: number,
) {
  const origin = getMetroStationById(originStationId);
  const destination = getMetroStationById(destinationStationId);

  if (origin?.coordinates && destination?.coordinates) {
    const coordinates = findMetroShapeCoordinates(
      origin.coordinates,
      destination.coordinates,
    );

    if (coordinates.length >= 2) {
      return Math.max(1, sumCoordinateDistanceKm(coordinates));
    }
  }

  return Math.max(1, stationCount * METRO_STATION_SPACING_KM);
}

function createAccessLeg(
  resolution: ResolvedTransitInput,
  point: TransitPoint,
  role: "origin" | "destination",
): AccessLeg | null {
  if (
    !resolution.place?.coordinates ||
    !point.coordinates ||
    resolution.matchedPointIds.includes(point.id)
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

  const isWalk = distanceKm <= ACCESS_WALK_MAX_KM;
  const mode: TransportMode = isWalk ? "walk" : "rickshaw";
  const durationMinutes = Math.max(
    isWalk ? 4 : 6,
    Math.round(
      (distanceKm / (isWalk ? WALK_SPEED_KMPH : RICKSHAW_SPEED_KMPH)) * 60,
    ),
  );
  const costBdt = isWalk ? undefined : estimateRickshawFareBdt(distanceKm);
  const transitLabel = point.canonicalBusStopLabel ?? point.name;

  return {
    connectorType: isWalk
      ? "walk"
      : distanceKm <= LONG_RICKSHAW_MIN_KM
        ? "rickshaw"
        : "long_rickshaw",
    mode,
    distanceKm,
    durationMinutes,
    costBdt,
    startLocation: role === "origin" ? resolution.displayName : transitLabel,
    endLocation: role === "origin" ? transitLabel : resolution.displayName,
  };
}

function buildAccessSegment(leg: AccessLeg): RouteSegment {
  return {
    mode: leg.mode,
    instruction: leg.mode === "walk" ? "Walk connector" : "Rickshaw connector",
    startLocation: leg.startLocation,
    endLocation: leg.endLocation,
    note:
      leg.connectorType === "long_rickshaw"
        ? LONG_CONNECTOR_SHARED_TRANSPORT_NOTE
        : undefined,
    fareText: leg.costBdt ? formatApproxFare(leg.costBdt) : undefined,
    estimatedDistanceKm: roundDistanceKm(leg.distanceKm),
    estimatedDurationMinutes: leg.durationMinutes,
    connectorType: leg.connectorType,
    connectorDistanceKm: roundDistanceKm(leg.distanceKm),
    connectorFare: leg.costBdt,
    distanceSource: "local_estimate",
    pricingConfidence: leg.costBdt ? "estimated" : undefined,
    costLowBdt: leg.costBdt,
    costHighBdt: leg.costBdt,
  };
}

function accessMetrics(leg: AccessLeg | null): Partial<RouteMetrics> {
  return leg
    ? {
        distanceKm: leg.distanceKm,
        durationMinutes: leg.durationMinutes,
        costBdt: leg.costBdt,
      }
    : {};
}

function combineTripMetrics(
  origin: TransitCandidate,
  destination: TransitCandidate,
  coreMetrics: Partial<RouteMetrics>,
) {
  return combineMetrics([
    accessMetrics(origin.accessLeg),
    coreMetrics,
    accessMetrics(destination.accessLeg),
  ]);
}

function withAccessSegments(
  origin: TransitCandidate,
  destination: TransitCandidate,
  coreSegments: RouteSegment[],
) {
  return [
    ...(origin.accessLeg ? [buildAccessSegment(origin.accessLeg)] : []),
    ...coreSegments,
    ...(destination.accessLeg
      ? [buildAccessSegment(destination.accessLeg)]
      : []),
  ];
}

function getRoadDistanceKm(route: RoadSnappedRoute) {
  return route.distanceMeters !== undefined
    ? route.distanceMeters / 1000
    : undefined;
}

function estimateRoadDurationMinutes(
  segment: RouteSegment,
  distanceKm: number,
) {
  if (segment.mode === "bus") {
    return estimateBusDurationMinutes(distanceKm, segment.stopCount ?? 0);
  }

  if (segment.mode === "walk") {
    return Math.max(4, Math.round((distanceKm / WALK_SPEED_KMPH) * 60));
  }

  if (segment.mode === "rickshaw" || segment.mode === "ride_share") {
    return Math.max(6, Math.round((distanceKm / RICKSHAW_SPEED_KMPH) * 60));
  }

  return segment.estimatedDurationMinutes;
}

function applyRoadMetricsToSegment(
  segment: RouteSegment,
  route: RoadSnappedRoute,
) {
  const distanceKm = getRoadDistanceKm(route);

  if (distanceKm === undefined || segment.mode === "metro") {
    return segment;
  }

  const roundedDistanceKm = roundDistanceKm(distanceKm);
  const durationMinutes = estimateRoadDurationMinutes(segment, distanceKm);

  if (segment.mode === "bus") {
    const fare = estimateBusFareBdt(distanceKm, segment.stopCount ?? 0);

    return {
      ...segment,
      fareText: formatApproxFare(fare),
      estimatedDistanceKm: roundedDistanceKm,
      estimatedDurationMinutes: durationMinutes,
      distanceSource: "road_api" as const,
      pricingConfidence: "regulated_estimate" as const,
      costLowBdt: fare,
      costHighBdt: fare,
    };
  }

  if (segment.mode === "rickshaw" || segment.mode === "ride_share") {
    const fare = estimateRickshawFareBdt(distanceKm);

    return {
      ...segment,
      fareText: fare ? formatApproxFare(fare) : undefined,
      estimatedDistanceKm: roundedDistanceKm,
      estimatedDurationMinutes: durationMinutes,
      distanceSource: "road_api" as const,
      pricingConfidence: fare ? ("estimated" as const) : undefined,
      connectorDistanceKm: segment.connectorType
        ? roundedDistanceKm
        : segment.connectorDistanceKm,
      connectorFare: fare,
      costLowBdt: fare,
      costHighBdt: fare,
    };
  }

  if (segment.mode === "walk") {
    return {
      ...segment,
      estimatedDistanceKm: roundedDistanceKm,
      estimatedDurationMinutes: durationMinutes,
      distanceSource: "road_api" as const,
      connectorDistanceKm: segment.connectorType
        ? roundedDistanceKm
        : segment.connectorDistanceKm,
    };
  }

  return segment;
}

function metricsFromSegments(segments: RouteSegment[]) {
  return combineMetrics(
    segments.map((segment) => ({
      distanceKm: segment.estimatedDistanceKm,
      durationMinutes: segment.estimatedDurationMinutes,
      costBdt: segment.costLowBdt,
    })),
  );
}

function isTransitDatasetPoint(point: TransitPoint) {
  return point.type === "bus_stop" || point.type === "metro_station";
}

function transitPointImportance(point: TransitPoint) {
  if (point.type === "metro_station") {
    return 12;
  }

  const routeCount = point.busStopLabels.reduce((maxRouteCount, label) => {
    const stop = getDhakaBusStopByLabel(label);

    return Math.max(maxRouteCount, stop?.routeCount ?? 0);
  }, 0);

  return Math.min(12, routeCount);
}

function dedupeTransitCandidates(candidates: TransitCandidate[]) {
  const seen = new Set<string>();

  return candidates.filter((candidate) => {
    const key = candidate.point.id;

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

function buildCandidate(
  point: TransitPoint,
  resolution: ResolvedTransitInput,
  role: "origin" | "destination",
) {
  const accessLeg = createAccessLeg(resolution, point, role);
  const connectorScore = accessLeg
    ? accessLeg.distanceKm + accessLeg.durationMinutes / 60
    : 0;
  const importanceScore = transitPointImportance(point);
  const matchBonus =
    resolution.matchedPointIds.includes(point.id) ||
    (point.metroStationId
      ? resolution.matchedPointIds.includes(point.metroStationId)
      : false) ||
    (point.canonicalBusStopId
      ? resolution.matchedPointIds.includes(point.canonicalBusStopId)
      : false)
      ? DIRECT_MATCH_CANDIDATE_BONUS
      : 0;
  const score =
    connectorScore -
    importanceScore * TRANSIT_IMPORTANCE_SCORE_MULTIPLIER -
    matchBonus;

  return { point, accessLeg, score } satisfies TransitCandidate;
}

function findPurposefulLongConnectorCandidates(
  candidates: TransitCandidate[],
  selected: TransitCandidate[],
) {
  const selectedIds = new Set(selected.map((candidate) => candidate.point.id));

  return candidates
    .filter((candidate) => {
      const distanceKm = candidate.accessLeg?.distanceKm;

      return (
        distanceKm !== undefined &&
        distanceKm >= PURPOSEFUL_LONG_CONNECTOR_MIN_KM &&
        distanceKm <= PURPOSEFUL_LONG_CONNECTOR_MAX_KM &&
        !selectedIds.has(candidate.point.id) &&
        transitPointImportance(candidate.point) >= 2
      );
    })
    .sort((left, right) => {
      const leftDistance =
        left.accessLeg?.distanceKm ?? Number.MAX_SAFE_INTEGER;
      const rightDistance =
        right.accessLeg?.distanceKm ?? Number.MAX_SAFE_INTEGER;
      const leftStrategicScore =
        transitPointImportance(left.point) * 1.4 - leftDistance;
      const rightStrategicScore =
        transitPointImportance(right.point) * 1.4 - rightDistance;

      return (
        rightStrategicScore - leftStrategicScore || left.score - right.score
      );
    })
    .slice(0, PURPOSEFUL_LONG_CONNECTOR_LIMIT);
}

function findRouteUsefulCandidates(
  sourceCandidates: TransitCandidate[],
  targetCandidates: TransitCandidate[],
  selected: TransitCandidate[],
) {
  const selectedIds = new Set(selected.map((candidate) => candidate.point.id));
  const targetBusLabels = targetCandidates.flatMap(
    (candidate) => candidate.point.busStopLabels,
  );

  if (!targetBusLabels.length) {
    return [];
  }

  return sourceCandidates
    .filter(
      (candidate) =>
        candidate.point.busStopLabels.length > 0 &&
        !selectedIds.has(candidate.point.id) &&
        cachedFindDirectBusLegs(candidate.point.busStopLabels, targetBusLabels)
          .length > 0,
    )
    .sort((left, right) => {
      const leftDistance =
        left.accessLeg?.distanceKm ?? Number.MAX_SAFE_INTEGER;
      const rightDistance =
        right.accessLeg?.distanceKm ?? Number.MAX_SAFE_INTEGER;

      return (
        leftDistance - rightDistance ||
        right.point.busStopLabels.length - left.point.busStopLabels.length
      );
    })
    .slice(0, ROUTE_USEFUL_CANDIDATE_LIMIT);
}

function findRouteUsefulDestinationCandidates(
  originCandidates: TransitCandidate[],
  destinationCandidates: TransitCandidate[],
  selected: TransitCandidate[],
) {
  const selectedIds = new Set(selected.map((candidate) => candidate.point.id));
  const originBusLabels = originCandidates.flatMap(
    (candidate) => candidate.point.busStopLabels,
  );

  if (!originBusLabels.length) {
    return [];
  }

  return destinationCandidates
    .filter(
      (candidate) =>
        candidate.point.busStopLabels.length > 0 &&
        !selectedIds.has(candidate.point.id) &&
        cachedFindDirectBusLegs(originBusLabels, candidate.point.busStopLabels)
          .length > 0,
    )
    .sort((left, right) => {
      const leftDistance =
        left.accessLeg?.distanceKm ?? Number.MAX_SAFE_INTEGER;
      const rightDistance =
        right.accessLeg?.distanceKm ?? Number.MAX_SAFE_INTEGER;

      return (
        leftDistance - rightDistance ||
        transitPointImportance(right.point) - transitPointImportance(left.point)
      );
    })
    .slice(0, ROUTE_USEFUL_CANDIDATE_LIMIT);
}

function buildTransitCandidatePool(
  resolution: ResolvedTransitInput,
  role: "origin" | "destination",
) {
  const transitCandidates = resolution.candidates.filter(isTransitDatasetPoint);
  const matchedTransitCandidates = transitCandidates.filter(
    (point) =>
      resolution.matchedPointIds.includes(point.id) ||
      (point.metroStationId
        ? resolution.matchedPointIds.includes(point.metroStationId)
        : false) ||
      (point.canonicalBusStopId
        ? resolution.matchedPointIds.includes(point.canonicalBusStopId)
        : false),
  );
  const basePool = matchedTransitCandidates.length
    ? dedupeStrings([
        ...matchedTransitCandidates.map((point) => point.id),
        ...transitCandidates.map((point) => point.id),
      ])
        .map((id) => transitCandidates.find((point) => point.id === id))
        .filter((point): point is TransitPoint => Boolean(point))
    : transitCandidates;
  return dedupeTransitCandidates(
    basePool.map((point) => buildCandidate(point, resolution, role)),
  ).sort(
    (left, right) =>
      left.score - right.score ||
      left.point.name.localeCompare(right.point.name),
  );
}

function selectTransitCandidates(allCandidates: TransitCandidate[]) {
  const baseCandidates = allCandidates.slice(0, BASE_TRANSIT_CANDIDATE_LIMIT);
  const purposefulLongConnectors = findPurposefulLongConnectorCandidates(
    allCandidates,
    baseCandidates,
  );

  return dedupeTransitCandidates([
    ...baseCandidates,
    ...purposefulLongConnectors,
  ]);
}

function buildTripTransitCandidates(
  originResolution: ResolvedTransitInput,
  destinationResolution: ResolvedTransitInput,
) {
  const originPool = buildTransitCandidatePool(originResolution, "origin");
  const destinationPool = buildTransitCandidatePool(
    destinationResolution,
    "destination",
  );
  const originBase = selectTransitCandidates(originPool);
  const destinationBase = selectTransitCandidates(destinationPool);
  const routeUsefulOrigins = findRouteUsefulCandidates(
    originPool.slice(0, ROUTE_USEFUL_SOURCE_SCAN_LIMIT),
    destinationPool.slice(0, ROUTE_USEFUL_SOURCE_SCAN_LIMIT),
    originBase,
  );
  const routeUsefulDestinations = findRouteUsefulDestinationCandidates(
    originPool.slice(0, ROUTE_USEFUL_SOURCE_SCAN_LIMIT),
    destinationPool.slice(0, ROUTE_USEFUL_SOURCE_SCAN_LIMIT),
    destinationBase,
  );

  return {
    originCandidates: dedupeTransitCandidates([
      ...originBase,
      ...routeUsefulOrigins,
    ]),
    destinationCandidates: dedupeTransitCandidates([
      ...destinationBase,
      ...routeUsefulDestinations,
    ]),
  };
}

function makeStopReference(
  label: string,
  type: "bus_stop" | "metro_station" | "hub" = "bus_stop",
): RouteStopReference {
  const busPoint =
    type === "bus_stop" ? getBusStopPointByLabel(label) : undefined;
  const metroStation =
    type === "metro_station"
      ? DHAKA_METRO_STATIONS.find((station) => station.name === label)
      : undefined;

  return {
    id: busPoint?.id ?? metroStation?.id,
    label,
    type,
    coordinates: busPoint?.coordinates ?? metroStation?.coordinates,
  };
}

function makePointReference(point: TransitPoint): RouteStopReference {
  return {
    id: point.id,
    label: point.name,
    type: point.type,
    canonicalId: point.canonicalBusStopId ?? point.metroStationId,
    canonicalLabel: point.canonicalBusStopLabel,
    coordinates: point.coordinates,
  };
}

function createPathSignature(
  route: Pick<
    RouteOption,
    "kind" | "boarding" | "alighting" | "transferStops" | "segments"
  > & { mapPreview?: RouteMapPreview },
) {
  return [
    route.kind,
    normalizeTransitText(route.boarding.label),
    normalizeTransitText(route.alighting.label),
    route.transferStops
      .map((stop) => normalizeTransitText(stop.label))
      .join(">"),
    route.segments
      .map(
        (segment) =>
          `${segment.mode}:${normalizeTransitText(segment.startLocation)}:${normalizeTransitText(segment.endLocation)}`,
      )
      .join("|"),
  ].join("::");
}

export { createPathSignature };

function applyTripEndpoints(
  route: RouteOption,
  payload: CalculateRouteRequest,
) {
  return routeOptionSchema.parse({
    ...route,
    mapPreview: buildMapPreview(
      payload.origin.name,
      payload.destination.name,
      route.segments,
      payload.origin.coordinates ?? route.mapPreview.originCoordinates,
      payload.destination.coordinates ??
        route.mapPreview.destinationCoordinates,
    ),
  });
}

async function applyRoadSnappedMapPreview(route: RouteOption) {
  const lineResults = await Promise.all(
    route.mapPreview.lines.map(async (line) => {
      const snappedRoute = await getRoadSnappedRoute(
        line.mode,
        line.coordinates,
      );

      return {
        line,
        snappedRoute,
      };
    }),
  );
  const lines = lineResults.map(
    ({ line, snappedRoute }) =>
      ({
        ...line,
        coordinates: snappedRoute?.coordinates ?? line.coordinates,
        confidence:
          line.mode === "metro" || snappedRoute ? "exact" : line.confidence,
      }) satisfies RouteMapLine,
  );
  const metricQueue = [...lineResults];
  const segments = route.segments.map((segment) => {
    const resultIndex = metricQueue.findIndex(
      ({ line, snappedRoute }) =>
        snappedRoute &&
        line.mode === segment.mode &&
        line.label === segment.instruction,
    );

    if (resultIndex < 0) {
      return segment;
    }

    const [result] = metricQueue.splice(resultIndex, 1);

    return result?.snappedRoute
      ? applyRoadMetricsToSegment(segment, result.snappedRoute)
      : segment;
  });
  const metrics = metricsFromSegments(segments);
  const fareText =
    metrics.totalCost !== undefined
      ? route.fareType === "exact"
        ? formatExactFare(metrics.totalCost)
        : formatApproxFare(metrics.totalCost)
      : "Fare varies";

  return routeOptionSchema.parse({
    ...route,
    fareText,
    totalCost: metrics.totalCost,
    totalCostLowBdt: metrics.totalCost,
    totalCostHighBdt: metrics.totalCost,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    highlights: dedupeStrings([
      metrics.estimatedDurationMinutes
        ? `${metrics.estimatedDurationMinutes} min`
        : "",
      metrics.totalCost !== undefined
        ? `BDT ${Math.round(metrics.totalCost)}`
        : "",
      route.transferCount === 0
        ? "No transfers"
        : `${route.transferCount} transfer`,
    ]),
    segments,
    mapPreview: {
      ...route.mapPreview,
      lines,
    },
  });
}

function addMapPoint(
  points: RouteMapPoint[],
  label: string,
  coordinates: [number, number] | undefined,
  role: RouteMapPoint["role"],
) {
  if (
    !coordinates ||
    points.some((point) => point.label === label && point.role === role)
  ) {
    return;
  }

  points.push({ label, coordinates, role });
}

function findMetroSegmentCoordinates(startLabel: string, endLabel: string) {
  const start = DHAKA_METRO_STATIONS.find(
    (station) => station.name === startLabel,
  );
  const end = DHAKA_METRO_STATIONS.find((station) => station.name === endLabel);

  if (!start?.coordinates || !end?.coordinates) {
    return null;
  }

  return findMetroShapeCoordinates(start.coordinates, end.coordinates);
}

function findMetroShapeCoordinates(
  startCoordinates: [number, number],
  endCoordinates: [number, number],
) {
  const startIndex = findNearestShapeIndex(
    startCoordinates,
    DHAKA_METRO_LINE_6_SHAPE,
  );
  const endIndex = findNearestShapeIndex(
    endCoordinates,
    DHAKA_METRO_LINE_6_SHAPE,
  );
  const [from, to] = [startIndex, endIndex].sort((left, right) => left - right);
  const coordinates = DHAKA_METRO_LINE_6_SHAPE.slice(from, to + 1);

  return startIndex <= endIndex ? coordinates : [...coordinates].reverse();
}

function findNearestShapeIndex(
  coordinates: [number, number],
  shape: [number, number][],
) {
  let nearestIndex = 0;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const [index, shapeCoordinate] of shape.entries()) {
    const distance = haversineDistanceKm(coordinates, shapeCoordinate);

    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestIndex = index;
    }
  }

  return nearestIndex;
}

function getSegmentCoordinates(
  segment: RouteSegment,
  endpointCoordinates: Map<string, [number, number]>,
) {
  const start =
    endpointCoordinates.get(segment.startLocation) ??
    findLabelCoordinates(segment.startLocation);
  const end =
    endpointCoordinates.get(segment.endLocation) ??
    findLabelCoordinates(segment.endLocation);
  const fallback = start && end ? [start, end] : [];

  if (segment.mode === "metro") {
    return (
      findMetroSegmentCoordinates(segment.startLocation, segment.endLocation) ??
      fallback
    );
  }

  return fallback;
}

function buildMapPreview(
  originLabel: string,
  destinationLabel: string,
  segments: RouteSegment[],
  originCoordinates?: [number, number],
  destinationCoordinates?: [number, number],
): RouteMapPreview {
  const points: RouteMapPoint[] = [];
  const lines: RouteMapLine[] = [];
  const endpointCoordinates = new Map<string, [number, number]>();
  const firstSegment = segments[0];
  const lastSegment = segments.at(-1);

  if (originCoordinates) {
    endpointCoordinates.set(originLabel, originCoordinates);

    if (firstSegment) {
      endpointCoordinates.set(firstSegment.startLocation, originCoordinates);
    }
  }

  if (destinationCoordinates) {
    endpointCoordinates.set(destinationLabel, destinationCoordinates);

    if (lastSegment) {
      endpointCoordinates.set(lastSegment.endLocation, destinationCoordinates);
    }
  }

  addMapPoint(points, originLabel, originCoordinates, "origin");
  addMapPoint(points, destinationLabel, destinationCoordinates, "destination");

  for (const segment of segments) {
    const coordinates = getSegmentCoordinates(segment, endpointCoordinates);
    const start = coordinates[0];
    const end = coordinates.at(-1);

    addMapPoint(points, segment.startLocation, start, "stop");
    addMapPoint(points, segment.endLocation, end, "stop");

    if (coordinates.length >= 2) {
      lines.push({
        mode: segment.mode,
        label: segment.instruction,
        coordinates,
        confidence: segment.mode === "metro" ? "exact" : "estimated",
      });
    }
  }

  return {
    originLabel,
    destinationLabel,
    originQuery: originLabel,
    destinationQuery: destinationLabel,
    originCoordinates: originCoordinates ?? findLabelCoordinates(originLabel),
    destinationCoordinates:
      destinationCoordinates ?? findLabelCoordinates(destinationLabel),
    points,
    lines,
  };
}

function findLabelCoordinates(label: string) {
  return (
    getDhakaBusStopCoordinatesByLabel(label) ??
    DHAKA_METRO_STATIONS.find((station) => station.name === label)?.coordinates
  );
}

function finalizeRoute(
  route: Omit<RouteOption, "pathSignature" | "highlights" | "tradeoffs">,
): RouteOption {
  const pathSignature = createPathSignature(route);

  return routeOptionSchema.parse({
    ...route,
    pathSignature,
    highlights: dedupeStrings([
      route.estimatedDurationMinutes
        ? `${route.estimatedDurationMinutes} min`
        : "",
      route.totalCost !== undefined ? `BDT ${Math.round(route.totalCost)}` : "",
      route.transferCount === 0
        ? "No transfers"
        : `${route.transferCount} transfer`,
    ]),
    tradeoffs: dedupeStrings([
      route.transferCount > 0
        ? `${route.transferCount} transfer to manage`
        : "",
    ]),
  });
}

function findDirectBusLegs(
  originLabels: string[],
  destinationLabels: string[],
) {
  const legs: BusLeg[] = [];

  for (const route of dhakaBusSeedRoutes) {
    const boardingIndex = route.stopLabels.findIndex((label) =>
      originLabels.some(
        (originLabel) =>
          normalizeTransitText(originLabel) === normalizeTransitText(label),
      ),
    );
    const alightingOffset = route.stopLabels
      .slice(boardingIndex + 1)
      .findIndex((label) =>
        destinationLabels.some(
          (destinationLabel) =>
            normalizeTransitText(destinationLabel) ===
            normalizeTransitText(label),
        ),
      );
    const alightingIndex =
      alightingOffset >= 0 ? boardingIndex + alightingOffset + 1 : -1;

    if (boardingIndex >= 0 && alightingIndex > boardingIndex) {
      legs.push({
        route,
        boardingLabel: route.stopLabels[boardingIndex]!,
        alightingLabel: route.stopLabels[alightingIndex]!,
        stopCount: alightingIndex - boardingIndex,
        serviceWindowText: buildServiceWindowText(route),
      });
    }
  }

  return legs.slice(0, 8);
}

function cachedFindDirectBusLegs(
  originLabels: string[],
  destinationLabels: string[],
) {
  const key = [
    originLabels.map(normalizeTransitText).sort().join("|"),
    destinationLabels.map(normalizeTransitText).sort().join("|"),
  ].join("->");
  const cached = directBusLegsCache.get(key);

  if (cached) {
    return cached;
  }

  const legs = findDirectBusLegs(originLabels, destinationLabels);

  directBusLegsCache.set(key, legs);

  return legs;
}

function findSecondRouteTransferMatches(
  transferLabel: string,
  secondRoute: DhakaBusSeedRoute,
  destinationIndex: number,
) {
  const normalizedTransferLabel = normalizeTransitText(transferLabel);
  const transferCoordinates = findBusStopCoordinates(transferLabel);
  const matches: Array<{
    label: string;
    index: number;
    walkDistanceKm?: number;
    walkDurationMinutes?: number;
  }> = [];

  for (let index = 0; index < destinationIndex; index += 1) {
    const secondRouteLabel = secondRoute.stopLabels[index]!;

    if (normalizeTransitText(secondRouteLabel) === normalizedTransferLabel) {
      matches.push({
        label: secondRouteLabel,
        index,
        walkDistanceKm: 0,
        walkDurationMinutes: TRANSFER_BUFFER_MINUTES,
      });
      continue;
    }

    const secondRouteCoordinates = findBusStopCoordinates(secondRouteLabel);

    if (!transferCoordinates || !secondRouteCoordinates) {
      continue;
    }

    const walkDistanceKm = haversineDistanceKm(
      transferCoordinates,
      secondRouteCoordinates,
    );

    if (walkDistanceKm <= NEARBY_TRANSFER_MAX_KM) {
      matches.push({
        label: secondRouteLabel,
        index,
        walkDistanceKm,
        walkDurationMinutes: Math.max(
          TRANSFER_BUFFER_MINUTES,
          Math.round((walkDistanceKm / WALK_SPEED_KMPH) * 60) + 4,
        ),
      });
    }
  }

  return matches.sort(
    (left, right) => (left.walkDistanceKm ?? 0) - (right.walkDistanceKm ?? 0),
  );
}

function findTransferBusLegs(
  originLabels: string[],
  destinationLabels: string[],
) {
  const transfers: BusTransfer[] = [];
  const seenTransfers = new Set<string>();
  const normalizedDestinationLabels = new Set(
    destinationLabels.map(normalizeTransitText),
  );

  for (const firstRoute of dhakaBusSeedRoutes) {
    const boardingIndex = firstRoute.stopLabels.findIndex((label) =>
      originLabels.some(
        (originLabel) =>
          normalizeTransitText(originLabel) === normalizeTransitText(label),
      ),
    );

    if (boardingIndex < 0) {
      continue;
    }

    for (const secondRoute of dhakaBusSeedRoutes) {
      if (firstRoute.id === secondRoute.id) {
        continue;
      }
      const candidateDestinationIndices = secondRoute.stopLabels
        .map((label, index) => ({ label, index }))
        .filter(
          ({ label, index }) =>
            index > 0 &&
            normalizedDestinationLabels.has(normalizeTransitText(label)),
        );

      if (!candidateDestinationIndices.length) {
        continue;
      }

      for (
        let transferIndex = boardingIndex + 1;
        transferIndex < firstRoute.stopLabels.length;
        transferIndex += 1
      ) {
        const transferLabel = firstRoute.stopLabels[transferIndex]!;
        let addedTransferForStop = false;

        for (const { index: destinationIndex } of candidateDestinationIndices) {
          const transferMatches = findSecondRouteTransferMatches(
            transferLabel,
            secondRoute,
            destinationIndex,
          );
          const transferMatch = transferMatches[0];

          if (!transferMatch) {
            continue;
          }

          const key = [
            firstRoute.id,
            secondRoute.id,
            normalizeTransitText(transferLabel),
            normalizeTransitText(transferMatch.label),
            normalizeTransitText(secondRoute.stopLabels[destinationIndex]!),
          ].join(":");

          if (seenTransfers.has(key)) {
            continue;
          }

          seenTransfers.add(key);
          transfers.push({
            transferLabel: transferMatch.walkDistanceKm
              ? `${transferLabel} to ${transferMatch.label}`
              : transferLabel,
            transferWalkDistanceKm: transferMatch.walkDistanceKm,
            transferWalkDurationMinutes: transferMatch.walkDurationMinutes,
            firstLeg: {
              route: firstRoute,
              boardingLabel: firstRoute.stopLabels[boardingIndex]!,
              alightingLabel: transferLabel,
              stopCount: transferIndex - boardingIndex,
              serviceWindowText: buildServiceWindowText(firstRoute),
            },
            secondLeg: {
              route: secondRoute,
              boardingLabel: transferMatch.label,
              alightingLabel: secondRoute.stopLabels[destinationIndex]!,
              stopCount: destinationIndex - transferMatch.index,
              serviceWindowText: buildServiceWindowText(secondRoute),
            },
          });
          addedTransferForStop = true;
          break;
        }

        if (addedTransferForStop) {
          break;
        }

        if (transfers.length >= 24) {
          break;
        }
      }
    }
  }

  return transfers.slice(0, 8);
}

function createDirectBusRoute(
  leg: BusLeg,
  origin: TransitCandidate,
  destination: TransitCandidate,
) {
  const busName = getBusDisplayName(leg.route);
  const distanceKm = estimateBusLegDistanceKm(leg);
  const durationMinutes = estimateBusDurationMinutes(distanceKm, leg.stopCount);
  const fare = estimateBusFareBdt(distanceKm, leg.stopCount);
  const metrics = combineTripMetrics(origin, destination, {
    distanceKm,
    durationMinutes,
    costBdt: fare,
  });
  const segments = withAccessSegments(origin, destination, [
    {
      mode: "bus",
      instruction: `Board ${busName}`,
      startLocation: leg.boardingLabel,
      endLocation: leg.alightingLabel,
      note: "Bus route verified from the Dhaka bus stop-order dataset.",
      serviceWindowText: leg.serviceWindowText,
      fareText: formatApproxFare(fare),
      estimatedDistanceKm: roundDistanceKm(distanceKm),
      estimatedDurationMinutes: durationMinutes,
      stopCount: leg.stopCount,
      distanceSource: "local_estimate",
      pricingConfidence: "regulated_estimate",
      costLowBdt: fare,
      costHighBdt: fare,
    },
  ]);

  return finalizeRoute({
    id: `${leg.route.id}-${normalizeTransitText(leg.boardingLabel)}-${normalizeTransitText(leg.alightingLabel)}`,
    kind: "bus_direct",
    confidence: "verified",
    summary: `${busName} direct`,
    fareType: "advisory",
    fareText:
      metrics.totalCost !== undefined
        ? formatApproxFare(metrics.totalCost)
        : "Fare varies",
    totalCost: metrics.totalCost,
    totalCostLowBdt: metrics.totalCost,
    totalCostHighBdt: metrics.totalCost,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    serviceWindowText: leg.serviceWindowText,
    stopCount: leg.stopCount,
    transferCount: 0,
    boarding: makeStopReference(leg.boardingLabel),
    alighting: makeStopReference(leg.alightingLabel),
    transferStops: [],
    serviceLabels: [busName],
    primaryServiceLabel: busName,
    segments,
    mapPreview: buildMapPreview(
      leg.boardingLabel,
      leg.alightingLabel,
      segments,
    ),
    advisories: [],
  });
}

function createTransferBusRoute(
  transfer: BusTransfer,
  origin: TransitCandidate,
  destination: TransitCandidate,
) {
  const firstBusName = getBusDisplayName(transfer.firstLeg.route);
  const secondBusName = getBusDisplayName(transfer.secondLeg.route);
  const firstDistanceKm = estimateBusLegDistanceKm(transfer.firstLeg);
  const secondDistanceKm = estimateBusLegDistanceKm(transfer.secondLeg);
  const firstDurationMinutes = estimateBusDurationMinutes(
    firstDistanceKm,
    transfer.firstLeg.stopCount,
  );
  const secondDurationMinutes = estimateBusDurationMinutes(
    secondDistanceKm,
    transfer.secondLeg.stopCount,
  );
  const firstFare = estimateBusFareBdt(
    firstDistanceKm,
    transfer.firstLeg.stopCount,
  );
  const secondFare = estimateBusFareBdt(
    secondDistanceKm,
    transfer.secondLeg.stopCount,
  );
  const totalFare = firstFare + secondFare;
  const transferDurationMinutes =
    transfer.transferWalkDurationMinutes ?? TRANSFER_BUFFER_MINUTES;
  const metrics = combineMetrics([
    accessMetrics(origin.accessLeg),
    {
      distanceKm: firstDistanceKm,
      durationMinutes: firstDurationMinutes,
      costBdt: firstFare,
    },
    {
      distanceKm: transfer.transferWalkDistanceKm,
      durationMinutes: transferDurationMinutes,
    },
    {
      distanceKm: secondDistanceKm,
      durationMinutes: secondDurationMinutes,
      costBdt: secondFare,
    },
    accessMetrics(destination.accessLeg),
  ]);
  const segments: RouteSegment[] = [
    ...(origin.accessLeg ? [buildAccessSegment(origin.accessLeg)] : []),
    {
      mode: "bus",
      instruction: `Board ${firstBusName}`,
      startLocation: transfer.firstLeg.boardingLabel,
      endLocation: transfer.firstLeg.alightingLabel,
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
      startLocation: transfer.firstLeg.alightingLabel,
      endLocation: transfer.secondLeg.boardingLabel,
      estimatedDistanceKm: transfer.transferWalkDistanceKm
        ? roundDistanceKm(transfer.transferWalkDistanceKm)
        : undefined,
      estimatedDurationMinutes: transferDurationMinutes,
      distanceSource: "local_estimate",
    },
    {
      mode: "bus",
      instruction: `Board ${secondBusName}`,
      startLocation: transfer.secondLeg.boardingLabel,
      endLocation: transfer.secondLeg.alightingLabel,
      fareText: formatApproxFare(secondFare),
      estimatedDistanceKm: roundDistanceKm(secondDistanceKm),
      estimatedDurationMinutes: secondDurationMinutes,
      stopCount: transfer.secondLeg.stopCount,
      distanceSource: "local_estimate",
      pricingConfidence: "regulated_estimate",
      costLowBdt: secondFare,
      costHighBdt: secondFare,
    },
    ...(destination.accessLeg
      ? [buildAccessSegment(destination.accessLeg)]
      : []),
  ];

  return finalizeRoute({
    id: `${transfer.firstLeg.route.id}-${transfer.secondLeg.route.id}-${normalizeTransitText(transfer.transferLabel)}`,
    kind: "bus_transfer",
    confidence: "verified",
    summary: `${firstBusName} -> ${secondBusName}`,
    fareType: "advisory",
    fareText: formatApproxFare(metrics.totalCost ?? totalFare),
    totalCost: metrics.totalCost,
    totalCostLowBdt: metrics.totalCost,
    totalCostHighBdt: metrics.totalCost,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    stopCount: transfer.firstLeg.stopCount + transfer.secondLeg.stopCount,
    transferCount: 1,
    boarding: makeStopReference(transfer.firstLeg.boardingLabel),
    alighting: makeStopReference(transfer.secondLeg.alightingLabel),
    transferStops: [makeStopReference(transfer.transferLabel, "hub")],
    serviceLabels: [firstBusName, secondBusName],
    primaryServiceLabel: firstBusName,
    segments,
    mapPreview: buildMapPreview(
      transfer.firstLeg.boardingLabel,
      transfer.secondLeg.alightingLabel,
      segments,
    ),
    advisories: [],
  });
}

function createMetroRoute(
  originStationId: string,
  destinationStationId: string,
  origin: TransitCandidate,
  destination: TransitCandidate,
) {
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
  const fare =
    getDhakaMetroFareBdtBySequence(
      originStation.sequence,
      destinationStation.sequence,
    ) ?? undefined;
  const distanceKm = estimateMetroDistanceKm(
    originStation.id,
    destinationStation.id,
    stationCount,
  );
  const durationMinutes = estimateMetroDurationMinutes(
    distanceKm,
    stationCount,
  );
  const metrics = combineTripMetrics(origin, destination, {
    distanceKm,
    durationMinutes,
    costBdt: fare,
  });
  const segments = withAccessSegments(origin, destination, [
    {
      mode: "metro",
      instruction: "Ride Metro Rail Line 6",
      startLocation: originStation.name,
      endLocation: destinationStation.name,
      note: "Metro fare uses the DMTCL station-pair fare chart.",
      serviceWindowText: METRO_SERVICE_WINDOW_TEXT,
      fareText: fare ? formatExactFare(fare) : undefined,
      estimatedDistanceKm: roundDistanceKm(distanceKm),
      estimatedDurationMinutes: durationMinutes,
      stationCount,
      distanceSource: "metro_exact",
      pricingConfidence: "exact",
      costLowBdt: fare,
      costHighBdt: fare,
    },
  ]);

  return finalizeRoute({
    id: `${originStation.id}-${destinationStation.id}`,
    kind: "metro_direct",
    confidence: "exact",
    summary: "Metro direct",
    fareType: "exact",
    fareText:
      metrics.totalCost !== undefined
        ? formatExactFare(metrics.totalCost)
        : "Fare varies",
    totalCost: metrics.totalCost,
    totalCostLowBdt: metrics.totalCost,
    totalCostHighBdt: metrics.totalCost,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    serviceWindowText: METRO_SERVICE_WINDOW_TEXT,
    stationCount,
    transferCount: 0,
    boarding: makePointReference(origin.point),
    alighting: makePointReference(destination.point),
    transferStops: [],
    serviceLabels: ["MRT Line 6"],
    primaryServiceLabel: "MRT Line 6",
    segments,
    mapPreview: buildMapPreview(
      originStation.name,
      destinationStation.name,
      segments,
    ),
    advisories: [],
  });
}

function makeMetroSegment(
  originStationId: string,
  destinationStationId: string,
): RouteSegment | null {
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
  const fare =
    getDhakaMetroFareBdtBySequence(
      originStation.sequence,
      destinationStation.sequence,
    ) ?? undefined;
  const distanceKm = estimateMetroDistanceKm(
    originStation.id,
    destinationStation.id,
    stationCount,
  );

  return {
    mode: "metro",
    instruction: "Ride Metro Rail Line 6",
    startLocation: originStation.name,
    endLocation: destinationStation.name,
    note: "Metro fare uses the DMTCL station-pair fare chart.",
    serviceWindowText: METRO_SERVICE_WINDOW_TEXT,
    fareText: fare ? formatExactFare(fare) : undefined,
    estimatedDistanceKm: roundDistanceKm(distanceKm),
    estimatedDurationMinutes: estimateMetroDurationMinutes(
      distanceKm,
      stationCount,
    ),
    stationCount,
    distanceSource: "metro_exact",
    pricingConfidence: "exact",
    costLowBdt: fare,
    costHighBdt: fare,
  };
}

function makeBusSegment(leg: BusLeg): RouteSegment {
  const busName = getBusDisplayName(leg.route);
  const distanceKm = estimateBusLegDistanceKm(leg);
  const fare = estimateBusFareBdt(distanceKm, leg.stopCount);

  return {
    mode: "bus",
    instruction: `Board ${busName}`,
    startLocation: leg.boardingLabel,
    endLocation: leg.alightingLabel,
    note: "Bus route verified from the Dhaka bus stop-order dataset.",
    serviceWindowText: leg.serviceWindowText,
    fareText: formatApproxFare(fare),
    estimatedDistanceKm: roundDistanceKm(distanceKm),
    estimatedDurationMinutes: estimateBusDurationMinutes(
      distanceKm,
      leg.stopCount,
    ),
    stopCount: leg.stopCount,
    distanceSource: "local_estimate",
    pricingConfidence: "regulated_estimate",
    costLowBdt: fare,
    costHighBdt: fare,
  };
}

function makeMetroBusTransferSegment(
  busStopLabel: string,
  metroStationId: string,
): RouteSegment | null {
  const busStopCoordinates = findBusStopCoordinates(busStopLabel);
  const station = getMetroStationById(metroStationId);

  if (!busStopCoordinates || !station?.coordinates) {
    return null;
  }

  const distanceKm = haversineDistanceKm(
    busStopCoordinates,
    station.coordinates,
  );

  return {
    mode: "walk",
    instruction: "Change between bus and metro",
    startLocation: busStopLabel,
    endLocation: station.name,
    estimatedDistanceKm: roundDistanceKm(distanceKm),
    estimatedDurationMinutes: Math.max(
      TRANSFER_BUFFER_MINUTES,
      Math.round((distanceKm / WALK_SPEED_KMPH) * 60) + 4,
    ),
    distanceSource: "local_estimate",
  };
}

function createBusMetroHybridRoute(
  busLeg: BusLeg,
  metroOriginStationId: string,
  metroDestinationStationId: string,
  origin: TransitCandidate,
  destination: TransitCandidate,
) {
  const metroOrigin = getMetroStationById(metroOriginStationId);
  const metroSegment = makeMetroSegment(
    metroOriginStationId,
    metroDestinationStationId,
  );
  const transferSegment = metroOrigin
    ? makeMetroBusTransferSegment(busLeg.alightingLabel, metroOrigin.id)
    : null;

  if (!metroOrigin || !metroSegment || !transferSegment) {
    return null;
  }

  const busSegment = makeBusSegment(busLeg);
  const segments = withAccessSegments(origin, destination, [
    busSegment,
    transferSegment,
    metroSegment,
  ]);
  const metrics = metricsFromSegments(segments);
  const busName = getBusDisplayName(busLeg.route);

  return finalizeRoute({
    id: `${busLeg.route.id}-${normalizeTransitText(busLeg.boardingLabel)}-${metroOrigin.id}-${metroDestinationStationId}`,
    kind: "bus_metro_hybrid",
    confidence: "verified",
    summary: `${busName} -> MRT Line 6`,
    fareType: "advisory",
    fareText:
      metrics.totalCost !== undefined
        ? formatApproxFare(metrics.totalCost)
        : "Fare varies",
    totalCost: metrics.totalCost,
    totalCostLowBdt: metrics.totalCost,
    totalCostHighBdt: metrics.totalCost,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    transferCount: 1,
    boarding: makeStopReference(busLeg.boardingLabel),
    alighting: makeStopReference(metroSegment.endLocation, "metro_station"),
    transferStops: [makeStopReference(metroOrigin.name, "hub")],
    serviceLabels: [busName, "MRT Line 6"],
    primaryServiceLabel: busName,
    segments,
    mapPreview: buildMapPreview(
      busLeg.boardingLabel,
      metroSegment.endLocation,
      segments,
    ),
    advisories: [],
  });
}

function createMetroBusHybridRoute(
  metroOriginStationId: string,
  metroDestinationStationId: string,
  busLeg: BusLeg,
  origin: TransitCandidate,
  destination: TransitCandidate,
) {
  const metroDestination = getMetroStationById(metroDestinationStationId);
  const metroSegment = makeMetroSegment(
    metroOriginStationId,
    metroDestinationStationId,
  );
  const transferSegment = metroDestination
    ? makeMetroBusTransferSegment(busLeg.boardingLabel, metroDestination.id)
    : null;

  if (!metroDestination || !metroSegment || !transferSegment) {
    return null;
  }

  const busSegment = makeBusSegment(busLeg);
  const segments = withAccessSegments(origin, destination, [
    metroSegment,
    {
      ...transferSegment,
      startLocation: metroDestination.name,
      endLocation: busLeg.boardingLabel,
    },
    busSegment,
  ]);
  const metrics = metricsFromSegments(segments);
  const busName = getBusDisplayName(busLeg.route);

  return finalizeRoute({
    id: `${metroOriginStationId}-${metroDestination.id}-${busLeg.route.id}-${normalizeTransitText(busLeg.alightingLabel)}`,
    kind: "bus_metro_hybrid",
    confidence: "verified",
    summary: `MRT Line 6 -> ${busName}`,
    fareType: "advisory",
    fareText:
      metrics.totalCost !== undefined
        ? formatApproxFare(metrics.totalCost)
        : "Fare varies",
    totalCost: metrics.totalCost,
    totalCostLowBdt: metrics.totalCost,
    totalCostHighBdt: metrics.totalCost,
    estimatedDistanceKm: metrics.estimatedDistanceKm,
    estimatedDurationMinutes: metrics.estimatedDurationMinutes,
    transferCount: 1,
    boarding: makeStopReference(metroSegment.startLocation, "metro_station"),
    alighting: makeStopReference(busLeg.alightingLabel),
    transferStops: [makeStopReference(metroDestination.name, "hub")],
    serviceLabels: ["MRT Line 6", busName],
    primaryServiceLabel: "MRT Line 6",
    segments,
    mapPreview: buildMapPreview(
      metroSegment.startLocation,
      busLeg.alightingLabel,
      segments,
    ),
    advisories: [],
  });
}

function sortHybridBridgeStations(target: TransitCandidate) {
  const targetCoordinates = target.point.coordinates;

  return [...DHAKA_METRO_STATIONS]
    .map((station) => ({
      station,
      distanceKm:
        targetCoordinates && station.coordinates
          ? haversineDistanceKm(targetCoordinates, station.coordinates)
          : 0,
    }))
    .sort((left, right) => left.distanceKm - right.distanceKm)
    .map((item) => item.station)
    .slice(0, HYBRID_BRIDGE_STATION_LIMIT);
}

function findBusMetroHybridRoutes(
  origin: TransitCandidate,
  destination: TransitCandidate,
) {
  const routes: RouteOption[] = [];

  if (origin.point.busStopLabels.length && destination.point.metroStationId) {
    for (const station of sortHybridBridgeStations(origin)) {
      if (station.id === destination.point.metroStationId) {
        continue;
      }

      const nearbyBusLabels = findNearbyBusStopLabelsForMetroStation(
        station.id,
      );

      for (const leg of cachedFindDirectBusLegs(
        origin.point.busStopLabels,
        nearbyBusLabels,
      ).slice(0, 2)) {
        const route = createBusMetroHybridRoute(
          leg,
          station.id,
          destination.point.metroStationId,
          origin,
          destination,
        );

        if (route) {
          routes.push(route);
        }
      }
    }
  }

  if (origin.point.metroStationId && destination.point.busStopLabels.length) {
    for (const station of sortHybridBridgeStations(destination)) {
      if (station.id === origin.point.metroStationId) {
        continue;
      }

      const nearbyBusLabels = findNearbyBusStopLabelsForMetroStation(
        station.id,
      );

      for (const leg of cachedFindDirectBusLegs(
        nearbyBusLabels,
        destination.point.busStopLabels,
      ).slice(0, 2)) {
        const route = createMetroBusHybridRoute(
          origin.point.metroStationId,
          station.id,
          leg,
          origin,
          destination,
        );

        if (route) {
          routes.push(route);
        }
      }
    }
  }

  return routes.slice(0, 8);
}

function collectRoutes(
  originCandidates: TransitCandidate[],
  destinationCandidates: TransitCandidate[],
) {
  const routes: RouteOption[] = [];
  const transferSearchPairs = new Set(
    originCandidates
      .flatMap((origin) =>
        destinationCandidates.map((destination) => ({
          origin,
          destination,
          score: origin.score + destination.score,
        })),
      )
      .sort((left, right) => left.score - right.score)
      .slice(0, TRANSFER_SEARCH_PAIR_LIMIT)
      .map(
        ({ origin, destination }) =>
          `${origin.point.id}->${destination.point.id}`,
      ),
  );

  for (const origin of originCandidates) {
    for (const destination of destinationCandidates) {
      if (origin.point.id === destination.point.id) {
        continue;
      }

      if (origin.point.metroStationId && destination.point.metroStationId) {
        const route = createMetroRoute(
          origin.point.metroStationId,
          destination.point.metroStationId,
          origin,
          destination,
        );

        if (route) {
          routes.push(route);
        }
      }

      for (const route of findBusMetroHybridRoutes(origin, destination)) {
        routes.push(route);
      }

      if (
        origin.point.busStopLabels.length &&
        destination.point.busStopLabels.length
      ) {
        const directLegs = cachedFindDirectBusLegs(
          origin.point.busStopLabels,
          destination.point.busStopLabels,
        );

        for (const leg of directLegs) {
          routes.push(createDirectBusRoute(leg, origin, destination));
        }

        if (
          transferSearchPairs.has(`${origin.point.id}->${destination.point.id}`)
        ) {
          for (const transfer of findTransferBusLegs(
            origin.point.busStopLabels,
            destination.point.busStopLabels,
          )) {
            routes.push(createTransferBusRoute(transfer, origin, destination));
          }
        }
      }
    }
  }

  return routes;
}

function dedupeRoutes(routes: RouteOption[]) {
  const bySignature = new Map<string, RouteOption>();

  for (const route of routes) {
    const existing = bySignature.get(route.pathSignature);

    if (!existing) {
      bySignature.set(route.pathSignature, route);
      continue;
    }

    const mergedServiceLabels = mergeUniqueStrings(
      existing.serviceLabels,
      route.serviceLabels,
    );
    const mergedRoute =
      (route.estimatedDurationMinutes ?? 0) <
        (existing.estimatedDurationMinutes ?? 0)
        ? route
        : existing;
    const mergedSummary =
      mergedServiceLabels.length > 1 && mergedRoute.kind === "bus_direct"
        ? `${mergedRoute.primaryServiceLabel ?? mergedServiceLabels[0]} + ${mergedServiceLabels.length - 1} more direct`
        : mergedRoute.summary;
    const mergedBusInstruction =
      mergedServiceLabels.length > 1 && mergedRoute.kind === "bus_direct"
        ? `Board ${mergedRoute.primaryServiceLabel ?? mergedServiceLabels[0]} or ${mergedServiceLabels.length - 1} other service${mergedServiceLabels.length > 2 ? "s" : ""}`
        : undefined;
    const mergedSegments =
      mergedBusInstruction
        ? mergedRoute.segments.map((segment) =>
            segment.mode === "bus"
              ? {
                  ...segment,
                  instruction: mergedBusInstruction,
                }
              : segment,
          )
        : mergedRoute.segments;
    const mergedMapPreview = mergedBusInstruction
      ? {
          ...mergedRoute.mapPreview,
          lines: mergedRoute.mapPreview.lines.map((line) =>
            line.mode === "bus" ? { ...line, label: mergedBusInstruction } : line,
          ),
        }
      : mergedRoute.mapPreview;

    bySignature.set(
      route.pathSignature,
      routeOptionSchema.parse({
        ...mergedRoute,
        segments: mergedSegments,
        mapPreview: mergedMapPreview,
        serviceLabels: mergedServiceLabels,
        primaryServiceLabel:
          mergedRoute.primaryServiceLabel ?? mergedServiceLabels[0],
        summary: mergedSummary,
        highlights: dedupeStrings([
          ...mergedRoute.highlights,
          mergedServiceLabels.length > 1
            ? `${mergedServiceLabels.length} services`
            : "",
        ]),
      }),
    );
  }

  return [...bySignature.values()];
}

export function surfaceRoutes(
  routes: RouteOption[],
  optimization: RouteOptimization,
) {
  const uniqueRoutes = dedupeRoutes(routes);
  const selectedRoutes: RouteOption[] = [];

  for (const profile of profilesForOptimization(optimization)) {
    const route = selectRouteForProfile(uniqueRoutes, profile, selectedRoutes);

    if (route) {
      selectedRoutes.push(annotateSurfaceRoute(route, profile));
    }
  }

  while (selectedRoutes.length < 3) {
    const route = selectRouteForProfile(
      uniqueRoutes,
      SCORE_PROFILES.balanced,
      selectedRoutes,
    );

    if (!route) {
      break;
    }

    selectedRoutes.push(annotateSurfaceRoute(route, SCORE_PROFILES.balanced));
  }

  return selectedRoutes.slice(0, 3);
}

export async function calculateRoutes(payload: CalculateRouteRequest) {
  const [originResolution, destinationResolution] = await Promise.all([
    resolveTransitInput(payload.origin),
    resolveTransitInput(payload.destination),
  ]);
  const { originCandidates, destinationCandidates } =
    buildTripTransitCandidates(originResolution, destinationResolution);
  const routes = collectRoutes(originCandidates, destinationCandidates);
  const endpointRoutes = routes.map((route) =>
    applyTripEndpoints(route, payload),
  );

  const surfacedRoutes = await Promise.all(
    surfaceRoutes(endpointRoutes, payload.optimization).map(
      applyRoadSnappedMapPreview,
    ),
  );
  const debugRoutes = endpointRoutes;

  return calculateRouteResponseSchema.parse({
    routes: surfacedRoutes,
    debugRoutes,
    source: "deterministic",
  });
}
