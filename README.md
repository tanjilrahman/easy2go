# Easy2Go Next.js

Easy2Go is a mobile-first Dhaka route planner rebuilt as a production-ready Next.js App Router app with a serverless backend, shared Zod validation, Google Maps rendering, AI-assisted route generation, and fallback mock logic when providers are unavailable.

## Stack

- Next.js App Router with TypeScript
- Tailwind CSS v4
- shadcn-style reusable UI primitives
- Framer Motion for bottom-sheet and transition polish
- React Query for client data fetching
- Google Maps JavaScript API on the client
- Next.js Route Handlers for serverless APIs
- Zod for request and response validation
- OpenAI Responses API for structured Dhaka route planning

## API routes

- `POST /api/routes/calculate`
- `GET /api/locations/search?query=...`
- `GET /api/searches`

## Environment variables

Copy `.env.example` to `.env.local` and configure:

- `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  Use a referrer-restricted browser key for the client map. This is intentionally public but should be locked down to your domain.
- `GOOGLE_MAPS_SERVER_API_KEY`
  Server-only key for geocoding, autocomplete, and directions.
- `OPENAI_API_KEY`
  Preferred server-side credential for local and deployed AI requests.
- `OPENAI_ACCESS_TOKEN`
  Optional bearer token support. The app also attempts to read the local Codex auth token from `~/.codex/auth.json` during local development if no env credential is set.
- `OPENAI_ROUTE_MODEL`
  Optional override. Defaults to `gpt-5-mini`.
- `OPENAI_LOCATION_MODEL`
  Optional override for location fallback suggestions. Defaults to `gpt-5-mini`.

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
3. Restrict the browser Google Maps key to your Vercel domain.
4. Deploy normally. The route handlers are compatible with Vercel serverless functions.

## Notes

- When Google or OpenAI calls fail, the app falls back to curated Dhaka suggestions and mock route logic so the UX remains usable.
- Search history is stored in memory per server runtime. For fully durable shared history, swap the `src/db/search-store.ts` module with Vercel KV, Postgres, or another persistent store.
