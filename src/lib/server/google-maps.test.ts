import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { searchGooglePlaces } from "@/lib/server/google-maps";

describe("searchGooglePlaces", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("returns no results when autocomplete is disabled", async () => {
    vi.stubEnv("GOOGLE_AUTOCOMPLETE_ENABLED", "false");
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as typeof fetch;

    const result = await searchGooglePlaces("Farmgate");

    expect(result).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("maps autocomplete predictions into local suggestions", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        predictions: [
          {
            description: "Farmgate, Dhaka, Bangladesh",
            place_id: "farmgate-place-id",
            structured_formatting: {
              main_text: "Farmgate",
              secondary_text: "Dhaka, Bangladesh",
            },
          },
        ],
      }),
    }) as typeof fetch;

    const result = await searchGooglePlaces("Farmgate");

    expect(result).toHaveLength(1);
    expect(result[0]?.name).toBe("Farmgate");
    expect(result[0]?.address).toBe("Dhaka, Bangladesh");
    expect(result[0]?.placeId).toBe("farmgate-place-id");
  });
});

