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
            className="fixed inset-0 z-40 bg-[rgba(8,20,37,0.34)] backdrop-blur-[3px]"
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
              "sheet-shadow fixed inset-x-0 bottom-0 z-50 flex flex-col overflow-hidden rounded-t-[34px] bg-[rgba(250,253,255,0.96)] backdrop-blur-2xl",
              className,
            )}
          >
            <div className="flex-none border-b border-border/70 px-5 pb-4 pt-3">
              <div className="mx-auto mb-4 h-1.5 w-14 rounded-full bg-muted-foreground/18" />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-[1.4rem] font-semibold tracking-tight text-foreground">
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
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-white/60 bg-white/72 text-muted-foreground transition hover:text-foreground"
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
