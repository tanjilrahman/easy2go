import { afterEach, describe, expect, it, vi } from "vitest";

import { dhakaBusSeedRoutes } from "@/lib/data/dhaka-bus-seed";
import {
  calculateRoutes,
  createPathSignature,
  estimateBusLegDistanceKm,
  estimateMetroDistanceKm,
  estimateRickshawFareBdt,
  filterPostSnapDurationOutliers,
  surfaceRoutes,
} from "@/lib/server/route-planner";
import { normalizeTransitText } from "@/lib/server/transit-support";
import type { RouteOption } from "@/lib/validations/routes";

const originalFetch = global.fetch;

afterEach(() => {
  global.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

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
    expect(estimateMetroDistanceKm("metro-farmgate", "metro-motijheel", 5)).toBeCloseTo(5.6, 1);
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

  it("removes extreme post-snap duration outliers", () => {
    const practical = makeRoute({
      id: "practical",
      pathSignature: "practical",
      estimatedDurationMinutes: 60,
      totalCost: 100,
      totalCostLowBdt: 100,
    });
    const comparable = makeRoute({
      id: "comparable",
      pathSignature: "comparable",
      estimatedDurationMinutes: 82,
      totalCost: 90,
      totalCostLowBdt: 90,
    });
    const outlier = makeRoute({
      id: "outlier",
      pathSignature: "outlier",
      estimatedDurationMinutes: 150,
      totalCost: 95,
      totalCostLowBdt: 95,
    });

    expect(
      filterPostSnapDurationOutliers([practical, outlier, comparable]).map(
        (route) => route.id,
      ),
    ).toEqual(["practical", "comparable"]);
  });

  it("removes post-snap routes with unreasonable long connector time", () => {
    const practical = makeRoute({
      id: "practical",
      pathSignature: "practical",
      estimatedDurationMinutes: 85,
      totalCost: 120,
      totalCostLowBdt: 120,
    });
    const longConnectorOutlier = makeRoute({
      id: "long-connector-outlier",
      pathSignature: "long-connector-outlier",
      estimatedDurationMinutes: 95,
      totalCost: 110,
      totalCostLowBdt: 110,
      segments: [
        {
          mode: "rickshaw",
          instruction: "Local connector",
          startLocation: "Origin",
          endLocation: "Boarding",
          connectorType: "long_rickshaw",
          estimatedDurationMinutes: 64,
          estimatedDistanceKm: 8,
        },
        {
          mode: "bus",
          instruction: "Board Test Bus",
          startLocation: "Boarding",
          endLocation: "Destination",
          estimatedDurationMinutes: 31,
        },
      ],
    });
    const cheapLongConnector = makeRoute({
      id: "cheap-long-connector",
      pathSignature: "cheap-long-connector",
      estimatedDurationMinutes: 95,
      totalCost: 20,
      totalCostLowBdt: 20,
      segments: longConnectorOutlier.segments,
    });

    expect(
      filterPostSnapDurationOutliers([
        practical,
        longConnectorOutlier,
      ]).map((route) => route.id),
    ).toEqual(["practical"]);
    expect(
      filterPostSnapDurationOutliers([practical, cheapLongConnector]).map(
        (route) => route.id,
      ),
    ).toEqual(["practical", "cheap-long-connector"]);
  });

  it("labels recommended results by balanced, practical speed, and hassle profiles", () => {
    const balanced = makeRoute({
      id: "balanced",
      pathSignature: "balanced",
      estimatedDurationMinutes: 22,
      totalCost: 20,
      transferCount: 0,
    });
    const sprint = makeRoute({
      id: "sprint",
      pathSignature: "sprint",
      estimatedDurationMinutes: 9,
      totalCost: 40,
      transferCount: 1,
      segments: [
        {
          mode: "bus",
          instruction: "Board First Bus",
          startLocation: "Farmgate",
          endLocation: "Shahbag",
        },
        {
          mode: "walk",
          instruction: "Change buses",
          startLocation: "Shahbag",
          endLocation: "Shahbag",
        },
        {
          mode: "bus",
          instruction: "Board Second Bus",
          startLocation: "Shahbag",
          endLocation: "Motijheel",
        },
      ],
    });
    const simple = makeRoute({
      id: "simple",
      pathSignature: "simple",
      estimatedDurationMinutes: 28,
      totalCost: 25,
      transferCount: 0,
      segments: [
        {
          mode: "bus",
          instruction: "Board Simple Bus",
          startLocation: "Farmgate",
          endLocation: "Motijheel",
        },
      ],
    });

    const routes = surfaceRoutes([sprint, balanced, simple], "recommended");

    expect(routes.map((route) => route.primaryReason)).toEqual([
      "Best overall balance",
      "Fastest practical option",
      "Simplest trip shape",
    ]);
    expect(routes.map((route) => route.id)).toContain("sprint");
    expect(routes.every((route) => route.connectorBurden)).toBe(true);
  });

  it("merges service labels per bus leg on equivalent transfer routes", () => {
    const transferA = makeRoute({
      id: "transfer-a",
      kind: "bus_transfer",
      summary: "Bus · First A → Second A",
      transferCount: 1,
      serviceLabels: ["First A", "Second A"],
      primaryServiceLabel: "First A",
      transferStops: [{ label: "Shahbag", type: "hub" }],
      segments: [
        {
          mode: "bus",
          instruction: "Board First A",
          startLocation: "Farmgate",
          endLocation: "Shahbag",
          serviceLabels: ["First A"],
        },
        {
          mode: "walk",
          instruction: "Change buses",
          startLocation: "Shahbag",
          endLocation: "Shahbag",
        },
        {
          mode: "bus",
          instruction: "Board Second A",
          startLocation: "Shahbag",
          endLocation: "Motijheel",
          serviceLabels: ["Second A"],
        },
      ],
    });
    const transferB = makeRoute({
      id: "transfer-b",
      kind: "bus_transfer",
      summary: "Bus · First B → Second B",
      transferCount: 1,
      serviceLabels: ["First B", "Second B"],
      primaryServiceLabel: "First B",
      transferStops: [{ label: "Shahbag", type: "hub" }],
      segments: [
        {
          mode: "bus",
          instruction: "Board First B",
          startLocation: "Farmgate",
          endLocation: "Shahbag",
          serviceLabels: ["First B"],
        },
        {
          mode: "walk",
          instruction: "Change buses",
          startLocation: "Shahbag",
          endLocation: "Shahbag",
        },
        {
          mode: "bus",
          instruction: "Board Second B",
          startLocation: "Shahbag",
          endLocation: "Motijheel",
          serviceLabels: ["Second B"],
        },
      ],
    });

    const route = surfaceRoutes([transferA, transferB], "recommended")[0];
    const busSegments = route?.segments.filter((segment) => segment.mode === "bus");

    expect(route?.serviceLabels).toEqual(
      expect.arrayContaining(["First A", "Second A", "First B", "Second B"]),
    );
    expect(busSegments?.[0]?.serviceLabels).toEqual(
      expect.arrayContaining(["First A", "First B"]),
    );
    expect(busSegments?.[1]?.serviceLabels).toEqual(
      expect.arrayContaining(["Second A", "Second B"]),
    );
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

    expect(response.routes.length).toBeGreaterThan(0);
    expect(response.routes[0]?.kind).toBe("metro_direct");
    expect(response.routes[0]?.fareText).toBe("BDT 30");
    expect(response.routes[0]?.totalCost).toBe(30);
  });

  it("keeps strategic metro alternatives when bus stops crowd the nearest candidates", async () => {
    const response = await calculateRoutes({
      origin: {
        name: "North-east origin",
        coordinates: [23.875897154493625, 90.39024779265772],
        type: "place",
      },
      destination: {
        name: "Farmgate edge destination",
        coordinates: [23.75289495299337, 90.39104626943124],
        type: "place",
      },
      optimization: "recommended",
    });

    expect(
      response.debugRoutes?.some((route) =>
        route.segments.some((segment) => segment.mode === "metro"),
      ),
    ).toBe(true);
    expect(
      response.routes.some((route) =>
        route.segments.some((segment) => segment.mode === "metro"),
      ),
    ).toBe(true);
    expect(
      response.routes.some((route) =>
        route.segments.some((segment) => segment.mode === "bus"),
      ),
    ).toBe(true);
  });

  it("shows shared local transport fare guidance for long connectors", async () => {
    const response = await calculateRoutes({
      origin: {
        name: "Road 15",
        coordinates: [23.81457578576774, 90.35494500541117],
        type: "place",
      },
      destination: {
        name: "DIU",
        coordinates: [23.8790923, 90.3214822],
        type: "place",
      },
      optimization: "recommended",
    });
    const longConnector = response.routes
      .flatMap((route) => route.segments)
      .find((segment) => segment.connectorType === "long_rickshaw");

    expect(longConnector).toBeDefined();
    const routeWithLongConnector = response.routes.find((route) =>
      route.segments.some((segment) => segment === longConnector),
    );

    expect(longConnector?.fareText).toMatch(/Approx\. BDT \d+-\d+/);
    expect(longConnector?.costLowBdt).toBeLessThan(longConnector?.costHighBdt ?? 0);
    expect(longConnector?.note).toContain("Long connector");
    expect(longConnector?.note).not.toContain("BDT");
    expect(routeWithLongConnector?.totalCostLowBdt).toBeLessThan(
      routeWithLongConnector?.totalCostHighBdt ?? 0,
    );
    expect(routeWithLongConnector?.fareText).toMatch(/BDT \d+-\d+/);
  });

  it("does not surface slower bus transfers when a direct bus reaches the same corridor", async () => {
    const response = await calculateRoutes({
      origin: {
        name: "Mirpur edge origin",
        coordinates: [23.814003559238746, 90.35533575726116],
        type: "place",
      },
      destination: {
        name: "Badda edge destination",
        coordinates: [23.800739672358425, 90.45187949773755],
        type: "place",
      },
      optimization: "recommended",
    });

    expect(response.debugRoutes?.some((route) => route.kind === "bus_transfer")).toBe(true);
    expect(response.routes.some((route) => route.kind === "bus_direct")).toBe(true);
    expect(response.routes.some((route) => route.kind === "bus_transfer")).toBe(false);
  });

  it("avoids long metro connectors when cleaner Notun Bazar corridor routes exist", async () => {
    const response = await calculateRoutes({
      origin: {
        name: "Mirpur edge origin",
        coordinates: [23.814003559238746, 90.35533575726116],
        type: "place",
      },
      destination: {
        name: "Badda edge destination",
        coordinates: [23.800739672358425, 90.45187949773755],
        type: "place",
      },
      optimization: "recommended",
    });
    const notunBazarCorridorRoute = (route: (typeof response.routes)[number]) =>
      route.segments.some(
        (segment) =>
          segment.mode === "bus" &&
          normalizeTransitText(segment.endLocation).includes("notun bazar"),
      );

    expect(response.debugRoutes?.some(notunBazarCorridorRoute)).toBe(true);
    expect(response.routes.some(notunBazarCorridorRoute)).toBe(true);
    expect(
      response.routes.some(
        (route) =>
          route.kind === "metro_direct" &&
          route.segments.some(
            (segment) => segment.connectorType === "long_rickshaw",
          ),
      ),
    ).toBe(false);
    expect(
      response.routes.some(
        (route) =>
          route.kind === "bus_metro_hybrid" &&
          route.segments.some((segment) =>
            ["uttar badda", "badda link road"].some((label) =>
              normalizeTransitText(segment.endLocation).includes(label),
            ),
          ),
      ),
    ).toBe(false);
  });

  it("does not surface hybrids that leave metro after reaching Mirpur 10", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "");

    const response = await calculateRoutes({
      origin: {
        name: "DIU side origin",
        coordinates: [23.87816946319441, 90.31963485382568],
        type: "place",
      },
      destination: {
        name: "Mirpur 10",
        coordinates: [23.8065239, 90.3686387],
        type: "place",
      },
      optimization: "recommended",
    });

    expect(response.routes[0]?.kind).toBe("metro_direct");
    expect(
      response.routes.some(
        (route) =>
          route.kind === "bus_metro_hybrid" &&
          route.segments.some(
            (segment) =>
              segment.mode === "metro" &&
              segment.endLocation === "Mirpur 10 Metro Station",
          ) &&
          route.segments.some(
            (segment) =>
              segment.mode === "bus" &&
              normalizeTransitText(segment.endLocation).includes("mirpur 2"),
          ),
      ),
    ).toBe(false);
    expect(
      response.routes.some(
        (route) =>
          route.kind === "bus_metro_hybrid" &&
          route.segments.some(
            (segment) =>
              segment.mode === "metro" &&
              segment.endLocation !== "Mirpur 10 Metro Station",
          ),
      ),
    ).toBe(false);
  });

  it("suppresses transfers and hybrids when direct buses serve the destination corridor", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "");

    const response = await calculateRoutes({
      origin: {
        name: "Mirpur edge origin",
        coordinates: [23.812996872570377, 90.35643449183326],
        type: "place",
      },
      destination: {
        name: "Badda corridor destination",
        coordinates: [23.799611208916872, 90.44341730558479],
        type: "place",
      },
      optimization: "recommended",
    });

    expect(response.routes.length).toBeGreaterThan(0);
    expect(response.routes.every((route) => route.kind === "bus_direct")).toBe(true);
    expect(
      response.routes.some((route) =>
        route.segments.some(
          (segment) =>
            segment.mode === "bus" &&
            ["nadda", "notun bazar"].some((label) =>
              normalizeTransitText(segment.endLocation).includes(label),
            ),
        ),
      ),
    ).toBe(true);
  });

  it("draws metro routes from the station-derived MRT Line 6 shape", async () => {
    const response = await calculateRoutes({
      origin: { name: "Farmgate", canonicalId: "metro-farmgate", type: "metro_station" },
      destination: { name: "Motijheel", canonicalId: "metro-motijheel", type: "metro_station" },
      optimization: "recommended",
    });
    const metroLine = response.routes[0]?.mapPreview.lines.find((line) => line.mode === "metro");

    expect(metroLine?.coordinates.length).toBeGreaterThan(2);
    expect(metroLine?.coordinates[0]).toEqual([23.7590418, 90.387085]);
    expect(metroLine?.coordinates.at(-1)).toEqual([23.7280746, 90.4190913]);
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
    expect(response.routes[0]?.mapPreview.points.some((point) => point.role === "origin")).toBe(true);
    expect(response.routes[0]?.mapPreview.points.some((point) => point.role === "destination")).toBe(true);
    expect(response.routes[0]?.mapPreview.lines.length).toBeGreaterThanOrEqual(
      response.routes[0]?.segments.length ?? 0,
    );
  });

  it("builds map lines for each route step with known endpoint coordinates", async () => {
    const response = await calculateRoutes({
      origin: {
        name: "Technical",
        canonicalId: "stop-technical",
        type: "bus_stop",
      },
      destination: {
        name: "Kallyanpur",
        canonicalId: "stop-kallyanpur",
        type: "bus_stop",
      },
      optimization: "recommended",
    });
    const route = response.routes[0];

    expect(route).toBeDefined();
    expect(route?.segments.length).toBeGreaterThan(0);
    expect(route?.mapPreview.lines.length).toBeGreaterThan(0);
    expect(route?.mapPreview.lines.map((line) => line.mode)).toEqual(
      expect.arrayContaining(route?.segments.map((segment) => segment.mode) ?? []),
    );
  });

  it("keeps all bus services that share the same direct corridor", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "");
    const originLabel = "Kuril Bishwa Road";
    const destinationLabel = "Airport";
    const expectedServices = dhakaBusSeedRoutes
      .filter((route) => {
        const boardingIndex = route.stopLabels.findIndex((label) =>
          label.startsWith(originLabel),
        );
        const alightingIndex = route.stopLabels.findIndex((label) =>
          label.startsWith(destinationLabel),
        );

        return boardingIndex >= 0 && alightingIndex > boardingIndex;
      })
      .map((route) => route.busLabelEn);

    const response = await calculateRoutes({
      origin: {
        name: originLabel,
        canonicalId: "stop-kuril-bishwa-road",
        type: "bus_stop",
      },
      destination: {
        name: destinationLabel,
        canonicalId: "stop-airport",
        type: "bus_stop",
      },
      optimization: "recommended",
    });
    const route = response.routes.find((candidate) =>
      candidate.segments.some(
        (segment) =>
          segment.mode === "bus" &&
          segment.startLocation.startsWith(originLabel) &&
          segment.endLocation.startsWith(destinationLabel),
      ),
    );
    const busSegment = route?.segments.find((segment) => segment.mode === "bus");

    expect(expectedServices.length).toBeGreaterThan(8);
    expect(route?.serviceLabels).toEqual(expect.arrayContaining(expectedServices));
    expect(busSegment?.serviceLabels).toEqual(
      expect.arrayContaining(expectedServices),
    );
  });

  it("keeps bus map geometry bounded to the selected bus segment endpoints", async () => {
    const response = await calculateRoutes({
      origin: {
        name: "Technical",
        canonicalId: "stop-technical",
        type: "bus_stop",
      },
      destination: {
        name: "Kallyanpur",
        canonicalId: "stop-kallyanpur",
        type: "bus_stop",
      },
      optimization: "recommended",
    });
    const route = response.routes[0];
    const busSegment = route?.segments.find((segment) => segment.mode === "bus");
    const busLine = route?.mapPreview.lines.find((line) => line.mode === "bus");

    expect(busSegment).toBeDefined();
    expect(busLine).toBeDefined();
    expect(busLine?.coordinates).toHaveLength(2);
    expect(busLine?.coordinates[0]).toEqual(busSegment?.startLocation ? route?.mapPreview.points.find((point) => point.label === busSegment.startLocation)?.coordinates : undefined);
    expect(busLine?.coordinates.at(-1)).toEqual(busSegment?.endLocation ? route?.mapPreview.points.find((point) => point.label === busSegment.endLocation)?.coordinates : undefined);
  });

  it("draws the final connector from alighting stop to custom destination", async () => {
    const destinationCoordinates: [number, number] = [23.9172, 90.3342];
    const response = await calculateRoutes({
      origin: {
        name: "Technical",
        canonicalId: "stop-technical",
        type: "bus_stop",
      },
      destination: {
        name: "Near Birulia",
        coordinates: destinationCoordinates,
        type: "place",
      },
      optimization: "recommended",
    });
    const route = response.routes[0];
    const finalSegment = route?.segments.at(-1);
    const finalLine = route?.mapPreview.lines.at(-1);

    expect(finalSegment?.connectorType).toBeDefined();
    expect(finalSegment?.endLocation).toBe("Near Birulia");
    expect(finalLine?.mode).toBe(finalSegment?.mode);
    expect(finalLine?.coordinates.at(-1)).toEqual(destinationCoordinates);
  });

  it("snaps non-metro map lines to road geometry when routing API is configured", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "test-key");
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              distance: 2400,
              time: 600,
            },
            geometry: {
              type: "LineString",
              coordinates: [
                [90.39, 23.75],
                [90.4, 23.74],
              ],
            },
          },
        ],
      }),
    }) as typeof fetch;

    const response = await calculateRoutes({
      origin: { name: "Technical", canonicalId: "stop-technical", type: "bus_stop" },
      destination: { name: "Kallyanpur", canonicalId: "stop-kallyanpur", type: "bus_stop" },
      optimization: "recommended",
    });
    const route = response.routes[0];
    const snappedLine = route?.mapPreview.lines.find((line) => line.mode !== "metro");
    const snappedSegment = route?.segments.find((segment) => segment.mode !== "metro");

    expect(global.fetch).toHaveBeenCalled();
    expect(snappedLine?.confidence).toBe("exact");
    expect(snappedLine?.coordinates).toEqual([
      [23.75, 90.39],
      [23.74, 90.4],
    ]);
    expect(snappedSegment?.estimatedDistanceKm).toBe(2.4);
    expect(snappedSegment?.distanceSource).toBe("road_api");
    expect(route?.estimatedDistanceKm).toBe(2.4);
  });

  it("uses only local bus and metro datasets while calculating routes when snapping is disabled", async () => {
    vi.stubEnv("GEOAPIFY_API_KEY", "");
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
