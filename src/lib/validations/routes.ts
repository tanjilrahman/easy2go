import { z } from "zod";

export const latLngSchema = z.tuple([z.number(), z.number()]);

export const transportModeSchema = z.enum([
  "walk",
  "bus",
  "rickshaw",
  "metro",
  "ride_share",
]);

export type TransportMode = z.infer<typeof transportModeSchema>;

export const locationSuggestionTypeSchema = z.enum([
  "place",
  "bus_stop",
  "metro_station",
  "hub",
]);

export type LocationSuggestionType = z.infer<typeof locationSuggestionTypeSchema>;

export const routeKindSchema = z.enum([
  "bus_direct",
  "bus_transfer",
  "metro_direct",
  "bus_metro_hybrid",
  "advisory_connector",
]);

export type RouteKind = z.infer<typeof routeKindSchema>;

export const routeConfidenceSchema = z.enum(["exact", "verified", "advisory"]);

export type RouteConfidence = z.infer<typeof routeConfidenceSchema>;

export const routeOptimizationSchema = z.enum([
  "recommended",
  "fastest",
  "cheapest",
]);

export type RouteOptimization = z.infer<typeof routeOptimizationSchema>;

export const fareTypeSchema = z.enum(["exact", "unknown", "advisory"]);

export type FareType = z.infer<typeof fareTypeSchema>;

export const connectorTypeSchema = z.enum([
  "walk",
  "rickshaw",
  "long_rickshaw",
  "advisory",
]);

export type ConnectorType = z.infer<typeof connectorTypeSchema>;

export const pricingConfidenceSchema = z.enum([
  "exact",
  "regulated_estimate",
  "estimated",
]);

export type PricingConfidence = z.infer<typeof pricingConfidenceSchema>;

export const distanceSourceSchema = z.enum([
  "local_estimate",
  "metro_exact",
]);

export type DistanceSource = z.infer<typeof distanceSourceSchema>;

export const connectorBurdenSchema = z.enum(["low", "medium", "high"]);

export type ConnectorBurden = z.infer<typeof connectorBurdenSchema>;

export const locationSuggestionSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().optional(),
  type: locationSuggestionTypeSchema,
  placeId: z.string().optional(),
  coordinates: latLngSchema.optional(),
  canonicalId: z.string().optional(),
  provider: z.enum(["local", "geoapify"]).optional(),
  confidence: z.enum(["exact", "candidate", "external"]).optional(),
});

export type LocationSuggestion = z.infer<typeof locationSuggestionSchema>;

export const locationInputSchema = z.object({
  name: z.string().min(2),
  address: z.string().optional(),
  placeId: z.string().optional(),
  coordinates: latLngSchema.optional(),
  canonicalId: z.string().optional(),
  type: locationSuggestionTypeSchema.optional(),
});

export type LocationInput = z.infer<typeof locationInputSchema>;

export const routeStopReferenceSchema = z.object({
  id: z.string().optional(),
  label: z.string(),
  type: locationSuggestionTypeSchema,
  variantId: z.string().optional(),
  canonicalId: z.string().optional(),
  canonicalLabel: z.string().optional(),
  coordinates: latLngSchema.optional(),
});

export type RouteStopReference = z.infer<typeof routeStopReferenceSchema>;

export const routeMapPointSchema = z.object({
  label: z.string(),
  coordinates: latLngSchema,
  role: z.enum(["origin", "destination", "boarding", "alighting", "transfer", "stop"]),
});

export type RouteMapPoint = z.infer<typeof routeMapPointSchema>;

export const routeMapLineSchema = z.object({
  mode: transportModeSchema,
  label: z.string().optional(),
  coordinates: z.array(latLngSchema).min(2),
  confidence: z.enum(["exact", "estimated"]).default("estimated"),
});

export type RouteMapLine = z.infer<typeof routeMapLineSchema>;

export const routeMapPreviewSchema = z.object({
  originLabel: z.string(),
  destinationLabel: z.string(),
  originQuery: z.string(),
  destinationQuery: z.string(),
  originCoordinates: latLngSchema.optional(),
  destinationCoordinates: latLngSchema.optional(),
  points: z.array(routeMapPointSchema).default([]),
  lines: z.array(routeMapLineSchema).default([]),
});

export type RouteMapPreview = z.infer<typeof routeMapPreviewSchema>;

export const routeSegmentSchema = z.object({
  mode: transportModeSchema,
  instruction: z.string(),
  startLocation: z.string(),
  endLocation: z.string(),
  note: z.string().optional(),
  serviceWindowText: z.string().optional(),
  fareText: z.string().optional(),
  estimatedDistanceKm: z.number().nonnegative().optional(),
  estimatedDurationMinutes: z.number().int().nonnegative().optional(),
  stopCount: z.number().int().positive().optional(),
  stationCount: z.number().int().positive().optional(),
  connectorType: connectorTypeSchema.optional(),
  connectorDistanceKm: z.number().nonnegative().optional(),
  connectorFare: z.number().int().nonnegative().optional(),
  distanceSource: distanceSourceSchema.optional(),
  pricingConfidence: pricingConfidenceSchema.optional(),
  costLowBdt: z.number().int().nonnegative().optional(),
  costHighBdt: z.number().int().nonnegative().optional(),
});

export type RouteSegment = z.infer<typeof routeSegmentSchema>;

export const routeOptionSchema = z.object({
  id: z.string(),
  kind: routeKindSchema,
  confidence: routeConfidenceSchema,
  summary: z.string(),
  pathSignature: z.string(),
  fareType: fareTypeSchema,
  fareText: z.string(),
  totalCost: z.number().nonnegative().optional(),
  totalCostLowBdt: z.number().nonnegative().optional(),
  totalCostHighBdt: z.number().nonnegative().optional(),
  estimatedDistanceKm: z.number().nonnegative().optional(),
  estimatedDurationMinutes: z.number().int().nonnegative().optional(),
  serviceWindowText: z.string().optional(),
  stopCount: z.number().int().nonnegative().optional(),
  stationCount: z.number().int().nonnegative().optional(),
  transferCount: z.number().int().nonnegative().default(0),
  boarding: routeStopReferenceSchema,
  alighting: routeStopReferenceSchema,
  transferStops: z.array(routeStopReferenceSchema).default([]),
  serviceLabels: z.array(z.string()).default([]),
  primaryServiceLabel: z.string().optional(),
  highlights: z.array(z.string()).default([]),
  tradeoffs: z.array(z.string()).default([]),
  primaryReason: z.string().optional(),
  scoringReason: z.string().optional(),
  connectorBurden: connectorBurdenSchema.optional(),
  segments: z.array(routeSegmentSchema).min(1),
  mapPreview: routeMapPreviewSchema,
  advisories: z.array(z.string()).default([]),
});

export type RouteOption = z.infer<typeof routeOptionSchema>;

export const calculateRouteRequestSchema = z.object({
  origin: locationInputSchema,
  destination: locationInputSchema,
  optimization: routeOptimizationSchema.default("recommended"),
});

export type CalculateRouteRequest = z.infer<typeof calculateRouteRequestSchema>;

export const calculateRouteResponseSchema = z.object({
  routes: z.array(routeOptionSchema),
  debugRoutes: z.array(routeOptionSchema).default([]),
  source: z.enum(["deterministic"]),
  searchId: z.string().optional(),
});

export type CalculateRouteResponse = z.infer<typeof calculateRouteResponseSchema>;

export const searchRecordSchema = z.object({
  id: z.string(),
  origin: z.string(),
  destination: z.string(),
  createdAt: z.string(),
});

export type SearchRecord = z.infer<typeof searchRecordSchema>;

export const searchesResponseSchema = z.object({
  searches: z.array(searchRecordSchema),
});

export const locationSearchResponseSchema = z.object({
  suggestions: z.array(locationSuggestionSchema),
});
