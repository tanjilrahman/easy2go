import dhakaBusSeedJson from "./dhaka-bus-seed.json";
import dhakaBusStopMetadataJson from "./dhaka-bus-stop-metadata.json";
import dhakaBusStopVariantsJson from "./dhaka-bus-stop-variants.json";

export type DhakaBusStopCoordinateConfidence = "exact" | "verified" | "approximate";

export interface DhakaBusStopMetadataEntry {
  labels: string[];
  placeName?: string;
  address?: string;
  coordinates?: [number, number];
  source?: string;
}

export interface DhakaBusStopVariant {
  name: string;
  placeName?: string;
  address?: string;
  coordinates: [number, number];
  source?: string;
}

export interface DhakaBusStopVariantEntry {
  labels: string[];
  variants: DhakaBusStopVariant[];
}

export interface DhakaBusSeedSource {
  name: string;
  url: string;
  retrievedAt: string;
  license: string;
  notes: string[];
}

export interface DhakaBusSeedSummary {
  routeCount: number;
  busCount: number;
  stopCount: number;
}

export interface DhakaBusSeedBus {
  id: string;
  label: string;
  labelEn: string;
  labelBn: string | null;
  routeIds: string[];
  routeCount: number;
}

export interface DhakaBusSeedStop {
  id: string;
  label: string;
  labelEn: string;
  labelBn: string | null;
  slug: string;
  routeIds: string[];
  routeCount: number;
  placeName?: string;
  address?: string;
  coordinates?: [number, number];
  variants?: DhakaBusStopVariant[];
  coordinateSource?: string;
  coordinateConfidence?: DhakaBusStopCoordinateConfidence;
}

export interface DhakaBusSeedRoute {
  id: string;
  sourceIndex: number;
  busId: string;
  busLabel: string;
  busLabelEn: string;
  busLabelBn: string | null;
  startStopId: string;
  endStopId: string;
  startLabel: string;
  endLabel: string;
  stopIds: string[];
  stopLabels: string[];
  stopCount: number;
  serviceType: string;
  openingTimeText: string;
  openingTime24h: string | null;
  closingTimeText: string;
  closingTime24h: string | null;
}

export interface DhakaBusSeedDataset {
  version: number;
  generatedAt: string;
  source: DhakaBusSeedSource;
  summary: DhakaBusSeedSummary;
  buses: DhakaBusSeedBus[];
  stops: DhakaBusSeedStop[];
  routes: DhakaBusSeedRoute[];
}

const rawDhakaBusSeedDataset = dhakaBusSeedJson as unknown as DhakaBusSeedDataset;
export const dhakaBusStopMetadataEntries =
  dhakaBusStopMetadataJson as unknown as DhakaBusStopMetadataEntry[];
export const dhakaBusStopVariantEntries =
  dhakaBusStopVariantsJson as unknown as DhakaBusStopVariantEntry[];

function normalizeBusStopLabel(value: string) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

const busStopMetadataLookup = new Map(
  dhakaBusStopMetadataEntries.flatMap((entry) =>
    entry.labels.map((label) => [normalizeBusStopLabel(label), entry] as const),
  ),
);
const busStopVariantLookup = new Map(
  dhakaBusStopVariantEntries.flatMap((entry) =>
    entry.labels.map((label) => [normalizeBusStopLabel(label), entry.variants] as const),
  ),
);

function applyStopMetadata(stop: DhakaBusSeedStop): DhakaBusSeedStop {
  if (stop.coordinates && stop.address && stop.placeName && stop.variants?.length) {
    return stop;
  }

  const metadata =
    busStopMetadataLookup.get(normalizeBusStopLabel(stop.label)) ??
    busStopMetadataLookup.get(normalizeBusStopLabel(stop.labelEn)) ??
    (stop.labelBn
      ? busStopMetadataLookup.get(normalizeBusStopLabel(stop.labelBn))
      : undefined);

  if (!metadata) {
    const variants =
      busStopVariantLookup.get(normalizeBusStopLabel(stop.label)) ??
      busStopVariantLookup.get(normalizeBusStopLabel(stop.labelEn)) ??
      (stop.labelBn
        ? busStopVariantLookup.get(normalizeBusStopLabel(stop.labelBn))
        : undefined);

    return variants
      ? {
          ...stop,
          placeName: stop.placeName ?? variants[0]?.placeName,
          address: stop.address ?? variants[0]?.address,
          coordinates: stop.coordinates ?? variants[0]?.coordinates,
          coordinateSource: stop.coordinateSource ?? variants[0]?.source,
          variants,
        }
      : stop;
  }

  const variants =
    busStopVariantLookup.get(normalizeBusStopLabel(stop.label)) ??
    busStopVariantLookup.get(normalizeBusStopLabel(stop.labelEn)) ??
    (stop.labelBn
      ? busStopVariantLookup.get(normalizeBusStopLabel(stop.labelBn))
      : undefined);

  return {
    ...stop,
    placeName: stop.placeName ?? metadata.placeName,
    address: stop.address ?? metadata.address,
    coordinates: stop.coordinates ?? metadata.coordinates,
    variants: stop.variants ?? variants,
    coordinateSource: stop.coordinateSource ?? metadata.source,
  };
}

const enrichedDhakaBusSeedStops = rawDhakaBusSeedDataset.stops.map(applyStopMetadata);
const busStopByNormalizedLabel = new Map<string, DhakaBusSeedStop>();

for (const stop of enrichedDhakaBusSeedStops) {
  for (const label of [stop.label, stop.labelEn, stop.labelBn ?? ""]) {
    const normalizedLabel = normalizeBusStopLabel(label);

    if (normalizedLabel && !busStopByNormalizedLabel.has(normalizedLabel)) {
      busStopByNormalizedLabel.set(normalizedLabel, stop);
    }
  }
}

export const dhakaBusSeedDataset: DhakaBusSeedDataset = {
  ...rawDhakaBusSeedDataset,
  stops: enrichedDhakaBusSeedStops,
};

export const dhakaBusSeedRoutes = dhakaBusSeedDataset.routes;
export const dhakaBusSeedStops = dhakaBusSeedDataset.stops;
export const dhakaBusSeedBuses = dhakaBusSeedDataset.buses;

export function getDhakaBusStopByLabel(label?: string) {
  return label ? busStopByNormalizedLabel.get(normalizeBusStopLabel(label)) : undefined;
}

export function getDhakaBusStopCoordinatesByLabel(label?: string) {
  return getDhakaBusStopByLabel(label)?.coordinates;
}
