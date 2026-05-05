import { describe, expect, it, vi } from "vitest";

import { dhakaBusSeedRoutes } from "@/lib/data/dhaka-bus-seed";
import {
  calculateRoutes,
  createPathSignature,
  estimateBusLegDistanceKm,
  estimateMetroDistanceKm,
  estimateRickshawFareBdt,
  surfaceRoutes,
} from "@/lib/server/route-planner";
import type { RouteOption } from "@/lib/validations/routes";

function makeRoute(overrides: Partial<RouteOption> & Pick<RouteOption, "id">): RouteOption {
  const base = {
    id: overrides.id,
    kind: "bus_direct" as const,
    confidence: "verified" as const,
    summary: "Bus direct",
    pathSignature: "",
    fareType: "advisory" as const,
    fareText: "Approx. BDT 20",
    totalCost: 20,
    totalCostLowBdt: 20,
    totalCostHighBdt: 20,
    estimatedDistanceKm: 3,
    estimatedDurationMinutes: 20,
    stopCount: 3,
    transferCount: 0,
    boarding: { label: "Farmgate", type: "bus_stop" as const },
    alighting: { label: "Motijheel", type: "bus_stop" as const },
    transferStops: [],
    serviceLabels: ["Test Bus"],
    primaryServiceLabel: "Test Bus",
    highlights: [],
    tradeoffs: [],
    segments: [
      {
        mode: "bus" as const,
        instruction: "Board Test Bus",
        startLocation: "Farmgate",
        endLocation: "Motijheel",
      },
    ],
    mapPreview: {
      originLabel: "Farmgate",
      destinationLabel: "Motijheel",
      originQuery: "Farmgate",
      destinationQuery: "Motijheel",
      points: [],
      lines: [],
    },
    advisories: [],
  } satisfies RouteOption;
  const route = { ...base, ...overrides };

  return {
    ...route,
    pathSignature: overrides.pathSignature ?? createPathSignature(route),
  };
}

describe("simple distance and fare estimation", () => {
  it("uses a small calibrated rickshaw fare heuristic", () => {
    expect(estimateRickshawFareBdt(0.4)).toBe(20);
    expect(estimateRickshawFareBdt(1.1)).toBe(40);
  });

  it("estimates metro distance from the metro station dataset", () => {
    expect(estimateMetroDistanceKm("metro-farmgate", "metro-motijheel", 5)).toBeCloseTo(4.7, 1);
  });

  it("estimates bus distance from reviewed bus stop coordinates", () => {
    const route = dhakaBusSeedRoutes.find(
      (candidate) => candidate.id === "route-al-madina-plus-one-nandan-park-to-kamalapur-9",
    );

    expect(route).toBeDefined();

    const boardingIndex = route?.stopLabels.findIndex((label) => label.includes("Farmgate")) ?? -1;
    const alightingIndex = route?.stopLabels.findIndex((label) => label.includes("Motijheel")) ?? -1;

    expect(boardingIndex).toBeGreaterThanOrEqual(0);
    expect(alightingIndex).toBeGreaterThan(boardingIndex);

    expect(
      estimateBusLegDistanceKm({
        route: route!,
        boardingLabel: route!.stopLabels[boardingIndex]!,
        alightingLabel: route!.stopLabels[alightingIndex]!,
        stopCount: alightingIndex - boardingIndex,
      }),
    ).toBeCloseTo(5.7, 1);
  });
});

describe("surfaceRoutes", () => {
  it("keeps simple sorted route choices", () => {
    const fastest = makeRoute({ id: "fastest", pathSignature: "fastest", estimatedDurationMinutes: 15, totalCost: 40 });
    const cheapest = makeRoute({ id: "cheapest", pathSignature: "cheapest", estimatedDurationMinutes: 25, totalCost: 10 });

    expect(surfaceRoutes([cheapest, fastest], "fastest")[0]?.id).toBe("fastest");
    expect(surfaceRoutes([cheapest, fastest], "cheapest")[0]?.id).toBe("cheapest");
    expect(surfaceRoutes([cheapest, fastest], "recommended")).toHaveLength(2);
  });
});

describe("calculateRoutes", () => {
  it("returns a direct metro route from metro station dataset matches", async () => {
    const response = await calculateRoutes({
      origin: {
        name: "Mirpur 11 Metro Station",
        canonicalId: "metro-mirpur-11",
        type: "metro_station",
      },
      destination: {
        name: "Agargaon Metro Station",
        canonicalId: "metro-agargaon",
        type: "metro_station",
      },
      optimization: "recommended",
    });

    expect(response.routes).toHaveLength(1);
    expect(response.routes[0]?.kind).toBe("metro_direct");
    expect(response.routes[0]?.fareText).toBe("BDT 30");
    expect(response.routes[0]?.totalCost).toBe(30);
  });

  it("keeps user-selected endpoint labels in route previews", async () => {
    const response = await calculateRoutes({
      origin: {
        name: "Custom start",
        coordinates: [23.7591, 90.3872],
        type: "place",
      },
      destination: {
        name: "Custom end",
        coordinates: [23.7325, 90.4172],
        type: "place",
      },
      optimization: "fastest",
    });

    expect(response.routes.length).toBeGreaterThan(0);
    expect(response.routes[0]?.mapPreview.originLabel).toBe("Custom start");
    expect(response.routes[0]?.mapPreview.destinationLabel).toBe("Custom end");
  });

  it("uses only local bus and metro datasets while calculating routes", async () => {
    const fetchSpy = vi.fn();
    global.fetch = fetchSpy as typeof fetch;

    await calculateRoutes({
      origin: { name: "Farmgate", canonicalId: "metro-farmgate", type: "metro_station" },
      destination: { name: "Motijheel", canonicalId: "metro-motijheel", type: "metro_station" },
      optimization: "recommended",
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
