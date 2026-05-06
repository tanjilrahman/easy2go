import { Coins, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { formatBdt, getRouteKindLabel, getRouteKindTone } from "@/lib/transport";
import { cn } from "@/lib/utils";
import type { RouteOption } from "@/lib/validations/routes";

const badgeClass = "rounded-lg px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em]";

function RouteBadges({ route, label }: { route: RouteOption; label?: string }) {
  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      {label ? (
        <span className="rounded-lg bg-foreground px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-foreground">
          {label}
        </span>
      ) : null}
      <span className={cn(badgeClass, getRouteKindTone(route.kind))}>
        {getRouteKindLabel(route.kind)}
      </span>
    </div>
  );
}

export function RouteOverview({
  route,
  label,
  boardTextClassName = "text-xs",
  showParentStop = false,
}: {
  route: RouteOption;
  label?: string;
  boardTextClassName?: string;
  showParentStop?: boolean;
}) {
  return (
    <>
      <RouteBadges route={route} label={label} />
      <h3 className="font-display text-base font-semibold text-foreground">{route.summary}</h3>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {route.mapPreview.originLabel} to {route.mapPreview.destinationLabel}
      </p>
      {route.mapPreview.originLabel !== route.boarding.label ? (
        <p className={cn("mt-1 text-muted-foreground", boardTextClassName)}>
          Board at {route.boarding.label}
        </p>
      ) : null}
      {showParentStop &&
      route.boarding.canonicalLabel &&
      route.boarding.canonicalLabel !== route.boarding.label ? (
        <p className="mt-1 text-xs text-muted-foreground">
          Parent stop: {route.boarding.canonicalLabel}
        </p>
      ) : null}
    </>
  );
}

export function RouteMetric({
  icon: Icon,
  iconClassName,
  children,
}: {
  icon: LucideIcon;
  iconClassName: string;
  children: ReactNode;
}) {
  return (
    <div className="compare-metric">
      <Icon className={cn("h-4 w-4", iconClassName)} />
      <span>{children}</span>
    </div>
  );
}

export function RouteCoreMetrics({
  route,
  durationIcon,
  transferIcon,
  includeDistance = false,
  distanceIcon,
}: {
  route: RouteOption;
  durationIcon: LucideIcon;
  transferIcon: LucideIcon;
  includeDistance?: boolean;
  distanceIcon?: LucideIcon;
}) {
  return (
    <>
      <RouteMetric icon={durationIcon} iconClassName="text-secondary">
        {route.estimatedDurationMinutes ? `${route.estimatedDurationMinutes} min` : "N/A"}
      </RouteMetric>
      <RouteMetric icon={Coins} iconClassName="text-emerald-600">
        {formatBdt(route.totalCost)}
      </RouteMetric>
      <RouteMetric icon={transferIcon} iconClassName="text-amber-600">
        {route.transferCount ? `${route.transferCount} transfer` : "Direct flow"}
      </RouteMetric>
      {includeDistance && distanceIcon ? (
        <RouteMetric icon={distanceIcon} iconClassName="text-primary">
          {route.estimatedDistanceKm ? `${route.estimatedDistanceKm} km` : "Dhaka map"}
        </RouteMetric>
      ) : null}
    </>
  );
}

export function RouteServiceLabels({
  route,
  className = "bg-surface-strong text-primary",
  textClassName = "text-xs",
}: {
  route: RouteOption;
  className?: string;
  textClassName?: string;
}) {
  if (!route.serviceLabels.length) {
    return null;
  }

  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {route.serviceLabels.map((service) => (
        <span
          key={service}
          className={cn(
            "rounded-lg border border-border px-2.5 py-1 font-medium",
            className,
            textClassName,
          )}
        >
          {service}
        </span>
      ))}
    </div>
  );
}
