import { fromRoot, parsePathArgs, readJson, writeJson } from "./script-utils.mjs";

const INPUT_PATH = fromRoot("src/lib/data/dhaka-bus-stop-coordinate-candidates.json");
const OUTPUT_PATH = fromRoot("src/lib/data/dhaka-bus-stop-coordinate-review.json");
const AUTO_APPROVE_MIN_SCORE = 107;

const forcedManualReviewLabels = new Set([
  "abdullahpur",
  "airport",
  "amin bazar",
  "purobi",
  "badda",
  "babubazar",
  "nabisco",
  "sadarghat",
  "keraniganj",
  "rajarbag",
  "madanpur",
  "hazaribag",
  "cantonment",
  "dhanmondi",
  "fulbaria",
  "jatrabari",
  "joydebpur",
  "rajendrapur",
  "signal",
]);

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

function parseArgs(argv) {
  return parsePathArgs(argv, {
    input: INPUT_PATH,
    output: OUTPUT_PATH,
  });
}

function reviewReason(entry, topCandidate) {
  if (!topCandidate) {
    return "No OSM transit candidate matched this seed stop.";
  }

  if (forcedManualReviewLabels.has(normalizeText(entry.labelEn))) {
    return "Route-context review required before trusting this lower-score or ambiguous named match.";
  }

  if (topCandidate.confidence === "strong_candidate" && topCandidate.score >= AUTO_APPROVE_MIN_SCORE) {
    return `Auto-approved: strong OSM transit match with score ${topCandidate.score}.`;
  }

  if (topCandidate.confidence === "strong_candidate") {
    return `Manual review required: strong match score ${topCandidate.score} is below auto-approval threshold ${AUTO_APPROVE_MIN_SCORE}.`;
  }

  if (topCandidate.confidence === "candidate") {
    return "Manual review required: medium-confidence OSM match.";
  }

  return "Rejected for now: weak OSM match, likely text-overlap noise or unrelated nearby transit object.";
}

function reviewStatus(entry, topCandidate) {
  if (!topCandidate) {
    return "needs_source";
  }

  if (forcedManualReviewLabels.has(normalizeText(entry.labelEn))) {
    return "needs_manual_review";
  }

  if (topCandidate.confidence === "strong_candidate" && topCandidate.score >= AUTO_APPROVE_MIN_SCORE) {
    return "approved";
  }

  if (topCandidate.confidence === "strong_candidate" || topCandidate.confidence === "candidate") {
    return "needs_manual_review";
  }

  return "rejected_weak_match";
}

function buildReviewedEntry(entry) {
  const topCandidate = entry.candidates[0] ?? null;
  const status = reviewStatus(entry, topCandidate);

  return {
    stopId: entry.stopId,
    label: entry.label,
    labelEn: entry.labelEn,
    labelBn: entry.labelBn,
    routeCount: entry.routeCount,
    status,
    reviewReason: reviewReason(entry, topCandidate),
    approvedCandidate:
      status === "approved"
        ? {
            name: topCandidate.name,
            coordinates: topCandidate.coordinates,
            source: topCandidate.source,
            osmType: topCandidate.osmType,
            osmId: topCandidate.osmId,
            score: topCandidate.score,
            matchedLabel: topCandidate.matchedLabel,
            matchedValue: topCandidate.matchedValue,
            tags: topCandidate.tags,
          }
        : null,
    candidates: entry.candidates,
  };
}

function summarize(entries) {
  return entries.reduce(
    (summary, entry) => ({
      ...summary,
      [entry.status]: (summary[entry.status] ?? 0) + 1,
    }),
    {},
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = await readJson(args.input);
  const reviewed = input.candidates.map(buildReviewedEntry);
  const summary = summarize(reviewed);

  await writeJson(args.output, {
    generatedAt: new Date().toISOString(),
    sourceCandidates: "src/lib/data/dhaka-bus-stop-coordinate-candidates.json",
    policy: {
      autoApproveMinScore: AUTO_APPROVE_MIN_SCORE,
      autoApproveRule:
        "Approve only top candidates with confidence=strong_candidate and score >= 107, excluding known ambiguous labels.",
      runtimeSafe: false,
      notes: [
        "This file is reviewed candidate data, not runtime metadata.",
        "needs_manual_review and needs_source entries must not be merged automatically.",
        "rejected_weak_match entries are retained for traceability but should not be used for routing.",
      ],
    },
    summary,
    stops: reviewed,
  });

  console.log(`Wrote reviewed bus stop coordinates to ${args.output}`);
  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
