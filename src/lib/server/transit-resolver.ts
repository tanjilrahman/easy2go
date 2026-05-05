import dhakaBusStopReviewedMetadataJson from "@/lib/data/dhaka-bus-stop-reviewed-metadata.json";
import { DHAKA_METRO_STATIONS, type DhakaMetroStation } from "@/lib/data/dhaka-metro";
import { resolveLocation, type ResolvedLocation } from "@/lib/server/location-resolution";
import {
  isGeoapifyAutocompleteEnabled,
  searchGeoapifyPlacePois,
  searchGeoapifyPlaces,
} from "@/lib/server/geoapify";
import {
  haversineDistanceKm,
  normalizeTransitText,
  tokenizeTransitText,
} from "@/lib/server/transit-support";
import type {
  LocationInput,
  LocationSuggestion,
} from "@/lib/validations/routes";

export interface TransitPoint {
  id: string;
  name: string;
  address?: string;
  type: "hub" | "bus_stop" | "metro_station";
  nodeType: "hub" | "bus_stop" | "metro_station";
  coordinates?: [number, number];
  aliases: string[];
  busStopLabels: string[];
  metroStationId?: string;
  advisories: string[];
  variantId?: string;
  variantName?: string;
  variantCoordinates?: [number, number];
  canonicalBusStopId?: string;
  canonicalBusStopLabel?: string;
}

export interface ResolvedTransitInput {
  displayName: string;
  place?: ResolvedLocation;
  candidates: TransitPoint[];
  directMatch: boolean;
  matchedPointIds: string[];
}

interface ReviewedBusStopMetadataEntry {
  labels: string[];
  placeName?: string;
  address?: string;
  coordinates: [number, number];
  source?: string;
  confidence?: string;
}

const reviewedBusStopMetadata =
  dhakaBusStopReviewedMetadataJson as ReviewedBusStopMetadataEntry[];

function slugify(value: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "item";
}

const busStopPoints: TransitPoint[] = reviewedBusStopMetadata.map((entry) => {
  const labelEn = entry.labels[0] ?? entry.placeName ?? "Bus stop";
  const canonicalLabel = entry.labels[1] ?? labelEn;
  const id = `stop-${slugify(labelEn)}`;

  return {
    id,
    name: entry.placeName ?? labelEn,
    address: entry.address ?? "Reviewed bus stop, Dhaka",
    type: "bus_stop" as const,
    nodeType: "bus_stop" as const,
    coordinates: entry.coordinates,
    aliases: [...entry.labels, entry.placeName ?? "", entry.address ?? ""],
    busStopLabels: [canonicalLabel],
    advisories: [],
    canonicalBusStopId: id,
    canonicalBusStopLabel: canonicalLabel,
  };
});

const metroPoints: TransitPoint[] = DHAKA_METRO_STATIONS.map((station) => ({
  id: station.id,
  name: station.name,
  address: "Metro station, Dhaka",
  type: "metro_station",
  nodeType: "metro_station",
  coordinates: station.coordinates,
  aliases: [station.name, ...station.aliases],
  busStopLabels: [],
  metroStationId: station.id,
  advisories: [],
}));

const localSuggestionCatalog = [...metroPoints, ...busStopPoints];
const coordinateCandidates = localSuggestionCatalog.filter(
  (point) => point.coordinates,
);

function textScore(query: string, values: string[]) {
  const normalizedQuery = normalizeTransitText(query);
  const queryTokens = tokenizeTransitText(query);
  let bestScore = 0;

  for (const value of values) {
    const normalizedValue = normalizeTransitText(value);
    const valueTokens = tokenizeTransitText(value);
    let score = 0;

    if (normalizedValue === normalizedQuery) {
      score += 120;
    }

    if (normalizedValue.startsWith(normalizedQuery)) {
      score += 80;
    }

    if (normalizedValue.includes(normalizedQuery)) {
      score += 40;
    }

    const overlap = queryTokens.filter((token) => valueTokens.includes(token)).length;
    score += overlap * 12;

    bestScore = Math.max(bestScore, score);
  }

  return bestScore;
}

function toSuggestion(point: TransitPoint): LocationSuggestion {
  return {
    id: point.id,
    canonicalId: point.id,
    name: point.name,
    address: point.address,
    type: point.type,
    coordinates: point.coordinates,
    provider: "local",
    confidence: point.coordinates ? "exact" : "candidate",
  };
}

function dedupeSuggestions(suggestions: LocationSuggestion[]) {
  const seen = new Set<string>();

  return suggestions.filter((suggestion) => {
    const key =
      suggestion.canonicalId ??
      suggestion.id ??
      normalizeTransitText(`${suggestion.type}:${suggestion.name}:${suggestion.address ?? ""}`);
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function findPointById(id?: string) {
  return id ? localSuggestionCatalog.find((point) => point.id === id) : undefined;
}

function findStrongTextMatches(name: string) {
  return localSuggestionCatalog
    .map((point) => ({
      point,
      score: textScore(name, [point.name, ...point.aliases]),
    }))
    .filter((item) => item.score >= 80)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.point)
    .slice(0, 3);
}

function findNearestPoints(
  coordinates: [number, number],
  limitWithinRadius = 20,
  minKeep = 5,
  radiusKm = 5,
) {
  const sorted = coordinateCandidates
    .map((point) => ({
      point,
      distanceKm: haversineDistanceKm(coordinates, point.coordinates!),
    }))
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .map((item) => item.point);

  const withinRadius = coordinateCandidates
    .map((point) => ({
      point,
      distanceKm: haversineDistanceKm(coordinates, point.coordinates!),
    }))
    .filter((item) => item.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .map((item) => item.point)
    .slice(0, limitWithinRadius);

  return dedupePoints([
    ...withinRadius,
    ...sorted.slice(0, Math.max(minKeep, withinRadius.length)),
  ]);
}

function dedupePoints(points: TransitPoint[]) {
  const seen = new Set<string>();

  return points.filter((point) => {
    if (seen.has(point.id)) {
      return false;
    }

    seen.add(point.id);
    return true;
  });
}

export function getMetroStationById(id?: string) {
  return id ? DHAKA_METRO_STATIONS.find((station) => station.id === id) : undefined;
}

export function getHubPointById(id?: string) {
  return undefined;
}

export function searchLocalTransitSuggestions(query: string) {
  return localSuggestionCatalog
    .map((point) => ({
      point,
      score: textScore(query, [point.name, ...point.aliases]),
    }))
    .filter((item) => item.score >= 18)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => toSuggestion(item.point));
}

export async function searchMixedLocationSuggestions(query: string) {
  const localSuggestions = searchLocalTransitSuggestions(query);

  if (!isGeoapifyAutocompleteEnabled() || localSuggestions.length >= 4 || query.trim().length < 3) {
    return dedupeSuggestions(localSuggestions).slice(0, 8);
  }

  const [placeSuggestions, autocompleteSuggestions] = await Promise.all([
    searchGeoapifyPlacePois(query).catch(() => []),
    searchGeoapifyPlaces(query).catch(() => []),
  ]);
  const geoapifySuggestions = [
    ...placeSuggestions,
    ...autocompleteSuggestions,
  ];

  return dedupeSuggestions([
    ...localSuggestions,
    ...geoapifySuggestions,
  ]).slice(0, 8);
}

export async function resolveTransitInput(input: LocationInput): Promise<ResolvedTransitInput> {
  const directPoint = findPointById(input.canonicalId);
  const textMatches = findStrongTextMatches(input.name);
  const place =
    input.coordinates
      ? {
          name: input.name,
          address: input.address,
          coordinates: input.coordinates,
          placeId: input.placeId,
        }
      : directPoint?.coordinates
        ? {
            name: input.name,
            address: input.address ?? directPoint.address,
            coordinates: directPoint.coordinates,
            placeId: input.placeId,
          }
        : await resolveLocation(input);
  const nearbyPoints = place?.coordinates
    ? findNearestPoints(
        place.coordinates,
      )
    : [];
  const candidates = dedupePoints([
    ...(directPoint ? [directPoint] : []),
    ...textMatches,
    ...nearbyPoints,
  ]);
  const matchedPointIds = dedupePoints([
    ...(directPoint ? [directPoint] : []),
    ...textMatches,
  ]).map((point) => point.id);

  return {
    displayName: input.name,
    place,
    candidates,
    directMatch: Boolean(directPoint || textMatches.length),
    matchedPointIds,
  };
}

export function buildAccessAdvisories(
  resolution: ResolvedTransitInput,
  candidate: TransitPoint,
  role: "origin" | "destination",
) {
  const advisories = new Set<string>();

  if (!resolution.directMatch) {
    if (role === "origin") {
      advisories.add(
        `A short rickshaw can help you reach ${candidate.name} from ${resolution.displayName}.`,
      );
    } else {
      advisories.add(
        `Plan for a short rickshaw or walk from ${candidate.name} to ${resolution.displayName}.`,
      );
    }
  }

  for (const note of candidate.advisories) {
    advisories.add(note);
  }

  return [...advisories];
}

export function getAllHubPoints() {
  return [];
}

export function getAllTransitPoints() {
  return localSuggestionCatalog;
}

export function getMetroPoints() {
  return metroPoints;
}

export function getBusStopPointByLabel(label: string) {
  const normalizedLabel = normalizeTransitText(label);
  return busStopPoints.find(
    (point) =>
      point.busStopLabels.some((stopLabel) => normalizeTransitText(stopLabel) === normalizedLabel) ||
      normalizeTransitText(point.name) === normalizedLabel,
  );
}

export function getMetroPointForStation(station: DhakaMetroStation) {
  return metroPoints.find((point) => point.metroStationId === station.id);
}
