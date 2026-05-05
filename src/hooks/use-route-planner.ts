"use client";

import { useMutation, useQuery } from "@tanstack/react-query";

import {
  calculateRouteResponseSchema,
  locationSearchResponseSchema,
  type CalculateRouteRequest,
} from "@/lib/validations/routes";

async function fetchJson<T>(input: RequestInfo, init: RequestInit, parser: (value: unknown) => T) {
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      data && typeof data === "object" && "message" in data && typeof data.message === "string"
        ? data.message
        : "Something went wrong.";
    throw new Error(message);
  }

  return parser(data);
}

export function useLocationSuggestions(query: string, enabled: boolean) {
  return useQuery({
    queryKey: ["location-search", query],
    enabled,
    staleTime: 60_000,
    queryFn: () =>
      fetchJson(
        `/api/locations/search?query=${encodeURIComponent(query)}`,
        { method: "GET" },
        (value) => locationSearchResponseSchema.parse(value),
      ),
  });
}

export function useCalculateRoutes() {
  return useMutation({
    mutationFn: (payload: CalculateRouteRequest) =>
      fetchJson(
        "/api/routes/calculate",
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
        (value) => calculateRouteResponseSchema.parse(value),
      ),
  });
}
