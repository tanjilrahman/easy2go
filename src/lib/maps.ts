import type { TransportMode } from "@/lib/validations/routes";

export const DHAKA_CENTER: [number, number] = [23.8103, 90.4125];

export const MAP_COLORS: Record<TransportMode | "origin" | "destination" | "transfer", string> = {
  walk: "#8699ab",
  bus: "#1964cb",
  rickshaw: "#13b86d",
  leguna: "#f1b14a",
  metro: "#6f60ef",
  ride_share: "#ea5b74",
  origin: "#15b86d",
  destination: "#f25f67",
  transfer: "#155fc8",
};
