# Easy2Go Next.js

Easy2Go is a mobile-first Dhaka route planner rebuilt as a production-ready Next.js App Router app with a serverless backend, shared Zod validation, open maps, local-first autocomplete, and deterministic local route generation.

## Stack

- Next.js App Router with TypeScript
- Tailwind CSS v4
- shadcn-style reusable UI primitives
- Framer Motion for bottom-sheet and transition polish
- React Query for client data fetching
- MapLibre GL with OpenStreetMap-derived vector tiles for the interactive map
- Geoapify autocomplete as an optional fallback after curated local Dhaka suggestions
- Next.js Route Handlers for serverless APIs
- Zod for request and response validation

## API routes

- `POST /api/routes/calculate`
- `GET /api/locations/search?query=...`
- `GET /api/searches`

## Environment variables

Copy `.env.example` to `.env.local` and configure:

- `NEXT_PUBLIC_MAP_STYLE_URL`
  Optional MapLibre style URL. Leave blank to use the built-in no-key CARTO Positron raster style.
- `NEXT_PUBLIC_MAP_ATTRIBUTION`
  Visible attribution text for the configured map style/tile provider.
- `GEOAPIFY_API_KEY`
  Optional fallback autocomplete key for unknown places after local Dhaka suggestions. Also enables server-side road-snapped route geometry.
- `GEOAPIFY_AUTOCOMPLETE_ENABLED`
  Set to `false` to disable Geoapify autocomplete entirely.
- `GEOAPIFY_ROUTING_MAX_WAYPOINTS`
  Optional server-side cap for road-snapped route requests. Defaults to `24` to control free-tier credit usage.

No map key is required for the default map style. The app still works without `GEOAPIFY_API_KEY`; typed suggestions will be limited to the curated local Dhaka catalog and route lines will fall back to estimated local corridors.

## Local development

1. Install dependencies:

   ```bash
   npm install
   ```

2. Configure `.env.local`.

3. Run the dev server:

   ```bash
   npm run dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

## Deployment on Vercel

1. Import the project into Vercel.
2. Add the same environment variables from `.env.example`.
3. Add a Geoapify key only if external fallback autocomplete is needed.
4. Deploy normally. The route handlers are compatible with Vercel serverless functions.

## Notes

- When Geoapify calls fail, the app falls back to curated Dhaka suggestions and deterministic local route logic so the UX remains usable.
- Route computation is local and deterministic; no external routing API is used for bus or metro planning. The map preview is rendered locally with MapLibre using route geometry from known Dhaka stops, stations, and selected endpoints.
- Search history is stored in memory per server runtime. For fully durable shared history, swap the `src/db/search-store.ts` module with Vercel KV, Postgres, or another persistent store.

## Bus stop coordinate workflow

- Runtime bus stop coordinates are built from `src/lib/data/dhaka-bus-stop-reviewed-metadata.json`.
- Reviewed coordinates and unresolved follow-up data live in `src/lib/data/dhaka-bus-stop-approved-coordinates.json`.
- Manually verified unresolved stops should be added to `src/lib/data/dhaka-bus-stop-manual-coordinates.json`.
- After editing manual coordinates, regenerate the derived files:

  ```bash
  npm run export:bus-stop-coordinates
  npm run build:reviewed-bus-stop-metadata
  npm run report:unresolved-bus-stops
  ```
