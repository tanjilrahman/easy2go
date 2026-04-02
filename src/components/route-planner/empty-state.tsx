import { MapPinned, Sparkles } from "lucide-react";

interface EmptyStateProps {
  title: string;
  description: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="rounded-[28px] border border-dashed border-border bg-white/70 px-5 py-7 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
        <Sparkles className="h-6 w-6" />
      </div>
      <h3 className="font-display text-lg font-semibold text-foreground">{title}</h3>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
      <div className="mx-auto mt-5 flex w-fit items-center gap-2 rounded-full bg-muted px-3 py-2 text-xs font-medium text-muted-foreground">
        <MapPinned className="h-4 w-4" />
        Dhaka map-first planner
      </div>
    </div>
  );
}
