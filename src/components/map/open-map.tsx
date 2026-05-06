"use client";

import { useEffect, useMemo, useRef } from "react";
import type {
  GeoJSONSource,
  LngLatBoundsLike,
  LngLatLike,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  StyleSpecification,
} from "maplibre-gl";
import maplibregl from "maplibre-gl";
import type { Feature, FeatureCollection, LineString, Point } from "geojson";

import { DHAKA_CENTER, MAP_COLORS } from "@/lib/maps";
import { cn } from "@/lib/utils";
import type { LocationInput, RouteOption } from "@/lib/validations/routes";

export type MapPickMode = "origin" | "destination";

interface OpenMapProps {
  activeRoute?: RouteOption | null;
  className?: string;
  userCoordinates?: [number, number] | null;
  viewportPaddingRatio?: number;
  viewportBottomInsetPx?: number;
  pickMode?: MapPickMode | null;
  originSelection?: LocationInput | null;
  destinationSelection?: LocationInput | null;
  onPickLocation?: (coordinates: [number, number], mode: MapPickMode) => void;
}

const DEFAULT_RASTER_STYLE: StyleSpecification = {
  version: 8,
  sources: {
    "carto-positron": {
      type: "raster",
      tiles: [
        "https://a.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://b.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://c.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
        "https://d.basemaps.cartocdn.com/light_all/{z}/{x}/{y}.png",
      ],
      tileSize: 256,
      attribution: "© OpenStreetMap contributors © CARTO",
    },
  },
  layers: [
    {
      id: "carto-positron",
      type: "raster",
      source: "carto-positron",
    },
  ],
};
const DEFAULT_MAP_ATTRIBUTION =
  "© OpenStreetMap contributors, © OpenFreeMap, © OpenMapTiles";
const DHAKA_CENTER_LNG_LAT: LngLatLike = [DHAKA_CENTER[1], DHAKA_CENTER[0]];
const SOURCE_IDS = {
  routeLines: "easy2go-route-lines",
  routePoints: "easy2go-route-points",
  selectedPoints: "easy2go-selected-points",
  userPoint: "easy2go-user-point",
};

function toLngLat([lat, lng]: [number, number]): [number, number] {
  return [lng, lat];
}

function makeEmptyCollection<TGeometry extends LineString | Point>(): FeatureCollection<TGeometry> {
  return {
    type: "FeatureCollection",
    features: [],
  };
}

function makePointFeature(
  coordinates: [number, number],
  properties: Record<string, string>,
): Feature<Point> {
  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Point",
      coordinates: toLngLat(coordinates),
    },
  };
}

function formatMapLabel(label?: string | null): string {
  if (!label) return "";
  // Remove everything from the first Bengali character onwards or inside parentheses
  // This avoids the MapLibre complex text shaping issues with Indic scripts
  return label.split("(")[0].replace(/[\u0980-\u09FF].*$/, "").trim();
}

function buildRouteLineCollection(route?: RouteOption | null): FeatureCollection<LineString> {
  if (!route) {
    return makeEmptyCollection();
  }

  return {
    type: "FeatureCollection",
    features: route.mapPreview.lines.map((line, index) => ({
      type: "Feature",
      properties: {
        id: `${line.mode}-${index}`,
        mode: line.mode,
        label: formatMapLabel(line.label),
        confidence: line.confidence,
      },
      geometry: {
        type: "LineString",
        coordinates: line.coordinates.map(toLngLat),
      },
    })),
  };
}

function buildRoutePointCollection(route?: RouteOption | null): FeatureCollection<Point> {
  if (!route) {
    return makeEmptyCollection();
  }

  return {
    type: "FeatureCollection",
    features: route.mapPreview.points.map((point) =>
      makePointFeature(point.coordinates, {
        label: formatMapLabel(point.label),
        role: point.role,
      }),
    ),
  };
}

function buildSelectedPointCollection(
  originSelection?: LocationInput | null,
  destinationSelection?: LocationInput | null,
  activeRoute?: RouteOption | null,
): FeatureCollection<Point> {
  if (activeRoute) {
    return makeEmptyCollection();
  }

  return {
    type: "FeatureCollection",
    features: [
      originSelection?.coordinates
        ? makePointFeature(originSelection.coordinates, {
            label: formatMapLabel(originSelection.name),
            role: "origin",
          })
        : null,
      destinationSelection?.coordinates
        ? makePointFeature(destinationSelection.coordinates, {
            label: formatMapLabel(destinationSelection.name),
            role: "destination",
          })
        : null,
    ].filter((feature): feature is Feature<Point> => feature !== null),
  };
}

function buildUserPointCollection(userCoordinates?: [number, number] | null) {
  return {
    type: "FeatureCollection",
    features: userCoordinates
      ? [
          makePointFeature(userCoordinates, {
            label: "Current location",
            role: "user",
          }),
        ]
      : [],
  } satisfies FeatureCollection<Point>;
}

function getCollectionCoordinates(collections: Array<FeatureCollection<LineString | Point>>) {
  return collections.flatMap((collection) =>
    collection.features.flatMap((feature) =>
      feature.geometry.type === "Point"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates,
    ),
  );
}

function setSourceData<TGeometry extends LineString | Point>(
  map: MapLibreMap,
  sourceId: string,
  data: FeatureCollection<TGeometry>,
) {
  const source = map.getSource(sourceId) as GeoJSONSource | undefined;
  source?.setData(data);
}

function addMapLayers(map: MapLibreMap) {
  if (!map.getSource(SOURCE_IDS.routeLines)) {
    map.addSource(SOURCE_IDS.routeLines, {
      type: "geojson",
      data: makeEmptyCollection<LineString>(),
    });
  }

  // Soft shadow for depth
  if (!map.getLayer("easy2go-route-line-shadow")) {
    map.addLayer({
      id: "easy2go-route-line-shadow",
      type: "line",
      source: SOURCE_IDS.routeLines,
      paint: {
        "line-color": "rgba(15, 23, 42, 0.22)",
        "line-width": 8,
        "line-blur": 2,
        "line-translate": [0, 2],
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });
  }

  // White outline casing
  if (!map.getLayer("easy2go-route-line-casing")) {
    map.addLayer({
      id: "easy2go-route-line-casing",
      type: "line",
      source: SOURCE_IDS.routeLines,
      paint: {
        "line-color": "#ffffff",
        "line-width": [
          "match",
          ["get", "mode"],
          "walk",
          5,
          "rickshaw",
          6,
          7,
        ],
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });
  }

  // Bright core line
  if (!map.getLayer("easy2go-route-line")) {
    map.addLayer({
      id: "easy2go-route-line",
      type: "line",
      source: SOURCE_IDS.routeLines,
      paint: {
        "line-color": [
          "match",
          ["get", "mode"],
          "walk",
          MAP_COLORS.walk,
          "bus",
          MAP_COLORS.bus,
          "rickshaw",
          MAP_COLORS.rickshaw,
          "metro",
          MAP_COLORS.metro,
          "ride_share",
          MAP_COLORS.ride_share,
          MAP_COLORS.transfer,
        ],
        "line-width": [
          "match",
          ["get", "mode"],
          "walk",
          3,
          "rickshaw",
          4,
          5,
        ],
        "line-dasharray": [
          "match",
          ["get", "mode"],
          "walk",
          ["literal", [1.4, 1.2]],
          "rickshaw",
          ["literal", [1.5, 1.1]],
          ["literal", [1, 0]],
        ],
      },
      layout: {
        "line-cap": "round",
        "line-join": "round",
      },
    });
  }

  // Add symbol layer for mode labels along the line
  if (!map.getLayer("easy2go-route-line-labels")) {
    map.addLayer({
      id: "easy2go-route-line-labels",
      type: "symbol",
      source: SOURCE_IDS.routeLines,
      layout: {
        "symbol-placement": "line",
        "text-field": ["case", ["!=", ["get", "label"], ""], ["get", "label"], ["get", "mode"]],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 11,
        "text-transform": "uppercase",
        "text-letter-spacing": 0.05,
        "text-keep-upright": true,
        "symbol-spacing": 150,
      },
      paint: {
        "text-color": "#1e293b",
        "text-halo-color": "#ffffff",
        "text-halo-width": 3,
        "text-halo-blur": 1,
      },
    });
  }

  for (const sourceId of [SOURCE_IDS.routePoints, SOURCE_IDS.selectedPoints, SOURCE_IDS.userPoint]) {
    if (!map.getSource(sourceId)) {
      map.addSource(sourceId, {
        type: "geojson",
        data: makeEmptyCollection<Point>(),
      });
    }
  }

  const pointLayerConfigs: Array<{ id: string; source: string; radius: number }> = [
    { id: "easy2go-route-points", source: SOURCE_IDS.routePoints, radius: 7 },
    { id: "easy2go-selected-points", source: SOURCE_IDS.selectedPoints, radius: 8 },
    { id: "easy2go-user-point", source: SOURCE_IDS.userPoint, radius: 6 },
  ];

  for (const config of pointLayerConfigs) {
    if (!map.getLayer(`${config.id}-halo`)) {
      map.addLayer({
        id: `${config.id}-halo`,
        type: "circle",
        source: config.source,
        paint: {
          "circle-radius": config.radius + 4,
          "circle-color": "#ffffff",
          "circle-opacity": 0.94,
        },
      });
    }

    if (!map.getLayer(config.id)) {
      map.addLayer({
        id: config.id,
        type: "circle",
        source: config.source,
        paint: {
          "circle-radius": [
            "match",
            ["get", "role"],
            "stop",
            Math.max(4, config.radius - 3),
            config.radius,
          ],
          "circle-color": [
            "match",
            ["get", "role"],
            "origin",
            MAP_COLORS.origin,
            "destination",
            MAP_COLORS.destination,
            "boarding",
            MAP_COLORS.bus,
            "alighting",
            MAP_COLORS.destination,
            "transfer",
            MAP_COLORS.transfer,
            "stop",
            "#64748b",
            "user",
            MAP_COLORS.origin,
            MAP_COLORS.transfer,
          ],
          "circle-stroke-color": "#ffffff",
          "circle-stroke-width": 2,
        },
      });
    }
    
    // Add point labels
    if (!map.getLayer(`${config.id}-labels`) && config.id !== "easy2go-user-point") {
      map.addLayer({
        id: `${config.id}-labels`,
        type: "symbol",
        source: config.source,
        layout: {
          "text-field": ["get", "label"],
          "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
          "text-size": 11,
          "text-offset": [0, 1.5],
          "text-anchor": "top",
        },
        paint: {
          "text-color": "#0f172a",
          "text-halo-color": "#ffffff",
          "text-halo-width": 3,
        },
      });
    }
  }
}

export function OpenMap({
  activeRoute,
  className,
  userCoordinates,
  viewportPaddingRatio = 0.36,
  viewportBottomInsetPx,
  pickMode,
  originSelection,
  destinationSelection,
  onPickLocation,
}: OpenMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pickModeRef = useRef<MapPickMode | null>(null);
  const onPickLocationRef = useRef<OpenMapProps["onPickLocation"]>(onPickLocation);
  const routeLineDataRef = useRef<FeatureCollection<LineString>>(makeEmptyCollection());
  const routePointDataRef = useRef<FeatureCollection<Point>>(makeEmptyCollection());
  const selectedPointDataRef = useRef<FeatureCollection<Point>>(makeEmptyCollection());
  const userPointDataRef = useRef<FeatureCollection<Point>>(makeEmptyCollection());
  const routeLineData = useMemo(() => buildRouteLineCollection(activeRoute), [activeRoute]);
  const routePointData = useMemo(() => buildRoutePointCollection(activeRoute), [activeRoute]);
  const selectedPointData = useMemo(
    () => buildSelectedPointCollection(originSelection, destinationSelection, activeRoute),
    [activeRoute, destinationSelection, originSelection],
  );
  const userPointData = useMemo(
    () => buildUserPointCollection(userCoordinates),
    [userCoordinates],
  );
  useEffect(() => {
    pickModeRef.current = pickMode ?? null;
    onPickLocationRef.current = onPickLocation;
  }, [onPickLocation, pickMode]);

  useEffect(() => {
    routeLineDataRef.current = routeLineData;
    routePointDataRef.current = routePointData;
    selectedPointDataRef.current = selectedPointData;
    userPointDataRef.current = userPointData;
  }, [routeLineData, routePointData, selectedPointData, userPointData]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const container = containerRef.current;
    const map = new maplibregl.Map({
      container,
      style: DEFAULT_RASTER_STYLE,
      center: DHAKA_CENTER_LNG_LAT,
      zoom: 12,
      attributionControl: false,
    });

    map.addControl(
      new maplibregl.AttributionControl({
        compact: true,
        customAttribution: DEFAULT_MAP_ATTRIBUTION,
      }),
      "bottom-right",
    );

    map.on("load", () => {
      addMapLayers(map);
      setSourceData(map, SOURCE_IDS.routeLines, routeLineDataRef.current);
      setSourceData(map, SOURCE_IDS.routePoints, routePointDataRef.current);
      setSourceData(map, SOURCE_IDS.selectedPoints, selectedPointDataRef.current);
      setSourceData(map, SOURCE_IDS.userPoint, userPointDataRef.current);
    });

    map.on("click", (event: MapLayerMouseEvent) => {
      const currentPickMode = pickModeRef.current;

      if (!currentPickMode) {
        return;
      }

      onPickLocationRef.current?.(
        [
          Number(event.lngLat.lat.toFixed(6)),
          Number(event.lngLat.lng.toFixed(6)),
        ],
        currentPickMode,
      );
    });

    mapRef.current = map;

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(container);
    window.requestAnimationFrame(() => map.resize());

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;

    if (!map?.isStyleLoaded()) {
      return;
    }

    setSourceData(map, SOURCE_IDS.routeLines, routeLineData);
    setSourceData(map, SOURCE_IDS.routePoints, routePointData);
    setSourceData(map, SOURCE_IDS.selectedPoints, selectedPointData);
    setSourceData(map, SOURCE_IDS.userPoint, userPointData);
  }, [routeLineData, routePointData, selectedPointData, userPointData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !activeRoute || pickMode) {
      return;
    }

    const coordinates = getCollectionCoordinates([routeLineData, routePointData]);
    if (!coordinates.length) {
      return;
    }

    const bounds = coordinates.reduce(
      (nextBounds, coordinate) => nextBounds.extend(coordinate as [number, number]),
      new maplibregl.LngLatBounds(coordinates[0] as [number, number], coordinates[0] as [number, number]),
    );
    const bottomPadding =
      viewportBottomInsetPx && viewportBottomInsetPx > 0
        ? Math.round(viewportBottomInsetPx + 24)
        : Math.round(window.innerHeight * viewportPaddingRatio);

    map.fitBounds(bounds as LngLatBoundsLike, {
      padding: {
        top: 80,
        right: 36,
        bottom: bottomPadding,
        left: 36,
      },
      maxZoom: 15,
      duration: 700,
    });
  }, [
    activeRoute,
    pickMode,
    routeLineData,
    routePointData,
    viewportBottomInsetPx,
    viewportPaddingRatio,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !userCoordinates) {
      return;
    }

    map.flyTo({
      center: toLngLat(userCoordinates),
      zoom: 15,
      duration: 900,
    });
  }, [userCoordinates]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || activeRoute || pickMode) {
      return;
    }

    const coordinates: [number, number][] = [];
    if (originSelection?.coordinates) {
      coordinates.push(toLngLat(originSelection.coordinates));
    }
    if (destinationSelection?.coordinates) {
      coordinates.push(toLngLat(destinationSelection.coordinates));
    }

    if (coordinates.length === 0) {
      return;
    }

    if (coordinates.length === 1) {
      map.flyTo({
        center: coordinates[0],
        zoom: 15,
        duration: 700,
      });
      return;
    }

    const bounds = coordinates.reduce(
      (nextBounds, coordinate) => nextBounds.extend(coordinate),
      new maplibregl.LngLatBounds(coordinates[0], coordinates[0]),
    );

    const bottomPadding =
      viewportBottomInsetPx && viewportBottomInsetPx > 0
        ? Math.round(viewportBottomInsetPx + 24)
        : Math.round(window.innerHeight * viewportPaddingRatio);

    map.fitBounds(bounds as LngLatBoundsLike, {
      padding: {
        top: 80,
        right: 36,
        bottom: bottomPadding,
        left: 36,
      },
      maxZoom: 15,
      duration: 700,
    });
  }, [
    activeRoute,
    pickMode,
    originSelection,
    destinationSelection,
    viewportBottomInsetPx,
    viewportPaddingRatio,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) {
      return;
    }

    map.getCanvas().style.cursor = pickMode ? "crosshair" : "";
  }, [pickMode]);

  return (
    <div className={cn("relative overflow-hidden bg-[#e8f0f7]", className)}>
      <div ref={containerRef} className="h-full w-full" />
      {pickMode ? (
        <div className="pointer-events-none absolute left-1/2 top-20 z-10 -translate-x-1/2 rounded-full border border-white/80 bg-white/94 px-3 py-2 text-xs font-bold text-[rgb(55,42,123)] shadow-[0_18px_48px_-28px_rgba(29,21,63,0.34)] backdrop-blur">
          Click the map to set {pickMode === "origin" ? "current location" : "destination"}
        </div>
      ) : null}
    </div>
  );
}
