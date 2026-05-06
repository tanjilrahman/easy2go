import {
  Bike,
  BusFront,
  CarTaxiFront,
  Footprints,
  LucideIcon,
  TrainFront,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { TransportMode } from "@/lib/validations/routes";

const icons: Record<TransportMode, LucideIcon> = {
  walk: Footprints,
  bus: BusFront,
  rickshaw: Bike,
  metro: TrainFront,
  ride_share: CarTaxiFront,
};

const tones: Record<TransportMode, string> = {
  walk: "bg-slate-100 text-slate-600",
  bus: "bg-primary/10 text-primary",
  rickshaw: "bg-emerald-50 text-emerald-700",
  metro: "bg-secondary/10 text-secondary",
  ride_share: "bg-rose-50 text-rose-600",
};

export function TransportIcon({
  mode,
  size = "md",
  className,
}: {
  mode: TransportMode;
  size?: "sm" | "md";
  className?: string;
}) {
  const Icon = icons[mode];

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-xl shrink-0",
        tones[mode],
        size === "sm" ? "h-9 w-9" : "h-11 w-11",
        className
      )}
    >
      <Icon className={size === "sm" ? "h-4 w-4" : "h-5 w-5"} />
    </div>
  );
}
