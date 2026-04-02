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
  walk: "bg-slate-100 text-slate-600",
  bus: "bg-blue-100 text-blue-700",
  rickshaw: "bg-emerald-100 text-emerald-700",
  leguna: "bg-amber-100 text-amber-700",
  metro: "bg-violet-100 text-violet-700",
  ride_share: "bg-rose-100 text-rose-700",
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
