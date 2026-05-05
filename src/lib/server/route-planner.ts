import {
  dhakaBusSeedRoutes,
  getDhakaBusStopCoordinatesByLabel,
  type DhakaBusSeedRoute,
} from "@/lib/data/dhaka-bus-seed";
import {
  DHAKA_METRO_STATIONS,
  getDhakaMetroFareBdtBySequence,
} from "@/lib/data/dhaka-metro";
import { DHAKA_METRO_LINE_6_SHAPE } from "@/lib/data/dhaka-metro-line-6-shape";
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
  };
}

const ACCESS_WALK_MAX_KM = 0.8;
const BUS_SPEED_KMPH = 13;
const METRO_SPEED_KMPH = 32;
const WALK_SPEED_KMPH = 4.6;
const RICKSHAW_SPEED_KMPH = 10;
const BUS_STOP_SPACING_KM = 0.9;
const METRO_STATION_SPACING_KM = 1.35;
const BUS_STOP_DELAY_MINUTES = 0.7;
const METRO_STATION_DELAY_MINUTES = 0.7;
const TRANSFER_BUFFER_MINUTES = 6;
const BUS_FARE_PER_KM_BDT = 2.42;
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
    },
  },
} satisfies Record<string, ScoreProfile>;

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
  const distanceKm = parts.reduce((sum, part) => sum + (part.distanceKm ?? 0), 0);
  const durationMinutes = parts.reduce((sum, part) => sum + (part.durationMinutes ?? 0), 0);
  const costParts = parts.map((part) => part.costBdt).filter((value): value is number => value !== undefined);
  const costBdt = costParts.length ? costParts.reduce((sum, value) => sum + value, 0) : undefined;

  return {
    estimatedDistanceKm: distanceKm > 0 ? roundDistanceKm(distanceKm) : undefined,
    estimatedDurationMinutes: durationMinutes > 0 ? Math.round(durationMinutes) : undefined,
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
  const connectorSegments = route.segments.filter((segment) => segment.connectorType);
  const connectorDistanceKm = connectorSegments.reduce(
    (sum, segment) => sum + (segment.connectorDistanceKm ?? segment.estimatedDistanceKm ?? 0),
    0,
  );
  const rickshawDistanceKm = connectorSegments
    .filter((segment) => segment.mode === "rickshaw" || segment.mode === "ride_share")
    .reduce((sum, segment) => sum + (segment.connectorDistanceKm ?? segment.estimatedDistanceKm ?? 0), 0);
  const walkDistanceKm = connectorSegments
    .filter((segment) => segment.mode === "walk")
    .reduce((sum, segment) => sum + (segment.connectorDistanceKm ?? segment.estimatedDistanceKm ?? 0), 0);

  return {
    durationMinutes: route.estimatedDurationMinutes ?? 999,
    fareBdt: route.totalCost ?? 999,
    transferCount: route.transferCount,
    connectorDistanceKm,
    rickshawDistanceKm,
    walkDistanceKm,
    longRickshawCount: connectorSegments.filter((segment) => segment.connectorType === "long_rickshaw").length,
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
  const directBonus = route.transferCount === 0 ? profile.weights.directBonus : 0;
  const metroBonus = route.kind === "metro_direct" ? profile.weights.metroBonus : 0;

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
    metroBonus
  );
}

function scoreTieBreaker(left: RouteOption, right: RouteOption) {
  const leftDuration = left.estimatedDurationMinutes ?? Number.MAX_SAFE_INTEGER;
  const rightDuration = right.estimatedDurationMinutes ?? Number.MAX_SAFE_INTEGER;
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
  return route.serviceLabels.join("+") || route.primaryServiceLabel || route.kind;
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
    .filter((route) => !selectedRoutes.some((selected) => selected.pathSignature === route.pathSignature))
    .sort((left, right) => {
      const leftScore = profileScore(left, profile) + diversityPenalty(left, selectedRoutes);
      const rightScore = profileScore(right, profile) + diversityPenalty(right, selectedRoutes);

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
      burden === "medium" ? "Moderate connector burden" : "",
      analysis.detourRatio > 1.8 ? "Noticeable detour versus direct distance" : "",
      route.transferCount > 0 ? `${route.transferCount} transfer to manage` : "",
    ]),
  });
}

function buildServiceWindowText(route: DhakaBusSeedRoute) {
  return [route.openingTimeText, route.closingTimeText].filter(Boolean).join(" - ") || undefined;
}

function getBusDisplayName(route: DhakaBusSeedRoute) {
  return route.busLabelEn || route.busLabel;
}

function findBusStopCoordinates(label: string) {
  return getDhakaBusStopCoordinatesByLabel(label);
}

function findBusLegStopIndices(leg: BusLeg) {
  const boardingIndex = leg.route.stopLabels.findIndex(
    (label) => normalizeTransitText(label) === normalizeTransitText(leg.boardingLabel),
  );

  if (boardingIndex < 0) {
    return null;
  }

  const alightingOffset = leg.route.stopLabels
    .slice(boardingIndex + 1)
    .findIndex((label) => normalizeTransitText(label) === normalizeTransitText(leg.alightingLabel));

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

    return distanceKm + haversineDistanceKm(coordinates[index - 1]!, coordinate);
  }, 0);
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

function estimateBusFareBdt(distanceKm: number, stopCount: number) {
  return Math.max(10, Math.ceil(Math.max(distanceKm, stopCount * 0.5) * BUS_FARE_PER_KM_BDT / 5) * 5);
}

function estimateBusDurationMinutes(distanceKm: number, stopCount: number) {
  return Math.max(5, Math.round((distanceKm / BUS_SPEED_KMPH) * 60 + stopCount * BUS_STOP_DELAY_MINUTES));
}

function estimateMetroDurationMinutes(distanceKm: number, stationCount: number) {
  return Math.max(3, Math.round((distanceKm / METRO_SPEED_KMPH) * 60 + stationCount * METRO_STATION_DELAY_MINUTES));
}

export function estimateBusLegDistanceKm(leg: BusLeg) {
  const indices = findBusLegStopIndices(leg);

  if (!indices) {
    return Math.max(1.5, leg.stopCount * BUS_STOP_SPACING_KM);
  }

  const coordinates = leg.route.stopLabels
    .slice(indices.boardingIndex, indices.alightingIndex + 1)
    .map(findBusStopCoordinates)
    .filter((coordinate): coordinate is [number, number] => Boolean(coordinate));

  if (coordinates.length >= 2) {
    return Math.max(1.5, sumCoordinateDistanceKm(coordinates));
  }

  const boardingCoordinates = findBusStopCoordinates(leg.boardingLabel);
  const alightingCoordinates = findBusStopCoordinates(leg.alightingLabel);

  if (boardingCoordinates && alightingCoordinates) {
    return Math.max(1.5, haversineDistanceKm(boardingCoordinates, alightingCoordinates) * 1.2);
  }

  return Math.max(1.5, leg.stopCount * BUS_STOP_SPACING_KM);
}

export function estimateMetroDistanceKm(originStationId: string, destinationStationId: string, stationCount: number) {
  const origin = getMetroStationById(originStationId);
  const destination = getMetroStationById(destinationStationId);

  if (origin?.coordinates && destination?.coordinates) {
    const coordinates = findMetroShapeCoordinates(origin.coordinates, destination.coordinates);

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
  if (!resolution.place?.coordinates || !point.coordinates || resolution.matchedPointIds.includes(point.id)) {
    return null;
  }

  const distanceKm = haversineDistanceKm(resolution.place.coordinates, point.coordinates);

  if (!Number.isFinite(distanceKm) || distanceKm <= 0.05) {
    return null;
  }

  const isWalk = distanceKm <= ACCESS_WALK_MAX_KM;
  const mode: TransportMode = isWalk ? "walk" : "rickshaw";
  const durationMinutes = Math.max(
    isWalk ? 4 : 6,
    Math.round((distanceKm / (isWalk ? WALK_SPEED_KMPH : RICKSHAW_SPEED_KMPH)) * 60),
  );
  const costBdt = isWalk ? undefined : estimateRickshawFareBdt(distanceKm);
  const transitLabel = point.canonicalBusStopLabel ?? point.name;

  return {
    connectorType: isWalk ? "walk" : distanceKm <= 3.5 ? "rickshaw" : "long_rickshaw",
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
    ...(destination.accessLeg ? [buildAccessSegment(destination.accessLeg)] : []),
  ];
}

function getRoadDistanceKm(route: RoadSnappedRoute) {
  return route.distanceMeters !== undefined
    ? route.distanceMeters / 1000
    : undefined;
}

function estimateRoadDurationMinutes(segment: RouteSegment, distanceKm: number) {
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

function applyRoadMetricsToSegment(segment: RouteSegment, route: RoadSnappedRoute) {
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
      pricingConfidence: fare ? "estimated" as const : undefined,
      connectorDistanceKm: segment.connectorType ? roundedDistanceKm : segment.connectorDistanceKm,
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
      connectorDistanceKm: segment.connectorType ? roundedDistanceKm : segment.connectorDistanceKm,
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

function buildTransitCandidates(resolution: ResolvedTransitInput, role: "origin" | "destination") {
  const transitCandidates = resolution.candidates.filter(isTransitDatasetPoint);
  const matchedTransitCandidates = transitCandidates.filter((point) =>
    resolution.matchedPointIds.includes(point.id) ||
    (point.metroStationId ? resolution.matchedPointIds.includes(point.metroStationId) : false) ||
    (point.canonicalBusStopId ? resolution.matchedPointIds.includes(point.canonicalBusStopId) : false),
  );
  const sourceCandidates = matchedTransitCandidates.length ? matchedTransitCandidates : transitCandidates;

  return sourceCandidates
    .map((point): TransitCandidate => {
      const accessLeg = createAccessLeg(resolution, point, role);
      const score = accessLeg ? accessLeg.distanceKm + accessLeg.durationMinutes / 60 : 0;

      return { point, accessLeg, score };
    })
    .sort((left, right) => left.score - right.score || left.point.name.localeCompare(right.point.name))
    .slice(0, 4);
}

function makeStopReference(label: string, type: "bus_stop" | "metro_station" | "hub" = "bus_stop"): RouteStopReference {
  const busPoint = type === "bus_stop" ? getBusStopPointByLabel(label) : undefined;
  const metroStation = type === "metro_station" ? DHAKA_METRO_STATIONS.find((station) => station.name === label) : undefined;

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

function createPathSignature(route: Pick<RouteOption, "kind" | "boarding" | "alighting" | "transferStops" | "segments"> & { mapPreview?: RouteMapPreview }) {
  return [
    route.kind,
    normalizeTransitText(route.boarding.label),
    normalizeTransitText(route.alighting.label),
    route.transferStops.map((stop) => normalizeTransitText(stop.label)).join(">"),
    route.segments.map((segment) => `${segment.mode}:${normalizeTransitText(segment.startLocation)}:${normalizeTransitText(segment.endLocation)}`).join("|"),
  ].join("::");
}

export { createPathSignature };

function applyTripEndpoints(route: RouteOption, payload: CalculateRouteRequest) {
  return routeOptionSchema.parse({
    ...route,
    mapPreview: buildMapPreview(
      payload.origin.name,
      payload.destination.name,
      route.segments,
      payload.origin.coordinates ?? route.mapPreview.originCoordinates,
      payload.destination.coordinates ?? route.mapPreview.destinationCoordinates,
    ),
  });
}

async function applyRoadSnappedMapPreview(route: RouteOption) {
  const lineResults = await Promise.all(
    route.mapPreview.lines.map(async (line) => {
      const snappedRoute = await getRoadSnappedRoute(line.mode, line.coordinates);

      return {
        line,
        snappedRoute,
      };
    }),
  );
  const lines = lineResults.map(({ line, snappedRoute }) => ({
    ...line,
    coordinates: snappedRoute?.coordinates ?? line.coordinates,
    confidence: line.mode === "metro" || snappedRoute ? "exact" : line.confidence,
  }) satisfies RouteMapLine);
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
  const fareText = metrics.totalCost !== undefined
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
      metrics.estimatedDurationMinutes ? `${metrics.estimatedDurationMinutes} min` : "",
      metrics.totalCost !== undefined ? `BDT ${Math.round(metrics.totalCost)}` : "",
      route.transferCount === 0 ? "No transfers" : `${route.transferCount} transfer`,
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
  if (!coordinates || points.some((point) => point.label === label && point.role === role)) {
    return;
  }

  points.push({ label, coordinates, role });
}

function findMetroSegmentCoordinates(startLabel: string, endLabel: string) {
  const start = DHAKA_METRO_STATIONS.find((station) => station.name === startLabel);
  const end = DHAKA_METRO_STATIONS.find((station) => station.name === endLabel);

  if (!start?.coordinates || !end?.coordinates) {
    return null;
  }

  return findMetroShapeCoordinates(start.coordinates, end.coordinates);
}

function findMetroShapeCoordinates(startCoordinates: [number, number], endCoordinates: [number, number]) {
  const startIndex = findNearestShapeIndex(startCoordinates, DHAKA_METRO_LINE_6_SHAPE);
  const endIndex = findNearestShapeIndex(endCoordinates, DHAKA_METRO_LINE_6_SHAPE);
  const [from, to] = [startIndex, endIndex].sort((left, right) => left - right);
  const coordinates = DHAKA_METRO_LINE_6_SHAPE.slice(from, to + 1);

  return startIndex <= endIndex ? coordinates : [...coordinates].reverse();
}

function findNearestShapeIndex(coordinates: [number, number], shape: [number, number][]) {
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
  const start = endpointCoordinates.get(segment.startLocation) ?? findLabelCoordinates(segment.startLocation);
  const end = endpointCoordinates.get(segment.endLocation) ?? findLabelCoordinates(segment.endLocation);
  const fallback = start && end ? [start, end] : [];

  if (segment.mode === "metro") {
    return findMetroSegmentCoordinates(segment.startLocation, segment.endLocation) ?? fallback;
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
    destinationCoordinates: destinationCoordinates ?? findLabelCoordinates(destinationLabel),
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

function finalizeRoute(route: Omit<RouteOption, "pathSignature" | "highlights" | "tradeoffs">): RouteOption {
  const pathSignature = createPathSignature(route);

  return routeOptionSchema.parse({
    ...route,
    pathSignature,
    highlights: dedupeStrings([
      route.estimatedDurationMinutes ? `${route.estimatedDurationMinutes} min` : "",
      route.totalCost !== undefined ? `BDT ${Math.round(route.totalCost)}` : "",
      route.transferCount === 0 ? "No transfers" : `${route.transferCount} transfer`,
    ]),
    tradeoffs: dedupeStrings([
      route.transferCount > 0 ? `${route.transferCount} transfer to manage` : "",
    ]),
  });
}

function findDirectBusLegs(originLabels: string[], destinationLabels: string[]) {
  const legs: BusLeg[] = [];

  for (const route of dhakaBusSeedRoutes) {
    const boardingIndex = route.stopLabels.findIndex((label) => originLabels.some((originLabel) => normalizeTransitText(originLabel) === normalizeTransitText(label)));
    const alightingIndex = route.stopLabels.findIndex((label) => destinationLabels.some((destinationLabel) => normalizeTransitText(destinationLabel) === normalizeTransitText(label)));

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

function findTransferBusLegs(originLabels: string[], destinationLabels: string[]) {
  const transfers: Array<{ firstLeg: BusLeg; secondLeg: BusLeg; transferLabel: string }> = [];

  for (const firstRoute of dhakaBusSeedRoutes) {
    const boardingIndex = firstRoute.stopLabels.findIndex((label) => originLabels.some((originLabel) => normalizeTransitText(originLabel) === normalizeTransitText(label)));

    if (boardingIndex < 0) {
      continue;
    }

    for (const secondRoute of dhakaBusSeedRoutes) {
      if (firstRoute.id === secondRoute.id) {
        continue;
      }

      const destinationIndex = secondRoute.stopLabels.findIndex((label) => destinationLabels.some((destinationLabel) => normalizeTransitText(destinationLabel) === normalizeTransitText(label)));

      if (destinationIndex <= 0) {
        continue;
      }

      for (let transferIndex = boardingIndex + 1; transferIndex < firstRoute.stopLabels.length; transferIndex += 1) {
        const transferLabel = firstRoute.stopLabels[transferIndex]!;
        const secondTransferIndex = secondRoute.stopLabels.findIndex((label) => normalizeTransitText(label) === normalizeTransitText(transferLabel));

        if (secondTransferIndex >= 0 && secondTransferIndex < destinationIndex) {
          transfers.push({
            transferLabel,
            firstLeg: {
              route: firstRoute,
              boardingLabel: firstRoute.stopLabels[boardingIndex]!,
              alightingLabel: transferLabel,
              stopCount: transferIndex - boardingIndex,
              serviceWindowText: buildServiceWindowText(firstRoute),
            },
            secondLeg: {
              route: secondRoute,
              boardingLabel: transferLabel,
              alightingLabel: secondRoute.stopLabels[destinationIndex]!,
              stopCount: destinationIndex - secondTransferIndex,
              serviceWindowText: buildServiceWindowText(secondRoute),
            },
          });
          break;
        }
      }
    }
  }

  return transfers.slice(0, 8);
}

function createDirectBusRoute(leg: BusLeg, origin: TransitCandidate, destination: TransitCandidate) {
  const busName = getBusDisplayName(leg.route);
  const distanceKm = estimateBusLegDistanceKm(leg);
  const durationMinutes = estimateBusDurationMinutes(distanceKm, leg.stopCount);
  const fare = estimateBusFareBdt(distanceKm, leg.stopCount);
  const metrics = combineTripMetrics(origin, destination, { distanceKm, durationMinutes, costBdt: fare });
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
    fareText: metrics.totalCost !== undefined ? formatApproxFare(metrics.totalCost) : "Fare varies",
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
    mapPreview: buildMapPreview(leg.boardingLabel, leg.alightingLabel, segments),
    advisories: [],
  });
}

function createTransferBusRoute(
  transfer: { firstLeg: BusLeg; secondLeg: BusLeg; transferLabel: string },
  origin: TransitCandidate,
  destination: TransitCandidate,
) {
  const firstBusName = getBusDisplayName(transfer.firstLeg.route);
  const secondBusName = getBusDisplayName(transfer.secondLeg.route);
  const firstDistanceKm = estimateBusLegDistanceKm(transfer.firstLeg);
  const secondDistanceKm = estimateBusLegDistanceKm(transfer.secondLeg);
  const firstDurationMinutes = estimateBusDurationMinutes(firstDistanceKm, transfer.firstLeg.stopCount);
  const secondDurationMinutes = estimateBusDurationMinutes(secondDistanceKm, transfer.secondLeg.stopCount);
  const firstFare = estimateBusFareBdt(firstDistanceKm, transfer.firstLeg.stopCount);
  const secondFare = estimateBusFareBdt(secondDistanceKm, transfer.secondLeg.stopCount);
  const totalFare = firstFare + secondFare;
  const metrics = combineMetrics([
    accessMetrics(origin.accessLeg),
    { distanceKm: firstDistanceKm, durationMinutes: firstDurationMinutes, costBdt: firstFare },
    { durationMinutes: TRANSFER_BUFFER_MINUTES },
    { distanceKm: secondDistanceKm, durationMinutes: secondDurationMinutes, costBdt: secondFare },
    accessMetrics(destination.accessLeg),
  ]);
  const segments: RouteSegment[] = [
    ...(origin.accessLeg ? [buildAccessSegment(origin.accessLeg)] : []),
    {
      mode: "bus",
      instruction: `Board ${firstBusName}`,
      startLocation: transfer.firstLeg.boardingLabel,
      endLocation: transfer.transferLabel,
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
      estimatedDurationMinutes: TRANSFER_BUFFER_MINUTES,
      distanceSource: "local_estimate",
    },
    {
      mode: "bus",
      instruction: `Board ${secondBusName}`,
      startLocation: transfer.transferLabel,
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
    ...(destination.accessLeg ? [buildAccessSegment(destination.accessLeg)] : []),
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
    mapPreview: buildMapPreview(transfer.firstLeg.boardingLabel, transfer.secondLeg.alightingLabel, segments),
    advisories: [],
  });
}

function createMetroRoute(originStationId: string, destinationStationId: string, origin: TransitCandidate, destination: TransitCandidate) {
  const originStation = getMetroStationById(originStationId);
  const destinationStation = getMetroStationById(destinationStationId);

  if (!originStation || !destinationStation || originStation.id === destinationStation.id) {
    return null;
  }

  const stationCount = Math.abs(originStation.sequence - destinationStation.sequence);
  const fare = getDhakaMetroFareBdtBySequence(originStation.sequence, destinationStation.sequence) ?? undefined;
  const distanceKm = estimateMetroDistanceKm(originStation.id, destinationStation.id, stationCount);
  const durationMinutes = estimateMetroDurationMinutes(distanceKm, stationCount);
  const metrics = combineTripMetrics(origin, destination, { distanceKm, durationMinutes, costBdt: fare });
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
    fareText: metrics.totalCost !== undefined ? formatExactFare(metrics.totalCost) : "Fare varies",
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
    mapPreview: buildMapPreview(originStation.name, destinationStation.name, segments),
    advisories: [],
  });
}

function collectRoutes(originCandidates: TransitCandidate[], destinationCandidates: TransitCandidate[]) {
  const routes: RouteOption[] = [];

  for (const origin of originCandidates) {
    for (const destination of destinationCandidates) {
      if (origin.point.id === destination.point.id) {
        continue;
      }

      if (origin.point.metroStationId && destination.point.metroStationId) {
        const route = createMetroRoute(origin.point.metroStationId, destination.point.metroStationId, origin, destination);

        if (route) {
          routes.push(route);
        }
      }

      if (origin.point.busStopLabels.length && destination.point.busStopLabels.length) {
        const directLegs = findDirectBusLegs(origin.point.busStopLabels, destination.point.busStopLabels);

        for (const leg of directLegs) {
          routes.push(createDirectBusRoute(leg, origin, destination));
        }

        if (!directLegs.length) {
          for (const transfer of findTransferBusLegs(origin.point.busStopLabels, destination.point.busStopLabels)) {
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

    if (!existing || (route.estimatedDurationMinutes ?? 0) < (existing.estimatedDurationMinutes ?? 0)) {
      bySignature.set(route.pathSignature, route);
    }
  }

  return [...bySignature.values()];
}

export function surfaceRoutes(routes: RouteOption[], optimization: RouteOptimization) {
  const uniqueRoutes = dedupeRoutes(routes);
  const selectedRoutes: RouteOption[] = [];

  for (const profile of profilesForOptimization(optimization)) {
    const route = selectRouteForProfile(uniqueRoutes, profile, selectedRoutes);

    if (route) {
      selectedRoutes.push(annotateSurfaceRoute(route, profile));
    }
  }

  while (selectedRoutes.length < 3) {
    const route = selectRouteForProfile(uniqueRoutes, SCORE_PROFILES.balanced, selectedRoutes);

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
  const originCandidates = buildTransitCandidates(originResolution, "origin");
  const destinationCandidates = buildTransitCandidates(destinationResolution, "destination");
  const routes = collectRoutes(originCandidates, destinationCandidates);

  const surfacedRoutes = await Promise.all(
    surfaceRoutes(routes, payload.optimization)
      .map((route) => applyTripEndpoints(route, payload))
      .map(applyRoadSnappedMapPreview),
  );
  const debugRoutes = dedupeRoutes(routes).map((route) => applyTripEndpoints(route, payload));

  return calculateRouteResponseSchema.parse({
    routes: surfacedRoutes,
    debugRoutes,
    source: "deterministic",
  });
}
