import { searchMixedLocationSuggestions } from "@/lib/server/transit-resolver";

export async function searchLocations(query: string) {
  return searchMixedLocationSuggestions(query);
}
