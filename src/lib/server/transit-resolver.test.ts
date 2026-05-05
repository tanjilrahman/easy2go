import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveTransitInput,
  searchLocalTransitSuggestions,
  searchMixedLocationSuggestions,
} from "@/lib/server/transit-resolver";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("transit resolver bus stop metadata", () => {
  it("orders coordinate-based bus stop candidates by closest distance", async () => {
    const resolution = await resolveTransitInput({
      name: "near Farmgate",
      coordinates: [23.75905, 90.3871],
      type: "place",
    });
    const busStops = resolution.candidates.filter((candidate) => candidate.type === "bus_stop");

    expect(busStops[0]?.name).toBe("ফার্মগেট");
  });

  it("matches bus stops by approved place-name aliases", () => {
    const suggestions = searchLocalTransitSuggestions("technical mor");

    expect(suggestions[0]?.type).toBe("bus_stop");
    expect(suggestions[0]?.name).toBe("Technical Mor Bus stop, Bus stop");
    expect(suggestions[0]?.address).toContain("Technical Mor Bus stop");
  });

  it("does not surface unreviewed grouped-stop variants", () => {
    const suggestions = searchLocalTransitSuggestions("mirpur 1");
    const busStopNames = suggestions
      .filter((suggestion) => suggestion.type === "bus_stop")
      .map((suggestion) => suggestion.name);

    expect(busStopNames).toContain("Mirpur 1 Bus Stop, Bus station");
    expect(busStopNames).not.toContain("Sony Hall / Mirpur 1");
  });

  it("uses local suggestions without external autocomplete when local coverage is strong", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "test-key");
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as typeof fetch;

    const suggestions = await searchMixedLocationSuggestions("mirpur 1");

    expect(suggestions.length).toBeGreaterThanOrEqual(4);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("falls back to Geoapify autocomplete for unknown typed places", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "test-key");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              place_id: "coffee-place-id",
              name: "Coffee House",
              formatted: "Coffee House, Dhanmondi, Dhaka, Bangladesh",
            },
            geometry: {
              coordinates: [90.3742, 23.7461],
            },
          },
        ],
      }),
    }) as typeof fetch;

    const suggestions = await searchMixedLocationSuggestions("coffee house dhanmondi");

    expect(suggestions.some((suggestion) => suggestion.provider === "geoapify")).toBe(true);
    expect(suggestions[0]?.coordinates).toEqual([23.7461, 90.3742]);
  });

  it("survives Geoapify failures by returning local results", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "test-key");
    global.fetch = vi.fn().mockRejectedValue(new Error("rate limited")) as typeof fetch;

    const suggestions = await searchMixedLocationSuggestions("technical mor");

    expect(suggestions[0]?.name).toBe("Technical Mor Bus stop, Bus stop");
  });
});
