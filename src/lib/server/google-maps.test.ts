import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { resolveLocation } from "@/lib/server/google-maps";

describe("resolveLocation", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "test-key");
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("prefers an exact placeId geocode over fuzzy known-place matching", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "OK",
        results: [
          {
            formatted_address: "Road 14 Rupnagar Rd, Dhaka 1216, Bangladesh",
            place_id: "exact-place-id",
            geometry: {
              location: {
                lat: 23.8145337,
                lng: 90.356373,
              },
            },
          },
        ],
      }),
    }) as typeof fetch;

    const result = await resolveLocation({
      name: "Rupnagar Residential Area Central Mosque & Madrasah",
      address: "Rupnagar Road, Dhaka, Bangladesh",
      placeId: "exact-place-id",
      type: "place",
    });

    expect(result.coordinates).toEqual([23.8145337, 90.356373]);
    expect(result.address).toBe("Road 14 Rupnagar Rd, Dhaka 1216, Bangladesh");
    expect(result.placeId).toBe("exact-place-id");
  });

  it("still uses the local fallback place list when no exact placeId is provided", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: "ZERO_RESULTS",
        results: [],
      }),
    }) as typeof fetch;

    const result = await resolveLocation({
      name: "Bashundhara Residential Area",
      type: "place",
    });

    expect(result.coordinates).toEqual([23.8151, 90.4396]);
    expect(result.name).toBe("Bashundhara Residential Area");
  });
});
