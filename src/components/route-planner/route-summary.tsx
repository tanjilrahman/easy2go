import { ArrowRight, Coins, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

import { formatBdt } from "@/lib/transport";
import { cn } from "@/lib/utils";
import type { RouteOption } from "@/lib/validations/routes";

function RouteBadges({ label }: { label?: string }) {
  if (!label) {
    return null;
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <span className="rounded-lg bg-foreground px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-primary-foreground">
        {label}
      </span>
    </div>
  );
}

function getRouteStopLabels(route: RouteOption) {
  const labels: string[] = [];
  const seen = new Set<string>();

  for (const segment of route.segments) {
    for (const label of [segment.startLocation, segment.endLocation]) {
      const normalized = label.trim().toLowerCase();

      if (!normalized || seen.has(normalized)) {
        continue;
      }

      seen.add(normalized);
      labels.push(label);
    }
  }

  return labels;
}

function RouteStopChain({
  route,
  className,
}: {
  route: RouteOption;
  className?: string;
}) {
  const labels = getRouteStopLabels(route);

  if (labels.length < 2) {
    return null;
  }

  return (
    <div
      className={cn(
        "mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground",
        className,
      )}
    >
      {labels.map((label, index) => (
        <span key={`${label}-${index}`} className="inline-flex min-w-0 items-center gap-1.5">
          {index > 0 ? (
            <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground/35" />
          ) : null}
          <span className="max-w-[9.5rem] truncate">{label}</span>
        </span>
      ))}
    </div>
  );
}

export function RouteOverview({
  route,
  label,
  boardTextClassName = "text-xs",
  showParentStop = false,
  showStopChain = true,
}: {
  route: RouteOption;
  label?: string;
  boardTextClassName?: string;
  showParentStop?: boolean;
  showStopChain?: boolean;
}) {
  return (
    <>
      <RouteBadges label={label} />
      <h3 className="font-display text-base font-semibold text-foreground tracking-tight">{route.summary}</h3>
      <div className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground">
        <span className="truncate">{route.mapPreview.originLabel}</span>
        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40" />
        <span className="truncate">{route.mapPreview.destinationLabel}</span>
      </div>
      {showStopChain ? (
        <RouteStopChain route={route} className={boardTextClassName} />
      ) : null}
      {showParentStop &&
      route.boarding.canonicalLabel &&
      route.boarding.canonicalLabel !== route.boarding.label ? (
        <div className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground/70">
          <div className="h-1 w-1 shrink-0 rounded-full bg-muted-foreground/40" />
          <span className="truncate">{route.boarding.canonicalLabel}</span>
        </div>
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
    <div className="flex items-center gap-1.5 whitespace-nowrap">
      <Icon className={cn("h-3.5 w-3.5", iconClassName)} />
      <span className="text-muted-foreground">{children}</span>
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
        {route.estimatedDurationMinutes ? (
          <><span className="font-semibold text-foreground">{route.estimatedDurationMinutes}</span>m</>
        ) : "N/A"}
      </RouteMetric>
      <RouteMetric icon={Coins} iconClassName="text-emerald-600">
        <span className="font-semibold text-foreground">{formatBdt(route.totalCost)}</span>
      </RouteMetric>
      {route.transferCount ? (
        <RouteMetric icon={transferIcon} iconClassName="text-amber-600">
          <><span className="font-semibold text-foreground">{route.transferCount}</span> trans</>
        </RouteMetric>
      ) : null}
      {includeDistance && distanceIcon ? (
        <RouteMetric icon={distanceIcon} iconClassName="text-primary">
          {route.estimatedDistanceKm ? (
            <><span className="font-semibold text-foreground">{route.estimatedDistanceKm}</span>km</>
          ) : "Map"}
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
