"use client";

import { useSyncExternalStore } from "react";

import { RoutePlannerApp } from "@/components/route-planner/route-planner-app";

function subscribe() {
  return () => undefined;
}

function getSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

function RoutePlannerLoadingShell() {
  return (
    <main className="relative h-dvh min-h-[100svh] overflow-hidden bg-background">
      <div className="absolute inset-0 h-full w-full bg-background" />
      <section className="absolute inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="planner-pane mx-auto flex h-[46vh] w-[calc(100vw-24px)] max-w-none flex-col overflow-hidden rounded-2xl sm:max-w-[min(70vw,34rem)]">
          <div className="flex h-full min-h-0 flex-col px-5 pb-5 pt-4">
            <div className="space-y-3 animate-pulse">
              <div className="space-y-2 px-1 py-1">
                <div className="h-5 w-32 rounded-lg bg-slate-200" />
                <div className="h-3 w-56 rounded-lg bg-slate-100" />
              </div>
              <div className="h-14 rounded-xl bg-surface-strong" />
              <div className="mx-auto h-8 w-8 rounded-lg bg-surface-strong" />
              <div className="h-14 rounded-xl bg-surface-strong" />
            </div>
            <div className="mt-auto border-t border-border pt-4">
              <div className="h-11 rounded-xl bg-primary/80" />
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

export function RoutePlannerAppShell() {
  const hydrated = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return hydrated ? <RoutePlannerApp /> : <RoutePlannerLoadingShell />;
}
