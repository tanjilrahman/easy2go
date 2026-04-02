import dhakaBusSeedJson from "./dhaka-bus-seed.json";

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

export const dhakaBusSeedDataset =
  dhakaBusSeedJson as unknown as DhakaBusSeedDataset;

export const dhakaBusSeedRoutes = dhakaBusSeedDataset.routes;
export const dhakaBusSeedStops = dhakaBusSeedDataset.stops;
export const dhakaBusSeedBuses = dhakaBusSeedDataset.buses;
