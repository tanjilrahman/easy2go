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
      <div className="absolute inset-0 h-full w-full bg-[linear-gradient(180deg,#edf5fb,#dce9f5)]" />
      <section className="absolute inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-4 sm:pb-4">
        <div className="planner-pane mx-auto flex h-[46vh] w-[calc(100vw-24px)] max-w-none flex-col overflow-hidden rounded-[30px] sm:max-w-[min(70vw,34rem)]">
          <div className="flex h-full min-h-0 flex-col px-4 pb-4 pt-3">
            <div className="space-y-3 animate-pulse">
              <div className="space-y-2 px-1 py-1">
                <div className="h-5 w-32 rounded-full bg-slate-200" />
                <div className="h-3 w-56 rounded-full bg-slate-100" />
              </div>
              <div className="h-16 rounded-[24px] bg-white/80" />
              <div className="mx-auto h-8 w-8 rounded-full bg-white/80" />
              <div className="h-16 rounded-[24px] bg-white/80" />
            </div>
            <div className="mt-auto border-t border-slate-200 pt-3">
              <div className="h-11 rounded-[20px] bg-[linear-gradient(135deg,#5a43d7_0%,#765ef1_100%)] opacity-75" />
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
