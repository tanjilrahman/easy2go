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
    <section className={cn("pointer-events-none absolute inset-x-0 bottom-0 z-30 px-3 pb-3 sm:px-4 sm:pb-4", className)}>
      <motion.div
        ref={paneRef}
        layout
        transition={{ type: "spring", stiffness: 180, damping: 24 }}
        style={{ maxHeight }}
        className="pointer-events-auto planner-pane mx-auto flex w-[calc(100vw-24px)] max-w-none flex-col overflow-hidden rounded-2xl sm:max-w-[min(70vw,34rem)]"
      >
        {showHeader ? (
          <div className="flex items-start justify-between gap-3 border-b border-border px-4 pb-2 pt-3">
            <div className="min-w-0">
              {title ? (
                <h2 className="truncate font-display text-lg font-semibold tracking-tight text-foreground">
                  {title}
                </h2>
              ) : null}
              {subtitle ? (
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitle}</p>
              ) : null}
            </div>
            {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
          </div>
        ) : null}

        <div className={cn("flex min-h-0 flex-col overflow-hidden", scrollable ? "flex-1" : "")}>
          <AnimatePresence mode="wait">
            <motion.div
              key={paneKey}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className={cn(
                "flex min-h-0 flex-col px-4 pb-4 pt-3",
                scrollable ? "flex-1 overflow-y-auto overscroll-contain" : "",
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
