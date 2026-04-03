import { describe, expect, it } from "vitest";

import {
  dhakaBusSeedStops,
  getDhakaBusStopByLabel,
  getDhakaBusStopCoordinatesByLabel,
} from "@/lib/data/dhaka-bus-seed";

describe("dhaka bus stop coordinate ingestion", () => {
  it("applies coordinate overrides to matching bus stops", () => {
    const pallabiStop = getDhakaBusStopByLabel("Pallabi");

    expect(pallabiStop).toBeDefined();
    expect(pallabiStop?.coordinates).toEqual([23.8216, 90.3653]);
    expect(pallabiStop?.coordinateSource).toBe("seed_hub_alignment");
  });

  it("preserves approved geocode display addresses for bus stops", () => {
    const technicalStop = getDhakaBusStopByLabel("Technical");

    expect(technicalStop).toBeDefined();
    expect(technicalStop?.placeName).toBe("Technical Mor Bus stop");
    expect(technicalStop?.address).toContain("Technical Mor Bus stop");
    expect(technicalStop?.address).toMatch(/Dhaka|ঢাকা/u);
  });

  it("resolves coordinates from localized stop labels too", () => {
    expect(getDhakaBusStopCoordinatesByLabel("Pallabi (পল্লবী)")).toEqual([23.8216, 90.3653]);
    expect(getDhakaBusStopCoordinatesByLabel("Kazipara (কাজীপাড়া)")).toEqual([23.8095, 90.3687]);
  });

  it("keeps the public stop list enriched with coordinates", () => {
    const seededStops = dhakaBusSeedStops.filter((stop) => stop.coordinates);

    expect(seededStops.length).toBeGreaterThan(0);
  });

  it("keeps the public stop list enriched with bus stop addresses", () => {
    const addressedStops = dhakaBusSeedStops.filter((stop) => stop.address);

    expect(addressedStops.length).toBeGreaterThan(0);
  });

  it("keeps multi-stop section variants for grouped bus stops", () => {
    const mirpur1Stop = getDhakaBusStopByLabel("Mirpur 1");

    expect(mirpur1Stop).toBeDefined();
    expect(mirpur1Stop?.variants?.length).toBeGreaterThan(1);
    expect(mirpur1Stop?.variants?.map((variant) => variant.placeName)).toContain("Mirpur 1 Bus Stop");
    expect(mirpur1Stop?.variants?.map((variant) => variant.placeName)).toContain("Sony Hall / Mirpur 1");
  });
});
