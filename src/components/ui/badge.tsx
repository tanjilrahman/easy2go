import { cva, type VariantProps } from "class-variance-authority";
import { HTMLAttributes } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-lg text-xs font-semibold transition",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground px-2.5 py-1",
        secondary: "bg-secondary/10 text-secondary px-2.5 py-1",
        outline: "border border-border bg-surface text-foreground px-2.5 py-1",
        muted: "bg-muted text-muted-foreground px-2.5 py-1",
        subtle: "bg-surface-strong text-muted-foreground px-2 py-0.5 text-[10px] uppercase tracking-wider",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
