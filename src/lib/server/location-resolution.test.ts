import { describe, expect, it } from "vitest";

import { resolveLocation, searchFallbackPlaces } from "@/lib/server/location-resolution";

describe("location resolution", () => {
  it("resolves known places locally without a network lookup", () => {
    const result = resolveLocation({
      name: "Bashundhara Residential Area",
      type: "place",
    });

    expect(result.coordinates).toEqual([23.8151, 90.4396]);
    expect(result.address).toBe("Dhaka");
  });

  it("returns nearby fallback places for fuzzy names", () => {
    const result = searchFallbackPlaces("Motijheel");

    expect(result.length).toBeGreaterThan(0);
    expect(result[0]?.name).toContain("Motijheel");
  });
});

