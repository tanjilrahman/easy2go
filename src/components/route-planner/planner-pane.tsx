"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface PlannerPaneProps {
  paneKey: string;
  title?: string;
  subtitle?: string;
  maxHeight?: string;
  scrollable?: boolean;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  onHeightChange?: (height: number) => void;
}

export function PlannerPane({
  paneKey,
  title,
  subtitle,
  maxHeight = "70vh",
  scrollable = true,
  actions,
  children,
  className,
  onHeightChange,
}: PlannerPaneProps) {
  const showHeader = Boolean(title || subtitle || actions);
  const paneRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!paneRef.current || !onHeightChange || typeof ResizeObserver === "undefined") {
      return;
    }

    const element = paneRef.current;
    const updateHeight = () => onHeightChange(element.getBoundingClientRect().height);

    updateHeight();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [onHeightChange]);

  return (
    <section className={cn("absolute inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-4 sm:pb-4", className)}>
      <motion.div
        ref={paneRef}
        layout
        transition={{ type: "spring", stiffness: 180, damping: 24 }}
        style={{ maxHeight }}
        className="planner-pane mx-auto flex w-[calc(100vw-24px)] max-w-none flex-col overflow-hidden rounded-[30px] sm:max-w-[min(70vw,34rem)]"
      >
        {showHeader ? (
          <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-4 pb-3 pt-3">
            <div className="min-w-0">
              <div className="mb-2 h-1.5 w-12 rounded-full bg-slate-300/70" />
              {title ? (
                <h2 className="truncate font-display text-[1.02rem] font-semibold tracking-tight text-slate-900">
                  {title}
                </h2>
              ) : null}
              {subtitle ? (
                <p className="mt-0.5 truncate text-xs text-slate-500">{subtitle}</p>
              ) : null}
            </div>
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
          </div>
        ) : null}

        <div className="min-h-0 flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={paneKey}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className={cn(
                "flex h-full min-h-0 flex-col px-4 pb-4 pt-3",
                scrollable ? "overflow-hidden" : "overflow-hidden",
              )}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>
    </section>
  );
}
