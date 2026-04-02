import { DHAKA_PLACE_SUGGESTIONS } from "@/lib/data/dhaka-places";
import { DHAKA_CENTER } from "@/lib/maps";
import { normalizeTransitText, tokenizeTransitText } from "@/lib/server/transit-support";
import type {
  LocationInput,
  LocationSuggestion,
  TransportMode,
} from "@/lib/validations/routes";

type RouteGeometrySource = "directions_steps" | "directions_overview";

export interface ResolvedLocation {
  name: string;
  address?: string;
  coordinates: [number, number];
  placeId?: string;
}

interface GoogleAutocompleteResponse {
  predictions?: Array<{
    description: string;
    place_id: string;
    structured_formatting?: {
      main_text?: string;
      secondary_text?: string;
    };
    types?: string[];
  }>;
}

interface GoogleGeocodeResponse {
  status?: string;
  results?: Array<{
    formatted_address?: string;
    place_id?: string;
    geometry?: {
      location?: {
        lat: number;
        lng: number;
      };
    };
  }>;
}

interface GoogleDirectionsResponse {
  status?: string;
  routes?: Array<{
    overview_polyline?: {
      points: string;
    };
    legs?: Array<{
      distance?: { text?: string; value?: number };
      duration?: { text?: string; value?: number };
      steps?: Array<{
        polyline?: {
          points: string;
        };
        steps?: Array<{
          polyline?: {
            points: string;
          };
        }>;
      }>;
    }>;
  }>;
}

type GoogleDirectionsStep = {
  polyline?: {
    points: string;
  };
  steps?: GoogleDirectionsStep[];
};

function getServerKey() {
  return process.env.GOOGLE_MAPS_SERVER_API_KEY ?? "";
}

function normalize(text: string) {
  return normalizeTransitText(text);
}

export function findKnownPlace(name: string) {
  const target = normalize(name);
  if (!target) {
    return undefined;
  }

  const exactMatch = DHAKA_PLACE_SUGGESTIONS.find((place) => normalize(place.name) === target);
  if (exactMatch) {
    return exactMatch;
  }

  const targetTokens = tokenizeTransitText(name);
  let bestMatch: (typeof DHAKA_PLACE_SUGGESTIONS)[number] | undefined;
  let bestScore = 0;

  for (const place of DHAKA_PLACE_SUGGESTIONS) {
    const candidate = normalize(place.name);
    const candidateTokens = tokenizeTransitText(place.name);

    let score = 0;

    if (candidate.includes(target) || target.includes(candidate)) {
      score += 12;
    }

    const overlap = targetTokens.filter((token) => candidateTokens.includes(token)).length;
    if (overlap) {
      score += overlap * 5;
    }

    if (place.type === "metro_station" && target.includes("metro")) {
      score += 2;
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = place;
    }
  }

  return bestScore >= 5 ? bestMatch : undefined;
}

export function searchFallbackPlaces(query: string) {
  const normalized = normalize(query);

  return DHAKA_PLACE_SUGGESTIONS.filter((place) => {
    const haystack = `${place.name} ${place.address ?? ""}`;
    return normalize(haystack).includes(normalized);
  }).slice(0, 6);
}

export async function searchGooglePlaces(query: string): Promise<LocationSuggestion[]> {
  const key = getServerKey();
  if (!key) {
    return [];
  }

  const url = new URL("https://maps.googleapis.com/maps/api/place/autocomplete/json");
  url.searchParams.set("input", `${query}, Dhaka`);
  url.searchParams.set("components", "country:bd");
  url.searchParams.set("location", `${DHAKA_CENTER[0]},${DHAKA_CENTER[1]}`);
  url.searchParams.set("radius", "30000");
  url.searchParams.set("key", key);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    return [];
  }

  const payload = (await response.json()) as GoogleAutocompleteResponse;

  return (payload.predictions ?? []).slice(0, 6).map((prediction, index) => ({
    id: prediction.place_id || `${normalize(prediction.description)}-${index}`,
    name:
      prediction.structured_formatting?.main_text ??
      prediction.description.split(",")[0] ??
      prediction.description,
    address:
      prediction.structured_formatting?.secondary_text ?? prediction.description,
    type: "place",
    placeId: prediction.place_id,
  }));
}

async function geocodeUrlFromInput(input: LocationInput) {
  const url = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  const key = getServerKey();
  url.searchParams.set("key", key);

  if (input.placeId) {
    url.searchParams.set("place_id", input.placeId);
  } else {
    url.searchParams.set("address", `${input.name}, Dhaka, Bangladesh`);
  }

  return url.toString();
}

export async function resolveLocation(input: LocationInput): Promise<ResolvedLocation> {
  if (input.coordinates) {
    return {
      name: input.name,
      address: input.address,
      coordinates: input.coordinates,
      placeId: input.placeId,
    };
  }

  const knownPlace = findKnownPlace(input.name);
  if (knownPlace?.coordinates) {
    return {
      name: knownPlace.name,
      address: knownPlace.address,
      coordinates: knownPlace.coordinates,
      placeId: knownPlace.placeId,
    };
  }

  const key = getServerKey();
  if (!key) {
    return {
      name: input.name,
      address: input.address ?? "Dhaka, Bangladesh",
      coordinates: DHAKA_CENTER,
      placeId: input.placeId,
    };
  }

  const response = await fetch(await geocodeUrlFromInput(input), { cache: "no-store" });

  if (!response.ok) {
    return {
      name: input.name,
      address: input.address ?? "Dhaka, Bangladesh",
      coordinates: DHAKA_CENTER,
    };
  }

  const payload = (await response.json()) as GoogleGeocodeResponse;
  const first = payload.results?.[0];

  if (payload.status === "OK" && first?.geometry?.location) {
    return {
      name: input.name,
      address: first.formatted_address ?? input.address,
      coordinates: [first.geometry.location.lat, first.geometry.location.lng],
      placeId: first.place_id ?? input.placeId,
    };
  }

  return {
    name: input.name,
    address: input.address ?? "Dhaka, Bangladesh",
    coordinates: knownPlace?.coordinates ?? DHAKA_CENTER,
  };
}

export function decodePolyline(encoded: string): [number, number][] {
  const points: [number, number][] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lat += result & 1 ? ~(result >> 1) : result >> 1;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    lng += result & 1 ? ~(result >> 1) : result >> 1;

    points.push([lat / 1e5, lng / 1e5]);
  }

  return points;
}

function areCoordinatesClose(a: [number, number], b: [number, number]) {
  return Math.abs(a[0] - b[0]) < 0.00001 && Math.abs(a[1] - b[1]) < 0.00001;
}

function appendPath(
  target: [number, number][],
  coordinates: [number, number][],
) {
  for (const coordinate of coordinates) {
    const last = target[target.length - 1];
    if (!last || !areCoordinatesClose(last, coordinate)) {
      target.push(coordinate);
    }
  }
}

function collectStepCoordinates(
  steps: GoogleDirectionsStep[],
): [number, number][] {
  const coordinates: [number, number][] = [];

  for (const step of steps) {
    if (step.steps?.length) {
      appendPath(coordinates, collectStepCoordinates(step.steps));
      continue;
    }

    if (step.polyline?.points) {
      appendPath(coordinates, decodePolyline(step.polyline.points));
    }
  }

  return coordinates;
}

function withAnchoredEndpoints(
  coordinates: [number, number][],
  start: [number, number],
  end: [number, number],
) {
  if (!coordinates.length) {
    return [start, end] as [number, number][];
  }

  const anchored = [...coordinates];

  if (!areCoordinatesClose(anchored[0], start)) {
    anchored.unshift(start);
  } else {
    anchored[0] = start;
  }

  if (!areCoordinatesClose(anchored[anchored.length - 1], end)) {
    anchored.push(end);
  } else {
    anchored[anchored.length - 1] = end;
  }

  return anchored;
}

function buildDirectionsGeometry(
  route: NonNullable<GoogleDirectionsResponse["routes"]>[number],
  start: [number, number],
  end: [number, number],
): {
  coordinates: [number, number][];
  geometrySource: RouteGeometrySource;
  isApproximate: boolean;
} | null {
  const stepCoordinates = collectStepCoordinates(
    route.legs?.flatMap((leg) => leg.steps ?? []) ?? [],
  );

  if (stepCoordinates.length > 1) {
    return {
      coordinates: withAnchoredEndpoints(stepCoordinates, start, end),
      geometrySource: "directions_steps",
      isApproximate: false,
    };
  }

  if (route.overview_polyline?.points) {
    const overviewCoordinates = decodePolyline(route.overview_polyline.points);

    if (overviewCoordinates.length > 1) {
      return {
        coordinates: withAnchoredEndpoints(overviewCoordinates, start, end),
        geometrySource: "directions_overview",
        isApproximate: false,
      };
    }
  }

  return null;
}

function transportModeToGoogle(mode: TransportMode) {
  switch (mode) {
    case "walk":
      return "walking";
    case "metro":
    case "bus":
      return "transit";
    case "ride_share":
    case "rickshaw":
    case "leguna":
      return "driving";
    default:
      return "driving";
  }
}

function applyModeSpecificDirectionsParams(url: URL, mode: TransportMode) {
  if (mode === "bus") {
    url.searchParams.set("transit_mode", "bus");
    url.searchParams.set("transit_routing_preference", "fewer_transfers");
  }

  if (mode === "metro") {
    url.searchParams.set("transit_mode", "rail");
    url.searchParams.set("transit_routing_preference", "fewer_transfers");
  }
}

export async function fetchSegmentDirections(
  start: [number, number],
  end: [number, number],
  mode: TransportMode,
) {
  const key = getServerKey();
  if (!key) {
    return null;
  }

  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", `${start[0]},${start[1]}`);
  url.searchParams.set("destination", `${end[0]},${end[1]}`);
  url.searchParams.set("mode", transportModeToGoogle(mode));
  url.searchParams.set("key", key);
  if (mode !== "walk") {
    url.searchParams.set("departure_time", "now");
  }
  applyModeSpecificDirectionsParams(url, mode);

  const response = await fetch(url.toString(), { cache: "no-store" });
  if (!response.ok) {
    return null;
  }

  const payload = (await response.json()) as GoogleDirectionsResponse;
  const first = payload.routes?.[0];
  const leg = first?.legs?.[0];
  const geometry = first ? buildDirectionsGeometry(first, start, end) : null;

  if (payload.status === "OK" && geometry) {
    return {
      coordinates: geometry.coordinates,
      geometrySource: geometry.geometrySource,
      isApproximate: geometry.isApproximate,
      distanceText: leg?.distance?.text ?? "",
      distanceMeters: leg?.distance?.value ?? 0,
      durationText: leg?.duration?.text ?? "",
      durationMinutes: leg?.duration?.value ? Math.max(1, Math.round(leg.duration.value / 60)) : 0,
    };
  }

  return null;
}
