import dhakaLegunaSeedJson from "./dhaka-leguna-seed.json";

export interface DhakaLegunaSeedSource {
  name: string;
  retrievedAt: string;
  license: string;
  notes: string[];
}

export interface DhakaLegunaSeedSummary {
  routeCount: number;
  stopCount: number;
}

export interface DhakaLegunaSeedStop {
  id: string;
  label: string;
  slug: string;
  routeIds: string[];
  routeCount: number;
}

export interface DhakaLegunaSeedRoute {
  id: string;
  origin: string;
  destination: string;
  via: string | null;
  stopIds: string[];
  stopLabels: string[];
  stopCount: number;
  reportedFareBdt: number | null;
  confidence: "high" | "medium" | "low";
  evidenceType: "direct_leguna" | "corridor_inference";
}

export interface DhakaLegunaSeedDataset {
  version: number;
  generatedAt: string;
  source: DhakaLegunaSeedSource;
  summary: DhakaLegunaSeedSummary;
  stops: DhakaLegunaSeedStop[];
  routes: DhakaLegunaSeedRoute[];
}

export const dhakaLegunaSeedDataset =
  dhakaLegunaSeedJson as unknown as DhakaLegunaSeedDataset;

export const dhakaLegunaSeedStops = dhakaLegunaSeedDataset.stops;
export const dhakaLegunaSeedRoutes = dhakaLegunaSeedDataset.routes;
