import {
  Bike,
  BusFront,
  CarTaxiFront,
  Footprints,
  LucideIcon,
  TrainFront,
  Van,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { TransportMode } from "@/lib/validations/routes";

const icons: Record<TransportMode, LucideIcon> = {
  walk: Footprints,
  bus: BusFront,
  rickshaw: Bike,
  leguna: Van,
  metro: TrainFront,
  ride_share: CarTaxiFront,
};

const tones: Record<TransportMode, string> = {
  walk: "bg-[rgba(101,93,137,0.1)] text-[rgb(95,86,135)]",
  bus: "bg-[rgba(90,67,215,0.12)] text-[rgb(72,53,173)]",
  rickshaw: "bg-[rgba(15,138,107,0.12)] text-[rgb(13,104,81)]",
  leguna: "bg-[rgba(183,121,31,0.14)] text-[rgb(126,78,20)]",
  metro: "bg-[rgba(118,94,241,0.12)] text-[rgb(79,61,180)]",
  ride_share: "bg-[rgba(195,75,119,0.12)] text-[rgb(156,53,93)]",
};

export function TransportIcon({
  mode,
  size = "md",
}: {
  mode: TransportMode;
  size?: "sm" | "md";
}) {
  const Icon = icons[mode];

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-2xl shadow-[0_18px_32px_-24px_rgba(15,31,55,0.55)]",
        tones[mode],
        size === "sm" ? "h-9 w-9" : "h-11 w-11",
      )}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </div>
  );
}
