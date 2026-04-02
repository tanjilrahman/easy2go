"use client";

import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PlannerPaneProps {
  paneKey: string;
  title: string;
  subtitle?: string;
  height?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function PlannerPane({
  paneKey,
  title,
  subtitle,
  height = "58vh",
  actions,
  children,
  className,
}: PlannerPaneProps) {
  return (
    <section className={cn("absolute inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-5 sm:pb-5", className)}>
      <motion.div
        layout
        transition={{ type: "spring", stiffness: 180, damping: 24 }}
        style={{ minHeight: height, maxHeight: "82vh" }}
        className="planner-pane mx-auto flex w-full max-w-xl flex-col overflow-hidden rounded-[34px]"
      >
        <div className="flex items-start justify-between gap-4 border-b border-white/10 px-5 pb-4 pt-4">
          <div>
            <div className="mb-3 h-1.5 w-14 rounded-full bg-white/12" />
            <h2 className="font-display text-[1.38rem] font-semibold tracking-tight text-white">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-1 max-w-md text-sm text-slate-300">{subtitle}</p>
            ) : null}
          </div>
          {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={paneKey}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="h-full overflow-y-auto px-5 pb-5 pt-4"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </section>
  );
}
