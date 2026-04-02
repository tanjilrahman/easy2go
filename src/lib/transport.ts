import type {
  RouteConfidence,
  RouteKind,
  TransportMode,
} from "@/lib/validations/routes";

export const transportModeMeta: Record<
  TransportMode,
  { label: string; color: string }
> = {
  walk: { label: "Walk", color: "#7a719f" },
  bus: { label: "Bus", color: "#5a43d7" },
  rickshaw: { label: "Rickshaw", color: "#0f8a6b" },
  leguna: { label: "Leguna", color: "#b7791f" },
  metro: { label: "Metro", color: "#765ef1" },
  ride_share: { label: "Ride Share", color: "#c34b77" },
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
      return "bg-[rgba(118,94,241,0.12)] text-[rgb(68,48,160)]";
    case "bus_direct":
      return "bg-[rgba(90,67,215,0.12)] text-[rgb(62,44,151)]";
    case "bus_transfer":
      return "bg-[rgba(183,121,31,0.14)] text-[rgb(126,78,20)]";
    case "bus_metro_hybrid":
      return "bg-[rgba(15,138,107,0.12)] text-[rgb(13,104,81)]";
    default:
      return "bg-[rgba(101,93,137,0.12)] text-[rgb(87,80,119)]";
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

export function formatBdt(amount?: number) {
  if (amount === undefined) {
    return "Fare varies";
  }

  return `BDT ${Math.round(amount)}`;
}
