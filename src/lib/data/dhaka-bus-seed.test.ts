import { describe, expect, it } from "vitest";

import {
  dhakaBusSeedStops,
  getDhakaBusStopByLabel,
  getDhakaBusStopCoordinatesByLabel,
} from "@/lib/data/dhaka-bus-seed";

describe("dhaka bus stop coordinate ingestion", () => {
  it("applies coordinate overrides to matching bus stops", () => {
    const farmgateStop = getDhakaBusStopByLabel("Farmgate");

    expect(farmgateStop).toBeDefined();
    expect(farmgateStop?.coordinates).toEqual([23.7590206, 90.387124]);
    expect(farmgateStop?.coordinateSource).toBe("osm:node/10294553595");
    expect(farmgateStop?.coordinateConfidence).toBe("verified");
  });

  it("preserves approved geocode display addresses for bus stops", () => {
    const technicalStop = getDhakaBusStopByLabel("Technical");

    expect(technicalStop).toBeDefined();
    expect(technicalStop?.placeName).toBe("Technical Mor Bus stop, Bus stop");
    expect(technicalStop?.address).toContain("Technical Mor Bus stop");
    expect(technicalStop?.coordinateSource).toBe("osm:node/12518138812");
  });

  it("resolves coordinates from localized stop labels too", () => {
    expect(getDhakaBusStopCoordinatesByLabel("Farmgate (ফার্মগেট)")).toEqual([23.7590206, 90.387124]);
    expect(getDhakaBusStopCoordinatesByLabel("Kazipara (কাজীপাড়া)")).toEqual([23.7992485, 90.3720193]);
  });

  it("keeps the public stop list enriched with coordinates", () => {
    const seededStops = dhakaBusSeedStops.filter((stop) => stop.coordinates);

    expect(seededStops.length).toBeGreaterThan(0);
  });

  it("keeps the public stop list enriched with bus stop addresses", () => {
    const addressedStops = dhakaBusSeedStops.filter((stop) => stop.address);

    expect(addressedStops.length).toBeGreaterThan(0);
  });

  it("does not enrich stops from the old unreviewed variants file", () => {
    const janapothMoorStop = getDhakaBusStopByLabel("Janapoth Moor");

    expect(janapothMoorStop).toBeDefined();
    expect(janapothMoorStop?.coordinates).toBeUndefined();
    expect(janapothMoorStop?.variants).toBeUndefined();
  });
});
