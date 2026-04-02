import type {
  RouteConfidence,
  RouteKind,
  TransportMode,
} from "@/lib/validations/routes";

export const transportModeMeta: Record<
  TransportMode,
  { label: string; color: string }
> = {
  walk: { label: "Walk", color: "#8699ab" },
  bus: { label: "Bus", color: "#1964cb" },
  rickshaw: { label: "Rickshaw", color: "#13b86d" },
  leguna: { label: "Leguna", color: "#f1b14a" },
  metro: { label: "Metro", color: "#6f60ef" },
  ride_share: { label: "Ride Share", color: "#ea5b74" },
};

export function getRouteKindLabel(kind: RouteKind) {
  switch (kind) {
    case "bus_direct":
      return "Direct Bus";
    case "bus_transfer":
      return "1 Transfer";
    case "metro_direct":
      return "Metro";
    case "bus_metro_hybrid":
      return "Bus + Metro";
    default:
      return "Advisory";
  }
}

export function getRouteKindTone(kind: RouteKind) {
  switch (kind) {
    case "metro_direct":
      return "bg-violet-100 text-violet-800";
    case "bus_direct":
      return "bg-blue-100 text-blue-800";
    case "bus_transfer":
      return "bg-amber-100 text-amber-800";
    case "bus_metro_hybrid":
      return "bg-emerald-100 text-emerald-800";
    default:
      return "bg-slate-100 text-slate-700";
  }
}

export function getConfidenceTone(confidence: RouteConfidence) {
  switch (confidence) {
    case "exact":
      return "bg-secondary/12 text-secondary";
    case "verified":
      return "bg-primary/10 text-primary";
    default:
      return "bg-muted text-muted-foreground";
  }
}
