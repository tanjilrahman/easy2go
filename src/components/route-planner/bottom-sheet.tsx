"use client";

import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { PropsWithChildren } from "react";

import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface BottomSheetProps extends PropsWithChildren {
  open: boolean;
  onClose?: () => void;
  title: string;
  subtitle?: string;
  height?: string;
  className?: string;
}

export function BottomSheet({
  open,
  onClose,
  title,
  subtitle,
  height = "72vh",
  className,
  children,
}: BottomSheetProps) {
  return (
    <AnimatePresence>
      {open ? (
        <>
          <motion.button
            aria-label="Close sheet"
            type="button"
            className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          <motion.section
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 220, damping: 28 }}
            style={{ height, maxHeight: "90vh" }}
            className={cn(
              "sheet-shadow fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-2xl bg-surface backdrop-blur-xl",
              className,
            )}
          >
            <div className="flex-none border-b border-border px-5 pb-4 pt-3">
              <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-muted-foreground/20" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-[1.3rem] font-semibold tracking-tight text-foreground">
                    {title}
                  </h2>
                  {subtitle ? (
                    <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
                  ) : null}
                </div>
                {onClose ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-surface-strong text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  >
                    <X className="h-5 w-5" />
                  </button>
                ) : null}
              </div>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="px-5 pb-8 pt-5">{children}</div>
            </ScrollArea>
          </motion.section>
        </>
      ) : null}
    </AnimatePresence>
  );
}
