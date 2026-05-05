import { DHAKA_CENTER } from "@/lib/maps";
import { normalizeTransitText } from "@/lib/server/transit-support";
import type { LocationSuggestion } from "@/lib/validations/routes";

const GEOAPIFY_SEARCH_TIMEOUT_MS = 1800;

interface GeoapifyFeature {
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
}

interface GeoapifyPayload {
  features?: GeoapifyFeature[];
}

interface GeoapifySearchContext {
  key: string;
  trimmedQuery: string;
}

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

function createGeoapifySearchContext(query: string): GeoapifySearchContext | null {
  const trimmedQuery = query.trim();

  if (!isGeoapifyAutocompleteEnabled() || trimmedQuery.length < 3) {
    return null;
  }

  const key = getGeoapifyKey();
  if (!key) {
    return null;
  }

  return { key, trimmedQuery };
}

function geoapifyAddress(properties: GeoapifyFeature["properties"], formatted: string, name: string) {
  return properties?.address_line2
    ? `${properties.address_line1 ?? name}, ${properties.address_line2}`
    : formatted;
}

function geoapifySuggestionId(
  properties: GeoapifyFeature["properties"],
  name: string,
  formatted: string,
  index: number,
  suffix = "",
) {
  return properties?.place_id ?? `${normalizeTransitText(`${name}-${formatted}`)}${suffix}-${index}`;
}

function toGeoapifySuggestion(
  feature: GeoapifyFeature,
  index: number,
  options: { fallbackName?: string; idSuffix?: string; requireName?: boolean } = {},
): LocationSuggestion[] {
  const properties = feature.properties;
  const coordinates = feature.geometry?.coordinates;
  const formatted = properties?.formatted ?? properties?.address_line1;
  const name =
    properties?.name ??
    properties?.address_line1 ??
    formatted?.split(",")[0]?.trim() ??
    options.fallbackName;

  if (!coordinates || !formatted || (options.requireName && !name)) {
    return [];
  }

  const suggestionName = name ?? formatted;

  return [
    {
      id: geoapifySuggestionId(
        properties,
        suggestionName,
        formatted,
        index,
        options.idSuffix,
      ),
      name: suggestionName,
      address: geoapifyAddress(properties, formatted, suggestionName),
      type: "place",
      placeId: properties?.place_id,
      coordinates: [coordinates[1], coordinates[0]],
      provider: "geoapify",
      confidence: "external",
    },
  ];
}

async function fetchGeoapifySuggestions(
  url: URL,
  options: { fallbackName?: string; idSuffix?: string; requireName?: boolean } = {},
) {
  const payload = await fetchGeoapifyJson<GeoapifyPayload>(url);

  return (payload?.features ?? [])
    .slice(0, 6)
    .flatMap((feature, index) => toGeoapifySuggestion(feature, index, options));
}

export async function searchGeoapifyPlaces(query: string): Promise<LocationSuggestion[]> {
  const context = createGeoapifySearchContext(query);
  if (!context) {
    return [];
  }

  const url = new URL("https://api.geoapify.com/v1/geocode/autocomplete");
  url.searchParams.set("text", context.trimmedQuery);
  url.searchParams.set("filter", "countrycode:bd");
  url.searchParams.set("bias", `proximity:${DHAKA_CENTER[1]},${DHAKA_CENTER[0]}`);
  url.searchParams.set("limit", "6");
  url.searchParams.set("format", "geojson");
  url.searchParams.set("apiKey", context.key);

  return fetchGeoapifySuggestions(url, { fallbackName: context.trimmedQuery });
}

export async function searchGeoapifyPlacePois(query: string): Promise<LocationSuggestion[]> {
  const context = createGeoapifySearchContext(query);
  if (!context) {
    return [];
  }

  const url = new URL("https://api.geoapify.com/v2/places");
  url.searchParams.set("name", context.trimmedQuery);
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
  url.searchParams.set("apiKey", context.key);

  return fetchGeoapifySuggestions(url, { idSuffix: "-places", requireName: true });
}
