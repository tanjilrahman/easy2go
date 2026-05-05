import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REVIEW_PATH = resolve(ROOT_DIR, "src/lib/data/dhaka-bus-stop-coordinate-review.json");
const APPROVED_PATH = resolve(ROOT_DIR, "src/lib/data/dhaka-bus-stop-approved-coordinates.json");
const MANUAL_PATH = resolve(ROOT_DIR, "src/lib/data/dhaka-bus-stop-manual-coordinates.json");
const SEED_PATH = resolve(ROOT_DIR, "src/lib/data/dhaka-bus-seed.json");
const OUTPUT_PATH = resolve(ROOT_DIR, "src/lib/data/dhaka-bus-stop-unresolved-report.json");

function parseArgs(argv) {
  const args = {
    review: REVIEW_PATH,
    approved: APPROVED_PATH,
    manual: MANUAL_PATH,
    seed: SEED_PATH,
    output: OUTPUT_PATH,
    limit: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument.startsWith("--limit=")) {
      args.limit = Number.parseInt(argument.slice("--limit=".length), 10);
      continue;
    }

    if (argument === "--limit") {
      args.limit = Number.parseInt(argv[index + 1] ?? "", 10);
      index += 1;
      continue;
    }

    if (/^\d+$/.test(argument)) {
      args.limit = Number.parseInt(argument, 10);
      continue;
    }

    for (const key of ["review", "approved", "manual", "seed", "output"]) {
      if (argument.startsWith(`--${key}=`)) {
        args[key] = resolve(ROOT_DIR, argument.slice(key.length + 3));
      } else if (argument === `--${key}`) {
        args[key] = resolve(ROOT_DIR, argv[index + 1] ?? args[key]);
        index += 1;
      }
    }
  }

  if (args.limit !== null && (!Number.isInteger(args.limit) || args.limit < 1)) {
    throw new Error("--limit must be a positive integer.");
  }

  return args;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readOptionalJson(path, fallback) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

function distanceKm(from, to) {
  const earthRadiusKm = 6371;
  const toRadians = (value) => (value * Math.PI) / 180;
  const deltaLatitude = toRadians(to[0] - from[0]);
  const deltaLongitude = toRadians(to[1] - from[1]);
  const latitude1 = toRadians(from[0]);
  const latitude2 = toRadians(to[0]);

  const haversine =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitude1) * Math.cos(latitude2) * Math.sin(deltaLongitude / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(haversine));
}

function addCoordinate(coordinatesByStopId, coordinatesByLabel, stopId, labels, coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    return;
  }

  if (stopId) {
    coordinatesByStopId.set(stopId, coordinates);
  }

  for (const label of labels.filter(Boolean)) {
    coordinatesByLabel.set(normalize(label), coordinates);
  }
}

function findNearbyResolvedStop(route, stopIndex, direction, stopsById, coordinatesByStopId, coordinatesByLabel) {
  for (let index = stopIndex + direction; index >= 0 && index < route.stopIds.length; index += direction) {
    const stopId = route.stopIds[index];
    const label = route.stopLabels[index];
    const coordinates = coordinatesByStopId.get(stopId) ?? coordinatesByLabel.get(normalize(label));

    if (coordinates) {
      const stop = stopsById.get(stopId);
      return {
        stopId,
        label,
        labelEn: stop?.labelEn,
        coordinates,
      };
    }
  }

  return null;
}

function buildRouteContexts(stop, seed, stopsById, coordinatesByStopId, coordinatesByLabel) {
  const contexts = [];
  const candidateCoordinates = stop.candidates[0]?.coordinates;

  for (const route of seed.routes) {
    const stopIndex = route.stopIds.indexOf(stop.stopId);
    if (stopIndex === -1) {
      continue;
    }

    const previousResolved = findNearbyResolvedStop(route, stopIndex, -1, stopsById, coordinatesByStopId, coordinatesByLabel);
    const nextResolved = findNearbyResolvedStop(route, stopIndex, 1, stopsById, coordinatesByStopId, coordinatesByLabel);

    contexts.push({
      routeId: route.id,
      busLabelEn: route.busLabelEn,
      previousResolved: previousResolved
        ? {
            stopId: previousResolved.stopId,
            label: previousResolved.label,
            labelEn: previousResolved.labelEn,
            candidateDistanceKm: candidateCoordinates
              ? Number(distanceKm(candidateCoordinates, previousResolved.coordinates).toFixed(2))
              : null,
          }
        : null,
      nextResolved: nextResolved
        ? {
            stopId: nextResolved.stopId,
            label: nextResolved.label,
            labelEn: nextResolved.labelEn,
            candidateDistanceKm: candidateCoordinates
              ? Number(distanceKm(candidateCoordinates, nextResolved.coordinates).toFixed(2))
              : null,
          }
        : null,
    });

    if (contexts.length >= 5) {
      break;
    }
  }

  return contexts;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const review = await readJson(args.review);
  const approved = await readJson(args.approved);
  const manual = await readOptionalJson(args.manual, { coordinates: [] });
  const seed = await readJson(args.seed);
  const stopsById = new Map(review.stops.map((stop) => [stop.stopId, stop]));
  const coordinatesByStopId = new Map();
  const coordinatesByLabel = new Map();
  const manualStopIds = new Set((manual.coordinates ?? []).map((entry) => entry.stopId));

  for (const entry of approved.approvedCoordinates ?? []) {
    addCoordinate(coordinatesByStopId, coordinatesByLabel, entry.review?.stopId, entry.labels ?? [], entry.coordinates);
  }

  for (const entry of manual.coordinates ?? []) {
    const stop = stopsById.get(entry.stopId);
    addCoordinate(
      coordinatesByStopId,
      coordinatesByLabel,
      entry.stopId,
      [entry.labelEn ?? stop?.labelEn, entry.label ?? stop?.label, entry.labelBn ?? stop?.labelBn].filter(Boolean),
      entry.coordinates,
    );
  }

  const unresolvedStops = review.stops
    .filter((stop) => stop.status !== "approved")
    .filter((stop) => !manualStopIds.has(stop.stopId))
    .sort((a, b) => b.routeCount - a.routeCount);
  const selectedStops = args.limit ? unresolvedStops.slice(0, args.limit) : unresolvedStops;
  const reportStops = selectedStops.map((stop) => ({
    stopId: stop.stopId,
    label: stop.label,
    labelEn: stop.labelEn,
    labelBn: stop.labelBn,
    routeCount: stop.routeCount,
    status: stop.status,
    reviewReason: stop.reviewReason,
    topCandidate: stop.candidates[0]
      ? {
          name: stop.candidates[0].name,
          coordinates: stop.candidates[0].coordinates,
          score: stop.candidates[0].score,
          confidence: stop.candidates[0].confidence,
          source: stop.candidates[0].source,
        }
      : null,
    routeContexts: buildRouteContexts(stop, seed, stopsById, coordinatesByStopId, coordinatesByLabel),
  }));

  const byStatus = unresolvedStops.reduce(
    (summary, stop) => ({
      ...summary,
      [stop.status]: (summary[stop.status] ?? 0) + 1,
    }),
    {},
  );

  await writeJson(args.output, {
    generatedAt: new Date().toISOString(),
    sourceReview: "src/lib/data/dhaka-bus-stop-coordinate-review.json",
    sourceApproved: "src/lib/data/dhaka-bus-stop-approved-coordinates.json",
    sourceManual: "src/lib/data/dhaka-bus-stop-manual-coordinates.json",
    summary: {
      unresolved: unresolvedStops.length,
      reported: reportStops.length,
      manualApproved: manualStopIds.size,
      byStatus,
    },
    stops: reportStops,
  });

  console.log(`Wrote ${reportStops.length} unresolved bus stop report entries to ${args.output}`);
  console.log(`Remaining unresolved: ${unresolvedStops.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
