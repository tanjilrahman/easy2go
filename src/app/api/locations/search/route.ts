import { NextResponse } from "next/server";
import { z } from "zod";

import { searchLocations } from "@/lib/server/location-search";
import { locationSearchResponseSchema } from "@/lib/validations/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  query: z.string().trim().min(2),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const { query } = querySchema.parse({
      query: url.searchParams.get("query") ?? "",
    });

    const suggestions = await searchLocations(query);

    return NextResponse.json(
      locationSearchResponseSchema.parse({ suggestions }),
      { status: 200 },
    );
  } catch {
    return NextResponse.json(
      {
        suggestions: [],
      },
      { status: 200 },
    );
  }
}
