"use client";

import { cn } from "@/lib/utils";

interface GoogleRoutePreviewProps {
  originQuery: string;
  destinationQuery: string;
  className?: string;
}

export function GoogleRoutePreview({
  originQuery,
  destinationQuery,
  className,
}: GoogleRoutePreviewProps) {
  const src = `https://maps.google.com/maps?q=from+${encodeURIComponent(originQuery)}+to+${encodeURIComponent(destinationQuery)}&output=embed`;

  return (
    <div className={cn("relative overflow-hidden rounded-[26px]", className)}>
      <iframe
        title="Transit preview"
        src={src}
        className="absolute inset-0 h-full w-full border-0"
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
