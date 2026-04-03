import { DHAKA_ACCESS_POINTS, type DhakaAccessPoint } from "@/lib/data/dhaka-access-points";
import { dhakaBusSeedStops } from "@/lib/data/dhaka-bus-seed";
import { DHAKA_METRO_STATIONS, type DhakaMetroStation } from "@/lib/data/dhaka-metro";
import { resolveLocation, searchGooglePlaces, type ResolvedLocation } from "@/lib/server/google-maps";
import {
  haversineDistanceKm,
  normalizeTransitText,
  tokenizeTransitText,
} from "@/lib/server/transit-support";
import type {
  LocationInput,
  LocationSuggestion,
  LocationSuggestionType,
} from "@/lib/validations/routes";

export interface TransitPoint {
  id: string;
  name: string;
  address?: string;
  type: "hub" | "bus_stop" | "metro_station";
  coordinates?: [number, number];
  aliases: string[];
  busStopLabels: string[];
  metroStationId?: string;
  advisories: string[];
}

export interface ResolvedTransitInput {
  displayName: string;
  place?: ResolvedLocation;
  candidates: TransitPoint[];
  directMatch: boolean;
}

const busStopPoints: TransitPoint[] = dhakaBusSeedStops.flatMap((stop) => {
  if (stop.variants?.length) {
    return stop.variants.map((variant, index) => ({
      id: `${stop.id}::variant-${index + 1}`,
      name: variant.placeName ?? variant.name,
      address: variant.address ?? stop.address ?? "Bus stop, Dhaka",
      type: "bus_stop" as const,
      coordinates: variant.coordinates,
      aliases: [
        stop.labelEn,
        stop.labelBn ?? "",
        stop.label,
        stop.placeName ?? "",
        variant.name,
        variant.placeName ?? "",
      ],
      busStopLabels: [stop.label],
      advisories: [],
    }));
  }

  return [
    {
      id: stop.id,
      name: stop.placeName ?? stop.label,
      address: stop.address ?? "Bus stop, Dhaka",
      type: "bus_stop" as const,
      coordinates: stop.coordinates,
      aliases: [stop.labelEn, stop.labelBn ?? "", stop.label, stop.placeName ?? ""],
      busStopLabels: [stop.label],
      advisories: [],
    },
  ];
});

const metroPoints: TransitPoint[] = DHAKA_METRO_STATIONS.map((station) => ({
  id: station.id,
  name: station.name,
  address: "Metro station, Dhaka",
  type: "metro_station",
  coordinates: station.coordinates,
  aliases: [station.name, ...station.aliases],
  busStopLabels: [],
  metroStationId: station.id,
  advisories: [],
}));

const hubPoints: TransitPoint[] = DHAKA_ACCESS_POINTS.map((point) => ({
  id: point.id,
  name: point.name,
  address: point.address,
  type: "hub",
  coordinates: point.coordinates,
  aliases: [point.name, ...point.aliases],
  busStopLabels: point.busStopLabels,
  metroStationId: point.metroStationId,
  advisories: point.advisories ?? [],
}));

const localSuggestionCatalog = [...hubPoints, ...metroPoints, ...busStopPoints];
const coordinateCandidates = [...hubPoints, ...metroPoints, ...busStopPoints].filter(
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

function findNearestPoints(coordinates: [number, number]) {
  return coordinateCandidates
    .map((point) => ({
      point,
      distanceKm: haversineDistanceKm(coordinates, point.coordinates!),
    }))
    .filter((item) => item.distanceKm <= 5)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .map((item) => item.point)
    .slice(0, 3);
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
  return id ? hubPoints.find((point) => point.id === id) : undefined;
}

export function searchLocalTransitSuggestions(query: string) {
  return localSuggestionCatalog
    .map((point) => ({
      point,
      score: textScore(query, [point.name, ...point.aliases]),
    }))
    .filter((item) => item.score >= 24)
    .sort((a, b) => b.score - a.score)
    .slice(0, 8)
    .map((item) => toSuggestion(item.point));
}

export async function searchMixedLocationSuggestions(query: string) {
  const [googleSuggestions, localSuggestions] = await Promise.all([
    searchGooglePlaces(query),
    Promise.resolve(searchLocalTransitSuggestions(query)),
  ]);

  const normalizedGoogleSuggestions = googleSuggestions.map((suggestion) => ({
    ...suggestion,
    type: "place" as LocationSuggestionType,
  }));

  return dedupeSuggestions([
    ...localSuggestions,
    ...normalizedGoogleSuggestions,
  ]).slice(0, 8);
}

export async function resolveTransitInput(input: LocationInput): Promise<ResolvedTransitInput> {
  const directPoint = findPointById(input.canonicalId);
  if (directPoint) {
    return {
      displayName: input.name,
      candidates: [directPoint],
      directMatch: true,
    };
  }

  const textMatches = findStrongTextMatches(input.name);
  if (textMatches.length) {
    return {
      displayName: input.name,
      candidates: textMatches,
      directMatch: true,
    };
  }

  const place = await resolveLocation(input);
  const nearbyPoints = findNearestPoints(place.coordinates);

  return {
    displayName: input.name,
    place,
    candidates: dedupePoints(nearbyPoints),
    directMatch: false,
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
  return hubPoints;
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

export function getAccessPointDetails(point: DhakaAccessPoint) {
  return point;
}
