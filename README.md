# Easy2Go Next.js

Easy2Go is a mobile-first Dhaka route planner rebuilt as a production-ready Next.js App Router app with a serverless backend, shared Zod validation, Google Maps rendering, and deterministic route generation.

## Stack

- Next.js App Router with TypeScript
- Tailwind CSS v4
- shadcn-style reusable UI primitives
- Framer Motion for bottom-sheet and transition polish
- React Query for client data fetching
- Google Maps JavaScript API on the client
- Next.js Route Handlers for serverless APIs
- Zod for request and response validation

## API routes

- `POST /api/routes/calculate`
- `GET /api/locations/search?query=...`
- `GET /api/searches`

## Environment variables

Copy `.env.example` to `.env.local` and configure:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  Used by both the client map and the server-side geocoding, autocomplete, and directions helpers.

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
3. Restrict the Google Maps key as tightly as your deployment allows.
4. Deploy normally. The route handlers are compatible with Vercel serverless functions.

## Notes

- When Google calls fail, the app falls back to curated Dhaka suggestions and deterministic local route logic so the UX remains usable.
- Search history is stored in memory per server runtime. For fully durable shared history, swap the `src/db/search-store.ts` module with Vercel KV, Postgres, or another persistent store.

## Bus stop coordinate workflow

- Seed and approved bus stop coordinates live in `src/lib/data/dhaka-bus-stop-coordinates.json`.
- To generate reviewable suggestions for missing bus stops, run:

  ```bash
  npm run geocode:bus-stops -- --limit 25
  ```

- This writes `src/lib/data/dhaka-bus-stop-coordinate-suggestions.json` with candidate matches and a `recommended` coordinate for each stop.
- Review that file and change any trusted rows from `"status": "suggested"` to `"status": "approved"`.
- Then merge approved rows into the production override file:

  ```bash
  npm run merge:bus-stop-coordinates
  ```
