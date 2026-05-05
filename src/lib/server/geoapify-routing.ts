import type { TransportMode } from "@/lib/validations/routes";

type GeoapifyMode = "bus" | "drive" | "walk";

interface GeoapifyRouteFeature {
  geometry?: {
    type?: string;
    coordinates?: unknown;
  };
  properties?: {
    distance?: unknown;
    time?: unknown;
  };
}

interface GeoapifyRouteResponse {
  features?: GeoapifyRouteFeature[];
}

export interface RoadSnappedRoute {
  coordinates: [number, number][];
  distanceMeters?: number;
  durationSeconds?: number;
}

const routeGeometryCache = new Map<string, RoadSnappedRoute>();
const MAX_CACHE_ENTRIES = 500;
const REQUEST_TIMEOUT_MS = 3500;
const DEFAULT_MAX_WAYPOINTS = 24;
const MAX_GEOMETRY_POINTS = 900;
const SIMPLIFICATION_TOLERANCE_DEGREES = 0.00008;

function getGeoapifyMode(mode: TransportMode): GeoapifyMode | null {
  switch (mode) {
    case "bus":
      return "bus";
    case "walk":
      return "walk";
    case "rickshaw":
    case "ride_share":
      return "drive";
    case "metro":
      return null;
  }
}

function getMaxWaypoints() {
  const configured = Number(process.env.GEOAPIFY_ROUTING_MAX_WAYPOINTS);

  return Number.isInteger(configured) && configured >= 2
    ? configured
    : DEFAULT_MAX_WAYPOINTS;
}

function coordinateKey([lat, lng]: [number, number]) {
  return `${lat.toFixed(6)},${lng.toFixed(6)}`;
}

function cacheKey(mode: GeoapifyMode, coordinates: [number, number][]) {
  return `${mode}:${coordinates.map(coordinateKey).join("|")}`;
}

function rememberRouteGeometry(key: string, route: RoadSnappedRoute) {
  if (routeGeometryCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = routeGeometryCache.keys().next().value as string | undefined;

    if (oldestKey) {
      routeGeometryCache.delete(oldestKey);
    }
  }

  routeGeometryCache.set(key, route);
}

function isLngLatPair(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

function flattenGeoapifyGeometry(feature: GeoapifyRouteFeature) {
  const geometry = feature.geometry;

  if (!geometry?.coordinates) {
    return [];
  }

  if (geometry.type === "LineString" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.filter(isLngLatPair);
  }

  if (geometry.type === "MultiLineString" && Array.isArray(geometry.coordinates)) {
    return geometry.coordinates.flatMap((line) =>
      Array.isArray(line) ? line.filter(isLngLatPair) : [],
    );
  }

  return [];
}

function dedupeAdjacentCoordinates(coordinates: [number, number][]) {
  return coordinates.filter((coordinate, index) => {
    const previous = coordinates[index - 1];

    return !previous || previous[0] !== coordinate[0] || previous[1] !== coordinate[1];
  });
}

function squaredDistanceToSegment(
  point: [number, number],
  start: [number, number],
  end: [number, number],
) {
  const x = point[1];
  const y = point[0];
  const x1 = start[1];
  const y1 = start[0];
  const x2 = end[1];
  const y2 = end[0];
  const dx = x2 - x1;
  const dy = y2 - y1;

  if (dx === 0 && dy === 0) {
    return (x - x1) ** 2 + (y - y1) ** 2;
  }

  const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx ** 2 + dy ** 2)));
  const projectedX = x1 + t * dx;
  const projectedY = y1 + t * dy;

  return (x - projectedX) ** 2 + (y - projectedY) ** 2;
}

function simplifyDouglasPeucker(
  coordinates: [number, number][],
  toleranceDegrees: number,
): [number, number][] {
  if (coordinates.length <= 2) {
    return coordinates;
  }

  let maxDistance = 0;
  let maxIndex = 0;
  const first = coordinates[0]!;
  const last = coordinates[coordinates.length - 1]!;

  for (let index = 1; index < coordinates.length - 1; index += 1) {
    const distance = squaredDistanceToSegment(coordinates[index]!, first, last);

    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = index;
    }
  }

  if (maxDistance <= toleranceDegrees ** 2) {
    return [first, last];
  }

  return [
    ...simplifyDouglasPeucker(coordinates.slice(0, maxIndex + 1), toleranceDegrees).slice(0, -1),
    ...simplifyDouglasPeucker(coordinates.slice(maxIndex), toleranceDegrees),
  ];
}

function capGeometryPoints(coordinates: [number, number][]) {
  if (coordinates.length <= MAX_GEOMETRY_POINTS) {
    return coordinates;
  }

  const step = (coordinates.length - 1) / (MAX_GEOMETRY_POINTS - 1);

  return Array.from({ length: MAX_GEOMETRY_POINTS }, (_, index) => {
    const sourceIndex =
      index === MAX_GEOMETRY_POINTS - 1
        ? coordinates.length - 1
        : Math.round(index * step);

    return coordinates[sourceIndex]!;
  });
}

function simplifyRouteGeometry(coordinates: [number, number][]) {
  return capGeometryPoints(
    simplifyDouglasPeucker(coordinates, SIMPLIFICATION_TOLERANCE_DEGREES),
  );
}

function finiteMetric(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;
}

export async function getRoadSnappedRoute(
  mode: TransportMode,
  coordinates: [number, number][],
) {
  const apiKey = process.env.GEOAPIFY_API_KEY?.trim();
  const geoapifyMode = getGeoapifyMode(mode);
  const maxWaypoints = getMaxWaypoints();

  if (
    !apiKey ||
    !geoapifyMode ||
    coordinates.length < 2 ||
    coordinates.length > maxWaypoints
  ) {
    return null;
  }

  const key = cacheKey(geoapifyMode, coordinates);
  const cached = routeGeometryCache.get(key);

  if (cached) {
    return cached;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const url = new URL("https://api.geoapify.com/v1/routing");
    url.searchParams.set(
      "waypoints",
      coordinates.map((coordinate) => coordinateKey(coordinate)).join("|"),
    );
    url.searchParams.set("mode", geoapifyMode);
    url.searchParams.set("format", "geojson");
    url.searchParams.set("apiKey", apiKey);

    const response = await fetch(url, {
      signal: controller.signal,
      next: { revalidate: 60 * 60 * 24 * 7 },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as GeoapifyRouteResponse;
    const feature = payload.features?.[0];
    const coordinatesLngLat = feature
      ? flattenGeoapifyGeometry(feature)
      : [];
    const snappedCoordinates = simplifyRouteGeometry(
      dedupeAdjacentCoordinates(coordinatesLngLat.map(([lng, lat]) => [lat, lng])),
    );

    if (snappedCoordinates.length < 2) {
      return null;
    }

    const route = {
      coordinates: snappedCoordinates,
      distanceMeters: finiteMetric(feature?.properties?.distance),
      durationSeconds: finiteMetric(feature?.properties?.time),
    } satisfies RoadSnappedRoute;

    rememberRouteGeometry(key, route);

    return route;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
