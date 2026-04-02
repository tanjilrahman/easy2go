import { describe, expect, it } from "vitest";

import {
  calculateRoutes,
  createPathSignature,
  estimateRickshawFareBdt,
  surfaceRoutes,
} from "@/lib/server/route-planner";
import { routeOptionSchema, type RouteOption } from "@/lib/validations/routes";

function makeRoute(overrides: Partial<RouteOption> = {}) {
  const base: RouteOption = {
    id: "route-a",
    kind: "bus_direct",
    confidence: "verified",
    summary: "Bus direct",
    pathSignature: "",
    fareType: "advisory",
    fareText: "Approx. BDT 35",
    totalCost: 35,
    estimatedDistanceKm: 6.2,
    estimatedDurationMinutes: 35,
    serviceWindowText: "06:00 - 22:00",
    stopCount: 7,
    stationCount: undefined,
    transferCount: 0,
    boarding: { label: "Farmgate", type: "bus_stop", id: "farmgate" },
    alighting: { label: "Motijheel", type: "bus_stop", id: "motijheel" },
    transferStops: [],
    serviceLabels: ["Anabil"],
    primaryServiceLabel: "Anabil",
    highlights: [],
    tradeoffs: [],
    primaryReason: undefined,
    segments: [
      {
        mode: "bus",
        instruction: "Board Anabil",
        startLocation: "Farmgate",
        endLocation: "Motijheel",
        fareText: "Approx. BDT 35",
        estimatedDistanceKm: 6.2,
        estimatedDurationMinutes: 35,
        stopCount: 7,
      },
    ],
    mapPreview: {
      originLabel: "Farmgate",
      destinationLabel: "Motijheel",
      originQuery: "Farmgate, Dhaka, Bangladesh",
      destinationQuery: "Motijheel, Dhaka, Bangladesh",
    },
    advisories: [],
  };

  const merged = { ...base, ...overrides };
  const withSignature = {
    ...merged,
    pathSignature:
      overrides.pathSignature ??
      createPathSignature({
        kind: merged.kind,
        boarding: merged.boarding,
        alighting: merged.alighting,
        transferStops: merged.transferStops,
        segments: merged.segments,
        mapPreview: merged.mapPreview,
      }),
  };

  return routeOptionSchema.parse(withSignature);
}

describe("estimateRickshawFareBdt", () => {
  it("uses the stepped fare heuristic with a cap", () => {
    expect(estimateRickshawFareBdt(1)).toBe(25);
    expect(estimateRickshawFareBdt(1.2)).toBe(35);
    expect(estimateRickshawFareBdt(3.4)).toBe(70);
  });
});

describe("surfaceRoutes", () => {
  it("merges same-path bus choices into one surfaced route", () => {
    const anabil = makeRoute({
      id: "route-anabil",
      summary: "Anabil direct",
      serviceLabels: ["Anabil"],
      primaryServiceLabel: "Anabil",
      segments: [
        {
          mode: "bus",
          instruction: "Board Anabil",
          startLocation: "Farmgate",
          endLocation: "Motijheel",
          fareText: "Approx. BDT 35",
          estimatedDistanceKm: 6.2,
          estimatedDurationMinutes: 35,
          stopCount: 7,
        },
      ],
    });
    const bikalpa = makeRoute({
      id: "route-bikalpa",
      summary: "Bikalpa direct",
      serviceLabels: ["Bikalpa"],
      primaryServiceLabel: "Bikalpa",
      segments: [
        {
          mode: "bus",
          instruction: "Board Bikalpa",
          startLocation: "Farmgate",
          endLocation: "Motijheel",
          fareText: "Approx. BDT 35",
          estimatedDistanceKm: 6.2,
          estimatedDurationMinutes: 35,
          stopCount: 7,
        },
      ],
    });

    const surfaced = surfaceRoutes([anabil, bikalpa], "recommended");

    expect(surfaced).toHaveLength(1);
    expect(surfaced[0]?.serviceLabels).toEqual(["Anabil", "Bikalpa"]);
  });

  it("surfaces fastest first and keeps one meaningful alternative", () => {
    const fastest = makeRoute({
      id: "fastest",
      summary: "Direct bus corridor",
      estimatedDurationMinutes: 32,
      totalCost: 45,
      fareText: "Approx. BDT 45",
      serviceLabels: ["Anabil"],
      primaryServiceLabel: "Anabil",
    });
    const alternative = makeRoute({
      id: "metro-alt",
      kind: "metro_direct",
      confidence: "exact",
      summary: "Metro direct",
      fareType: "exact",
      fareText: "BDT 40",
      totalCost: 40,
      estimatedDurationMinutes: 37,
      stationCount: 5,
      stopCount: undefined,
      serviceLabels: ["MRT Line 6"],
      primaryServiceLabel: "MRT Line 6",
      boarding: { label: "Farmgate Metro", type: "metro_station", id: "farmgate-metro" },
      alighting: { label: "Motijheel Metro", type: "metro_station", id: "motijheel-metro" },
      segments: [
        {
          mode: "metro",
          instruction: "Ride Metro Rail Line 6",
          startLocation: "Farmgate Metro",
          endLocation: "Motijheel Metro",
          fareText: "BDT 40",
          estimatedDistanceKm: 5.4,
          estimatedDurationMinutes: 37,
          stationCount: 5,
        },
      ],
      mapPreview: {
        originLabel: "Farmgate Metro",
        destinationLabel: "Motijheel Metro",
        originQuery: "Farmgate Metro, Dhaka, Bangladesh",
        destinationQuery: "Motijheel Metro, Dhaka, Bangladesh",
      },
      transferStops: [],
    });
    const noisyThird = makeRoute({
      id: "slow-third",
      estimatedDurationMinutes: 55,
      totalCost: 30,
      fareText: "Approx. BDT 30",
      transferCount: 1,
      transferStops: [{ label: "Press Club", type: "hub", id: "press-club" }],
      serviceLabels: ["Shrabon"],
      primaryServiceLabel: "Shrabon",
      segments: [
        {
          mode: "bus",
          instruction: "Board Shrabon",
          startLocation: "Farmgate",
          endLocation: "Press Club",
          fareText: "Approx. BDT 15",
          estimatedDistanceKm: 3,
          estimatedDurationMinutes: 25,
          stopCount: 4,
        },
        {
          mode: "walk",
          instruction: "Change buses",
          startLocation: "Press Club",
          endLocation: "Press Club",
          estimatedDurationMinutes: 6,
        },
        {
          mode: "bus",
          instruction: "Board Local",
          startLocation: "Press Club",
          endLocation: "Motijheel",
          fareText: "Approx. BDT 15",
          estimatedDistanceKm: 3.2,
          estimatedDurationMinutes: 24,
          stopCount: 4,
        },
      ],
      mapPreview: {
        originLabel: "Farmgate",
        destinationLabel: "Motijheel",
        originQuery: "Farmgate, Dhaka, Bangladesh",
        destinationQuery: "Motijheel, Dhaka, Bangladesh",
      },
    });

    const surfaced = surfaceRoutes([fastest, alternative, noisyThird], "recommended");

    expect(surfaced).toHaveLength(2);
    expect(surfaced[0]?.id).toBe("fastest");
    expect(surfaced[0]?.primaryReason).toBe("Fastest total travel time");
    expect(surfaced[1]?.id).toBe("metro-alt");
  });

  it("skips a visually duplicate route when picking the alternative", () => {
    const fastest = makeRoute({
      id: "fastest",
      summary: "Direct bus corridor",
      estimatedDurationMinutes: 32,
      totalCost: 45,
      fareText: "Approx. BDT 45",
      serviceLabels: ["Anabil"],
      primaryServiceLabel: "Anabil",
    });
    const duplicatePresentation = makeRoute({
      id: "duplicate-presentation",
      summary: "Direct bus corridor",
      estimatedDurationMinutes: 34,
      totalCost: 45,
      fareText: "Approx. BDT 45",
      serviceLabels: ["Anabil"],
      primaryServiceLabel: "Anabil",
      segments: [
        {
          mode: "walk",
          instruction: "Walk connector",
          startLocation: "Farmgate Overbridge",
          endLocation: "Farmgate",
          estimatedDurationMinutes: 4,
          connectorType: "walk",
        },
        {
          mode: "bus",
          instruction: "Board Anabil",
          startLocation: "Farmgate",
          endLocation: "Motijheel",
          fareText: "Approx. BDT 45",
          estimatedDistanceKm: 6.2,
          estimatedDurationMinutes: 30,
          stopCount: 7,
        },
      ],
      mapPreview: {
        originLabel: "Farmgate Overbridge",
        destinationLabel: "Motijheel",
        originQuery: "Farmgate Overbridge, Dhaka, Bangladesh",
        destinationQuery: "Motijheel, Dhaka, Bangladesh",
      },
    });
    const metroAlternative = makeRoute({
      id: "metro-alt",
      kind: "metro_direct",
      confidence: "exact",
      summary: "Metro direct",
      fareType: "exact",
      fareText: "BDT 40",
      totalCost: 40,
      estimatedDurationMinutes: 37,
      stationCount: 5,
      stopCount: undefined,
      serviceLabels: ["MRT Line 6"],
      primaryServiceLabel: "MRT Line 6",
      boarding: { label: "Farmgate Metro", type: "metro_station", id: "farmgate-metro" },
      alighting: { label: "Motijheel Metro", type: "metro_station", id: "motijheel-metro" },
      segments: [
        {
          mode: "metro",
          instruction: "Ride Metro Rail Line 6",
          startLocation: "Farmgate Metro",
          endLocation: "Motijheel Metro",
          fareText: "BDT 40",
          estimatedDistanceKm: 5.4,
          estimatedDurationMinutes: 37,
          stationCount: 5,
        },
      ],
      mapPreview: {
        originLabel: "Farmgate Metro",
        destinationLabel: "Motijheel Metro",
        originQuery: "Farmgate Metro, Dhaka, Bangladesh",
        destinationQuery: "Motijheel Metro, Dhaka, Bangladesh",
      },
      transferStops: [],
    });

    const surfaced = surfaceRoutes(
      [fastest, duplicatePresentation, metroAlternative],
      "recommended",
    );

    expect(surfaced).toHaveLength(2);
    expect(surfaced[0]?.id).toBe("fastest");
    expect(surfaced[1]?.id).toBe("metro-alt");
  });

  it("does not surface another metro-based route when the fastest route already uses metro", () => {
    const fastestMetro = makeRoute({
      id: "fastest-metro",
      kind: "metro_direct",
      confidence: "exact",
      summary: "Metro direct",
      fareType: "exact",
      fareText: "BDT 40",
      totalCost: 40,
      estimatedDurationMinutes: 28,
      stationCount: 5,
      stopCount: undefined,
      serviceLabels: ["MRT Line 6"],
      primaryServiceLabel: "MRT Line 6",
      boarding: { label: "Farmgate Metro", type: "metro_station", id: "farmgate-metro" },
      alighting: { label: "Motijheel Metro", type: "metro_station", id: "motijheel-metro" },
      segments: [
        {
          mode: "metro",
          instruction: "Ride Metro Rail Line 6",
          startLocation: "Farmgate Metro",
          endLocation: "Motijheel Metro",
          fareText: "BDT 40",
          estimatedDistanceKm: 5.4,
          estimatedDurationMinutes: 28,
          stationCount: 5,
        },
      ],
      mapPreview: {
        originLabel: "Farmgate Metro",
        destinationLabel: "Motijheel Metro",
        originQuery: "Farmgate Metro, Dhaka, Bangladesh",
        destinationQuery: "Motijheel Metro, Dhaka, Bangladesh",
      },
      transferStops: [],
    });
    const secondMetro = makeRoute({
      id: "second-metro",
      kind: "bus_metro_hybrid",
      summary: "Bus + Metro link",
      totalCost: 45,
      fareText: "Approx. BDT 45",
      estimatedDurationMinutes: 31,
      transferCount: 1,
      stationCount: 3,
      stopCount: 4,
      serviceLabels: ["Anabil", "MRT Line 6"],
      primaryServiceLabel: "Anabil",
      boarding: { label: "Farmgate", type: "bus_stop", id: "farmgate" },
      alighting: { label: "Motijheel Metro", type: "metro_station", id: "motijheel-metro" },
      transferStops: [{ label: "Karwan Bazar Metro", type: "metro_station", id: "karwan-bazar-metro" }],
      segments: [
        {
          mode: "bus",
          instruction: "Board Anabil",
          startLocation: "Farmgate",
          endLocation: "Karwan Bazar",
          fareText: "Approx. BDT 15",
          estimatedDistanceKm: 2,
          estimatedDurationMinutes: 10,
          stopCount: 4,
        },
        {
          mode: "metro",
          instruction: "Continue by Metro Rail Line 6",
          startLocation: "Karwan Bazar Metro",
          endLocation: "Motijheel Metro",
          fareText: "BDT 30",
          estimatedDistanceKm: 3.4,
          estimatedDurationMinutes: 15,
          stationCount: 3,
        },
      ],
      mapPreview: {
        originLabel: "Farmgate",
        destinationLabel: "Motijheel Metro",
        originQuery: "Farmgate, Dhaka, Bangladesh",
        destinationQuery: "Motijheel Metro, Dhaka, Bangladesh",
      },
    });
    const busAlternative = makeRoute({
      id: "bus-alt",
      summary: "Direct bus corridor",
      totalCost: 50,
      fareText: "Approx. BDT 50",
      estimatedDurationMinutes: 36,
      serviceLabels: ["Anabil"],
      primaryServiceLabel: "Anabil",
    });

    const surfaced = surfaceRoutes(
      [fastestMetro, secondMetro, busAlternative],
      "recommended",
    );

    expect(surfaced).toHaveLength(2);
    expect(surfaced[0]?.id).toBe("fastest-metro");
    expect(surfaced[1]?.id).toBe("bus-alt");
  });
});

describe("calculateRoutes", () => {
  it("falls back to the closest bus corridor plus rickshaw instead of returning no route", async () => {
    const response = await calculateRoutes({
      origin: {
        name: "Farmgate",
        canonicalId: "hub-farmgate",
        type: "hub",
      },
      destination: {
        name: "Demra fringe",
        coordinates: [23.6905, 90.5045],
        type: "place",
      },
      optimization: "recommended",
    });

    expect(response.routes.length).toBeGreaterThan(0);
    expect(response.routes[0]?.kind).not.toBe("advisory_connector");
    expect(response.routes[0]?.segments.some((segment) => segment.mode === "bus")).toBe(true);
    expect(response.routes[0]?.segments.at(-1)?.mode).toBe("rickshaw");
    expect(response.routes[0]?.alighting.type).toBe("bus_stop");
  });
});
