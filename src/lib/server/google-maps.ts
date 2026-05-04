import { DHAKA_CENTER } from "@/lib/maps";
import { normalizeTransitText } from "@/lib/server/transit-support";
import type { LocationSuggestion } from "@/lib/validations/routes";

function getServerKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
}

export function isGoogleAutocompleteEnabled() {
  const explicitFlag = process.env.GOOGLE_AUTOCOMPLETE_ENABLED;

  if (explicitFlag === "false" || explicitFlag === "0") {
    return false;
  }

  return Boolean(getServerKey());
}

export async function searchGooglePlaces(query: string): Promise<LocationSuggestion[]> {
  if (!isGoogleAutocompleteEnabled()) {
    return [];
  }

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

  const payload = (await response.json()) as {
    predictions?: Array<{
      description: string;
      place_id: string;
      structured_formatting?: {
        main_text?: string;
        secondary_text?: string;
      };
      types?: string[];
    }>;
  };

  return (payload.predictions ?? []).slice(0, 6).map((prediction, index) => ({
    id: prediction.place_id || `${normalizeTransitText(prediction.description)}-${index}`,
    name:
      prediction.structured_formatting?.main_text ??
      prediction.description.split(",")[0] ??
      prediction.description,
    address: prediction.structured_formatting?.secondary_text ?? prediction.description,
    type: "place",
    placeId: prediction.place_id,
  }));
}

