import { DHAKA_CENTER } from "@/lib/maps";
import { DHAKA_PLACE_SUGGESTIONS } from "@/lib/data/dhaka-places";
import { normalizeTransitText, tokenizeTransitText } from "@/lib/server/transit-support";
import type { LocationInput } from "@/lib/validations/routes";

export interface ResolvedLocation {
  name: string;
  address?: string;
  coordinates: [number, number];
  placeId?: string;
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

export function resolveLocation(input: LocationInput): ResolvedLocation {
  if (input.coordinates) {
    return {
      name: input.name,
      address: input.address,
      coordinates: input.coordinates,
      placeId: input.placeId,
    };
  }

  const exactPlace =
    findKnownPlace(input.name) ??
    (input.address ? findKnownPlace(input.address) : undefined);

  if (exactPlace?.coordinates) {
    return {
      name: input.name,
      address: input.address ?? exactPlace.address,
      coordinates: exactPlace.coordinates,
      placeId: input.placeId,
    };
  }

  const fallbackPlace =
    searchFallbackPlaces(input.name)[0] ??
    (input.address ? searchFallbackPlaces(input.address)[0] : undefined);

  if (fallbackPlace?.coordinates) {
    return {
      name: input.name,
      address: input.address ?? fallbackPlace.address,
      coordinates: fallbackPlace.coordinates,
      placeId: input.placeId,
    };
  }

  return {
    name: input.name,
    address: input.address ?? "Dhaka, Bangladesh",
    coordinates: DHAKA_CENTER,
    placeId: input.placeId,
  };
}
