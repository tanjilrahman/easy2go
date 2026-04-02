import { z } from "zod";

export const latLngSchema = z.tuple([z.number(), z.number()]);

export const transportModeSchema = z.enum([
  "walk",
  "bus",
  "rickshaw",
  "leguna",
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

export const fareTypeSchema = z.enum(["exact", "unknown", "advisory"]);

export type FareType = z.infer<typeof fareTypeSchema>;

export const locationSuggestionSchema = z.object({
  id: z.string(),
  name: z.string(),
  address: z.string().optional(),
  type: locationSuggestionTypeSchema,
  placeId: z.string().optional(),
  coordinates: latLngSchema.optional(),
  canonicalId: z.string().optional(),
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
});

export type RouteStopReference = z.infer<typeof routeStopReferenceSchema>;

export const routeMapPreviewSchema = z.object({
  originLabel: z.string(),
  destinationLabel: z.string(),
  originQuery: z.string(),
  destinationQuery: z.string(),
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
  stopCount: z.number().int().positive().optional(),
  stationCount: z.number().int().positive().optional(),
});

export type RouteSegment = z.infer<typeof routeSegmentSchema>;

export const routeOptionSchema = z.object({
  id: z.string(),
  kind: routeKindSchema,
  confidence: routeConfidenceSchema,
  summary: z.string(),
  fareType: fareTypeSchema,
  fareText: z.string(),
  totalCost: z.number().nonnegative().optional(),
  serviceWindowText: z.string().optional(),
  stopCount: z.number().int().nonnegative().optional(),
  stationCount: z.number().int().nonnegative().optional(),
  boarding: routeStopReferenceSchema,
  alighting: routeStopReferenceSchema,
  transferStops: z.array(routeStopReferenceSchema).default([]),
  segments: z.array(routeSegmentSchema).min(1),
  mapPreview: routeMapPreviewSchema,
  advisories: z.array(z.string()).default([]),
});

export type RouteOption = z.infer<typeof routeOptionSchema>;

export const calculateRouteRequestSchema = z.object({
  origin: locationInputSchema,
  destination: locationInputSchema,
});

export type CalculateRouteRequest = z.infer<typeof calculateRouteRequestSchema>;

export const calculateRouteResponseSchema = z.object({
  routes: z.array(routeOptionSchema),
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
