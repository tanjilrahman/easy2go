import {
  fromRoot,
  parsePathArgs,
  readJson,
  readOptionalJson,
  unresolvedStopSummary,
  writeJson,
} from "./script-utils.mjs";

const INPUT_PATH = fromRoot("src/lib/data/dhaka-bus-stop-coordinate-review.json");
const MANUAL_PATH = fromRoot("src/lib/data/dhaka-bus-stop-manual-coordinates.json");
const OUTPUT_PATH = fromRoot("src/lib/data/dhaka-bus-stop-approved-coordinates.json");

function parseArgs(argv) {
  return parsePathArgs(argv, {
    input: INPUT_PATH,
    manual: MANUAL_PATH,
    output: OUTPUT_PATH,
  });
}

function buildApprovedCoordinateEntry(stop) {
  const candidate = stop.approvedCandidate;

  return {
    labels: [stop.labelEn, stop.label, stop.labelBn].filter(Boolean),
    coordinates: candidate.coordinates,
    source: candidate.source,
    confidence: "verified",
    address: candidate.name,
    placeName: candidate.name,
    review: {
      status: stop.status,
      stopId: stop.stopId,
      score: candidate.score,
      matchedLabel: candidate.matchedLabel,
      matchedValue: candidate.matchedValue,
      osmType: candidate.osmType,
      osmId: candidate.osmId,
    },
  };
}

function assertCoordinates(stopId, coordinates) {
  if (!Array.isArray(coordinates) || coordinates.length !== 2) {
    throw new Error(`Manual coordinate entry for ${stopId} must contain [latitude, longitude].`);
  }

  const [latitude, longitude] = coordinates;
  assertFiniteCoordinates(stopId, latitude, longitude);
  assertDhakaAreaCoordinates(stopId, latitude, longitude);
}

function assertFiniteCoordinates(stopId, latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error(`Manual coordinate entry for ${stopId} must contain finite numbers.`);
  }
}

function assertDhakaAreaCoordinates(stopId, latitude, longitude) {
  if (latitude < 22.5 || latitude > 24.8 || longitude < 89.5 || longitude > 91.5) {
    throw new Error(`Manual coordinate entry for ${stopId} is outside the expected Dhaka-area bounds.`);
  }
}

function manualCoordinateLabels(entry, stop) {
  return [entry.labelEn ?? stop?.labelEn, entry.label ?? stop?.label, entry.labelBn ?? stop?.labelBn].filter(Boolean);
}

function manualCoordinateAddress(entry, stop) {
  return entry.address ?? entry.placeName ?? entry.label ?? stop?.label ?? entry.stopId;
}

function manualCoordinatePlaceName(entry, stop) {
  return entry.placeName ?? entry.address ?? entry.labelEn ?? stop?.labelEn ?? entry.stopId;
}

function buildManualCoordinateEntry(entry, stop) {
  assertCoordinates(entry.stopId, entry.coordinates);

  return {
    labels: manualCoordinateLabels(entry, stop),
    coordinates: entry.coordinates,
    source: entry.source ?? "manual",
    confidence: entry.confidence ?? "manual_verified",
    address: manualCoordinateAddress(entry, stop),
    placeName: manualCoordinatePlaceName(entry, stop),
    review: {
      status: "manual_approved",
      stopId: entry.stopId,
      reviewedAt: entry.reviewedAt,
      notes: entry.notes,
    },
  };
}

function buildManualCoordinateEntries(manualCoordinates, stopsById) {
  return manualCoordinates.map((entry) => {
    if (!entry.stopId) {
      throw new Error("Manual coordinate entries must include stopId.");
    }

    if (!stopsById.has(entry.stopId)) {
      throw new Error(`Manual coordinate entry references unknown stopId: ${entry.stopId}`);
    }

    return buildManualCoordinateEntry(entry, stopsById.get(entry.stopId));
  });
}

function buildUnresolvedStop(stop) {
  return unresolvedStopSummary(stop);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const review = await readJson(args.input);
  const manual = await readOptionalJson(args.manual, { coordinates: [] });
  const stopsById = new Map(review.stops.map((stop) => [stop.stopId, stop]));
  const manualCoordinates = manual.coordinates ?? [];
  const manualEntries = buildManualCoordinateEntries(manualCoordinates, stopsById);
  const manualStopIds = new Set(manualCoordinates.map((entry) => entry.stopId));
  const approved = review.stops
    .filter((stop) => stop.status === "approved" && stop.approvedCandidate)
    .filter((stop) => !manualStopIds.has(stop.stopId))
    .map(buildApprovedCoordinateEntry)
    .concat(manualEntries)
    .sort((a, b) => (a.labels[0] ?? "").localeCompare(b.labels[0] ?? ""));
  const unresolved = review.stops
    .filter((stop) => stop.status !== "approved")
    .filter((stop) => !manualStopIds.has(stop.stopId))
    .map(buildUnresolvedStop);

  await writeJson(args.output, {
    generatedAt: new Date().toISOString(),
    sourceReview: "src/lib/data/dhaka-bus-stop-coordinate-review.json",
    runtimeSafe: false,
    notes: [
      "Approved coordinate entries only. This file is a staging export, not wired into routing.",
      "Manual-review, weak, and no-source entries are excluded unless present in dhaka-bus-stop-manual-coordinates.json.",
    ],
    summary: {
      approved: approved.length,
      manualApproved: manualEntries.length,
      unresolved: unresolved.length,
      unresolvedByStatus: unresolved.reduce(
        (summary, stop) => ({
          ...summary,
          [stop.status]: (summary[stop.status] ?? 0) + 1,
        }),
        {},
      ),
    },
    approvedCoordinates: approved,
    unresolved,
  });

  console.log(`Wrote ${approved.length} approved bus stop coordinates to ${args.output}`);
  console.log(`Kept ${unresolved.length} unresolved stops for follow-up.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
