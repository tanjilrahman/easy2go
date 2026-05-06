import type {
  PricingConfidence,
  RouteConfidence,
  RouteKind,
  RouteOption,
} from "@/lib/validations/routes";

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

export function formatRouteBdt(route: RouteOption) {
  const low = route.totalCostLowBdt ?? route.totalCost;
  const high = route.totalCostHighBdt ?? route.totalCost;

  if (low === undefined || high === undefined) {
    return "Fare varies";
  }

  if (Math.round(low) === Math.round(high)) {
    return formatBdt(high);
  }

  return `BDT ${Math.round(low)}-${Math.round(high)}`;
}

export function getPricingConfidenceLabel(confidence?: PricingConfidence) {
  switch (confidence) {
    case "exact":
      return "Exact";
    case "regulated_estimate":
      return "Regulated estimate";
    case "estimated":
      return "Estimated";
    default:
      return undefined;
  }
}
