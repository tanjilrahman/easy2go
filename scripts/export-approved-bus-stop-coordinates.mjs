import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_PATH = resolve(ROOT_DIR, "src/lib/data/dhaka-bus-stop-coordinate-review.json");
const OUTPUT_PATH = resolve(ROOT_DIR, "src/lib/data/dhaka-bus-stop-approved-coordinates.json");

function parseArgs(argv) {
  const args = {
    input: INPUT_PATH,
    output: OUTPUT_PATH,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument.startsWith("--input=")) {
      args.input = resolve(ROOT_DIR, argument.slice("--input=".length));
      continue;
    }

    if (argument === "--input") {
      args.input = resolve(ROOT_DIR, argv[index + 1] ?? args.input);
      index += 1;
      continue;
    }

    if (argument.startsWith("--output=")) {
      args.output = resolve(ROOT_DIR, argument.slice("--output=".length));
      continue;
    }

    if (argument === "--output") {
      args.output = resolve(ROOT_DIR, argv[index + 1] ?? args.output);
      index += 1;
    }
  }

  return args;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
      score: candidate.score,
      matchedLabel: candidate.matchedLabel,
      matchedValue: candidate.matchedValue,
      osmType: candidate.osmType,
      osmId: candidate.osmId,
    },
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const review = await readJson(args.input);
  const approved = review.stops
    .filter((stop) => stop.status === "approved" && stop.approvedCandidate)
    .map(buildApprovedCoordinateEntry)
    .sort((a, b) => (a.labels[0] ?? "").localeCompare(b.labels[0] ?? ""));
  const unresolved = review.stops
    .filter((stop) => stop.status !== "approved")
    .map((stop) => ({
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
    }));

  await writeJson(args.output, {
    generatedAt: new Date().toISOString(),
    sourceReview: "src/lib/data/dhaka-bus-stop-coordinate-review.json",
    runtimeSafe: false,
    notes: [
      "Approved coordinate entries only. This file is a staging export, not wired into routing.",
      "Manual-review, weak, and no-source entries are intentionally excluded from approvedCoordinates.",
    ],
    summary: {
      approved: approved.length,
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
