import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { searchGeoapifyPlaces } from "@/lib/server/geoapify";

describe("searchGeoapifyPlaces", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("GEOAPIFY_API_KEY", "test-key");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns no results when autocomplete is disabled", async () => {
    vi.stubEnv("GEOAPIFY_AUTOCOMPLETE_ENABLED", "false");
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as typeof fetch;

    const result = await searchGeoapifyPlaces("Farmgate");

    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("returns no results without an API key", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "");
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as typeof fetch;

    const result = await searchGeoapifyPlaces("Farmgate");

    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps autocomplete features into location suggestions", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              place_id: "farmgate-place-id",
              name: "Farmgate",
              formatted: "Farmgate, Dhaka, Bangladesh",
              address_line1: "Farmgate",
              address_line2: "Dhaka, Bangladesh",
            },
            geometry: {
              coordinates: [90.3891, 23.7579],
            },
          },
        ],
      }),
    }) as typeof fetch;

    const result = await searchGeoapifyPlaces("Farmgate");

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      id: "farmgate-place-id",
      name: "Farmgate",
      address: "Farmgate, Dhaka, Bangladesh",
      placeId: "farmgate-place-id",
      coordinates: [23.7579, 90.3891],
      provider: "geoapify",
      confidence: "external",
    });
  });

  it("handles provider failures with an empty result", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({}),
    }) as typeof fetch;

    await expect(searchGeoapifyPlaces("Farmgate")).resolves.toEqual([]);
  });
});
