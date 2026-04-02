import { NextResponse } from "next/server";

import { getRecentSearches } from "@/db/search-store";
import { searchesResponseSchema } from "@/lib/validations/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const searches = await getRecentSearches();

  return NextResponse.json(searchesResponseSchema.parse({ searches }), {
    status: 200,
  });
}
