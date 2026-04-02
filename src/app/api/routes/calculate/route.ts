import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { createSearchRecord } from "@/db/search-store";
import { calculateRoutes } from "@/lib/server/route-planner";
import { calculateRouteRequestSchema } from "@/lib/validations/routes";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const payload = calculateRouteRequestSchema.parse(body);

    const searchRecord = await createSearchRecord(payload.origin.name, payload.destination.name);
    const response = await calculateRoutes(payload);

    return NextResponse.json(
      {
        ...response,
        searchId: searchRecord.id,
      },
      { status: 200 },
    );
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json(
        {
          message: error.issues[0]?.message ?? "Invalid request payload.",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        message: "Unable to calculate routes right now. Please try again.",
      },
      { status: 500 },
    );
  }
}
