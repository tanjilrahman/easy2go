import { DHAKA_CENTER } from "@/lib/maps";
import { normalizeTransitText } from "@/lib/server/transit-support";
import type { LocationSuggestion } from "@/lib/validations/routes";

const GEOAPIFY_SEARCH_TIMEOUT_MS = 1800;

function getGeoapifyKey() {
  return process.env.GEOAPIFY_API_KEY ?? "";
}

export function isGeoapifyAutocompleteEnabled() {
  const explicitFlag = process.env.GEOAPIFY_AUTOCOMPLETE_ENABLED;

  if (explicitFlag === "false" || explicitFlag === "0") {
    return false;
  }

  return Boolean(getGeoapifyKey());
}

async function fetchGeoapifyJson<T>(url: URL): Promise<T | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), GEOAPIFY_SEARCH_TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function searchGeoapifyPlaces(query: string): Promise<LocationSuggestion[]> {
  const trimmedQuery = query.trim();

  if (!isGeoapifyAutocompleteEnabled() || trimmedQuery.length < 3) {
    return [];
  }

  const key = getGeoapifyKey();
  if (!key) {
    return [];
  }

  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", trimmedQuery);
  url.searchParams.set("filter", "countrycode:bd");
  url.searchParams.set("bias", `proximity:${DHAKA_CENTER[1]},${DHAKA_CENTER[0]}`);
  url.searchParams.set("limit", "6");
  url.searchParams.set("format", "geojson");
  url.searchParams.set("apiKey", key);

  const payload = await fetchGeoapifyJson<{
    features?: Array<{
      properties?: {
        place_id?: string;
        name?: string;
        formatted?: string;
        address_line1?: string;
        address_line2?: string;
      };
      geometry?: {
        coordinates?: [number, number];
      };
    }>;
  }>(url);

  return (payload?.features ?? []).slice(0, 6).flatMap((feature, index) => {
    const properties = feature.properties;
    const coordinates = feature.geometry?.coordinates;
    const formatted = properties?.formatted ?? properties?.address_line1;
    const name =
      properties?.name ??
      properties?.address_line1 ??
      formatted?.split(",")[0]?.trim() ??
      trimmedQuery;

    if (!coordinates || !formatted) {
      return [];
    }

    return [
      {
        id:
          properties?.place_id ??
          `${normalizeTransitText(`${name}-${formatted}`)}-${index}`,
        name,
        address: properties?.address_line2
          ? `${properties.address_line1 ?? name}, ${properties.address_line2}`
          : formatted,
        type: "place" as const,
        placeId: properties?.place_id,
        coordinates: [coordinates[1], coordinates[0]],
        provider: "geoapify" as const,
        confidence: "external" as const,
      },
    ];
  });
}

export async function searchGeoapifyPlacePois(query: string): Promise<LocationSuggestion[]> {
  const trimmedQuery = query.trim();

  if (!isGeoapifyAutocompleteEnabled() || trimmedQuery.length < 3) {
    return [];
  }

  const key = getGeoapifyKey();
  if (!key) {
    return [];
  }

  const url = new URL("https://api.geoapify.com/v2/places");
  url.searchParams.set("name", trimmedQuery);
  url.searchParams.set(
    "categories",
    [
      "commercial",
      "education",
      "healthcare",
      "leisure",
      "tourism",
      "public_transport",
      "service.financial",
      "building.university",
    ].join(","),
  );
  url.searchParams.set("filter", `circle:${DHAKA_CENTER[1]},${DHAKA_CENTER[0]},35000`);
  url.searchParams.set("bias", `proximity:${DHAKA_CENTER[1]},${DHAKA_CENTER[0]}`);
  url.searchParams.set("limit", "6");
  url.searchParams.set("apiKey", key);

  const payload = await fetchGeoapifyJson<{
    features?: Array<{
      properties?: {
        place_id?: string;
        name?: string;
        formatted?: string;
        address_line1?: string;
        address_line2?: string;
        categories?: string[];
      };
      geometry?: {
        coordinates?: [number, number];
      };
    }>;
  }>(url);

  return (payload?.features ?? []).slice(0, 6).flatMap((feature, index) => {
    const properties = feature.properties;
    const coordinates = feature.geometry?.coordinates;
    const formatted = properties?.formatted ?? properties?.address_line1;
    const name = properties?.name ?? properties?.address_line1 ?? formatted?.split(",")[0]?.trim();

    if (!coordinates || !formatted || !name) {
      return [];
    }

    return [
      {
        id:
          properties?.place_id ??
          `${normalizeTransitText(`${name}-${formatted}`)}-places-${index}`,
        name,
        address: properties?.address_line2
          ? `${properties.address_line1 ?? name}, ${properties.address_line2}`
          : formatted,
        type: "place" as const,
        placeId: properties?.place_id,
        coordinates: [coordinates[1], coordinates[0]],
        provider: "geoapify" as const,
        confidence: "external" as const,
      },
    ];
  });
}
