import type { TransportMode } from "@/lib/validations/routes";

export const DHAKA_CENTER: [number, number] = [23.8103, 90.4125];

export const MAP_COLORS: Record<TransportMode | "origin" | "destination" | "transfer", string> = {
  walk: "#8981b2",
  bus: "#5a43d7",
  rickshaw: "#13b86d",
  metro: "#765ef1",
  ride_share: "#dc4c64",
  origin: "#5a43d7",
  destination: "#dc4c64",
  transfer: "#765ef1",
};
