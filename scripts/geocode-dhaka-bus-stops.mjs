import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATASET_PATH = resolve(ROOT_DIR, "src/lib/data/dhaka-bus-seed.json");
const OVERRIDES_PATH = resolve(ROOT_DIR, "src/lib/data/dhaka-bus-stop-coordinates.json");
const METADATA_PATH = resolve(ROOT_DIR, "src/lib/data/dhaka-bus-stop-metadata.json");
const VARIANTS_PATH = resolve(ROOT_DIR, "src/lib/data/dhaka-bus-stop-variants.json");
const SUGGESTIONS_PATH = resolve(
  ROOT_DIR,
  "src/lib/data/dhaka-bus-stop-coordinate-suggestions.json",
);

const PHOTON_BASE_URL = "https://photon.komoot.io/api/";

function parseArgs(argv) {
  const args = {
    limit: 25,
    output: SUGGESTIONS_PATH,
    sleepMs: 1000,
    mergeApproved: false,
  };
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (/^\d+$/.test(argument)) {
      positional.push(Number(argument));
      continue;
    }

    if (argument.startsWith("--limit=")) {
      args.limit = Number(argument.slice("--limit=".length));
      continue;
    }

    if (argument === "--limit") {
      args.limit = Number(argv[index + 1] ?? args.limit);
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
      continue;
    }

    if (argument.startsWith("--sleep-ms=")) {
      args.sleepMs = Number(argument.slice("--sleep-ms=".length));
      continue;
    }

    if (argument === "--sleep-ms") {
      args.sleepMs = Number(argv[index + 1] ?? args.sleepMs);
      index += 1;
      continue;
    }

    if (argument === "--merge-approved") {
      args.mergeApproved = true;
    }
  }

  if (positional[0] !== undefined) {
    args.limit = positional[0];
  }

  if (positional[1] !== undefined) {
    args.sleepMs = positional[1];
  }

  return args;
}

function normalizeText(value) {
  return value
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokenizeText(value) {
  return normalizeText(value).split(" ").filter(Boolean);
}

function dedupe(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function derivePlaceName(address) {
  return address?.split(",")[0]?.trim() || undefined;
}

function haversineDistanceKm(a, b) {
  const toRadians = (value) => (value * Math.PI) / 180;
  const earthRadiusKm = 6371;
  const dLat = toRadians(b[0] - a[0]);
  const dLng = toRadians(b[1] - a[1]);
  const lat1 = toRadians(a[0]);
  const lat2 = toRadians(b[0]);
  const chord =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(chord));
}

function formatSearchableLabel(label) {
  return label.replace(/\(([^)]+)\)/g, "$1").replace(/\s+/g, " ").trim();
}

function isDhakaAreaCoordinate([lat, lng]) {
  return lat >= 23.55 && lat <= 24.05 && lng >= 90.15 && lng <= 90.65;
}

function overlapScore(a, b) {
  const aTokens = tokenizeText(a);
  const bTokens = tokenizeText(b);

  if (!aTokens.length || !bTokens.length) {
    return 0;
  }

  const overlapCount = aTokens.filter((token) => bTokens.includes(token)).length;
  return overlapCount / Math.max(aTokens.length, bTokens.length);
}

function scoreCandidate(stop, candidate) {
  const candidateName = candidate.name ?? "";
  const haystack = `${candidateName} ${candidate.display_name ?? ""}`;
  const normalizedLabel = normalizeText(stop.labelEn);
  const normalizedHaystack = normalizeText(haystack);
  let score = 0;

  if (candidateName && normalizeText(candidateName) === normalizedLabel) {
    score += 45;
  } else if (normalizedHaystack.includes(normalizedLabel)) {
    score += 30;
  }

  score += Math.round(overlapScore(stop.labelEn, haystack) * 30);

  if (candidate.category === "highway" && candidate.type === "bus_stop") {
    score += 30;
  } else if (candidate.type === "bus_station" || candidate.category === "amenity") {
    score += 20;
  }

  if (normalizeText(candidate.display_name ?? "").includes("dhaka")) {
    score += 6;
  }

  if (isDhakaAreaCoordinate([Number(candidate.lat), Number(candidate.lon)])) {
    score += 6;
  }

  return score;
}

function suggestedConfidence(candidateScore, candidate) {
  if (candidateScore >= 75 && candidate.category === "highway" && candidate.type === "bus_stop") {
    return "verified";
  }

  if (candidateScore >= 60 && (candidate.type === "bus_stop" || candidate.type === "bus_station")) {
    return "approximate";
  }

  return null;
}

function buildQueries(stop) {
  const labelEn = formatSearchableLabel(stop.labelEn);
  const localized = stop.labelBn ? formatSearchableLabel(stop.labelBn) : "";

  return dedupe([
    `${labelEn} bus stop, Dhaka, Bangladesh`,
    `${labelEn}, Dhaka, Bangladesh`,
    localized ? `${localized} bus stop, Dhaka, Bangladesh` : "",
  ]);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function sleep(milliseconds) {
  if (milliseconds > 0) {
    await new Promise((resolvePromise) => {
      setTimeout(resolvePromise, milliseconds);
    });
  }
}

async function searchPhoton(query) {
  const url = new URL(PHOTON_BASE_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "5");

  const response = await fetch(url, {
    headers: {
      "user-agent": "easy2go-stop-geocoder/1.0 (local dataset enrichment)",
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Photon lookup failed for "${query}" with status ${response.status}`);
  }

  const payload = await response.json();

  return (payload.features ?? []).map((feature) => ({
    name: feature.properties?.name ?? "",
    display_name: [
      feature.properties?.name,
      feature.properties?.street,
      feature.properties?.locality,
      feature.properties?.district,
      feature.properties?.city,
      feature.properties?.country,
    ]
      .filter(Boolean)
      .join(", "),
    category: feature.properties?.osm_key ?? "",
    type: feature.properties?.osm_value ?? feature.properties?.type ?? "",
    lat: feature.geometry?.coordinates?.[1],
    lon: feature.geometry?.coordinates?.[0],
  }));
}

function buildOverrideCoverageSet(overrides) {
  return new Set(
    overrides.flatMap((override) =>
      override.labels.flatMap((label) => [normalizeText(label)]),
    ),
  );
}

function isTransitCandidate(candidate) {
  return (
    (candidate.category === "highway" && candidate.type === "bus_stop") ||
    candidate.type === "bus_station"
  );
}

function buildSuggestionEntry(stop, queries, candidateGroups) {
  const flattenedCandidates = candidateGroups
    .flatMap((group) =>
      group.candidates.map((candidate) => ({
        query: group.query,
        name: candidate.name ?? "",
        displayName: candidate.display_name ?? "",
        category: candidate.category ?? "",
        type: candidate.type ?? "",
        coordinates: [Number(candidate.lat), Number(candidate.lon)],
        score: scoreCandidate(stop, candidate),
      })),
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const recommended = flattenedCandidates[0];
  const confidence =
    recommended &&
    suggestedConfidence(recommended.score, {
      category: recommended.category,
      type: recommended.type,
    });

  return {
    stopId: stop.id,
    label: stop.label,
    labelEn: stop.labelEn,
    labelBn: stop.labelBn,
    routeCount: stop.routeCount,
    queries,
    candidates: flattenedCandidates,
    recommended:
      recommended && confidence
        ? {
            labels: dedupe([stop.labelEn, stop.label, stop.labelBn ?? ""]),
            coordinates: recommended.coordinates,
            source: `photon:${recommended.query}`,
            confidence,
            matchScore: recommended.score,
            placeName: recommended.name,
            displayName: recommended.displayName,
          }
        : null,
    status: "suggested",
  };
}

async function generateSuggestions({ limit, output, sleepMs }) {
  const dataset = await readJson(DATASET_PATH);
  const overrides = await readJson(OVERRIDES_PATH);
  const coveredLabels = buildOverrideCoverageSet(overrides);
  const missingStops = dataset.stops
    .filter(
      (stop) =>
        !coveredLabels.has(normalizeText(stop.label)) &&
        !coveredLabels.has(normalizeText(stop.labelEn)) &&
        (!stop.labelBn || !coveredLabels.has(normalizeText(stop.labelBn))),
    )
    .sort((a, b) => b.routeCount - a.routeCount)
    .slice(0, limit);

  const suggestions = [];

  for (const stop of missingStops) {
    const queries = buildQueries(stop);
    const candidateGroups = [];

    for (const query of queries) {
      const candidates = await searchPhoton(query);
      candidateGroups.push({ query, candidates });

      const highConfidenceHit = candidates.some((candidate) => {
        const score = scoreCandidate(stop, candidate);
        return suggestedConfidence(score, candidate) === "verified";
      });

      await sleep(sleepMs);

      if (highConfidenceHit) {
        break;
      }
    }

    suggestions.push(buildSuggestionEntry(stop, queries, candidateGroups));
  }

  const payload = {
    generatedAt: new Date().toISOString(),
    provider: "photon",
    limit,
    suggestions,
  };

  await writeJson(output, payload);
  console.log(`Wrote ${suggestions.length} bus stop coordinate suggestions to ${output}`);
}

function mergeOverride(existingOverrides, approvedSuggestions) {
  const overridesByKey = new Map(
    existingOverrides.map((override) => [normalizeText(override.labels[0] ?? ""), override]),
  );

  for (const suggestion of approvedSuggestions) {
    const recommended = suggestion.recommended;

    if (!recommended) {
      continue;
    }

    const primaryKey = normalizeText(recommended.labels[0] ?? suggestion.labelEn);
    overridesByKey.set(primaryKey, {
      labels: recommended.labels,
      coordinates: recommended.coordinates,
      source: recommended.source,
      confidence: recommended.confidence === "verified" ? "verified" : "approximate",
      address: recommended.displayName,
    });
  }

  return Array.from(overridesByKey.values()).sort((a, b) =>
    (a.labels[0] ?? "").localeCompare(b.labels[0] ?? ""),
  );
}

function buildRuntimeMetadataEntries(overrides, suggestionPayload) {
  const metadataByKey = new Map(
    overrides.map((override) => [
      normalizeText(override.labels[0] ?? ""),
      {
        labels: override.labels,
        coordinates: override.coordinates,
        source: override.source,
        address: override.address,
        placeName: derivePlaceName(override.address),
      },
    ]),
  );

  const approvedSuggestions = (suggestionPayload.suggestions ?? []).filter(
    (suggestion) => suggestion.status === "approved" && suggestion.recommended,
  );

  for (const suggestion of approvedSuggestions) {
    const recommended = suggestion.recommended;
    const primaryKey = normalizeText(recommended.labels[0] ?? suggestion.labelEn);
    const existingEntry = metadataByKey.get(primaryKey);

    metadataByKey.set(primaryKey, {
      labels: recommended.labels,
      coordinates: existingEntry?.coordinates ?? recommended.coordinates,
      source: existingEntry?.source ?? recommended.source,
      address: recommended.displayName ?? existingEntry?.address,
      placeName:
        recommended.placeName ??
        existingEntry?.placeName ??
        derivePlaceName(recommended.displayName),
    });
  }

  return Array.from(metadataByKey.values()).sort((a, b) =>
    (a.labels[0] ?? "").localeCompare(b.labels[0] ?? ""),
  );
}

function selectVariantCluster(candidates, anchorCoordinates) {
  if (!candidates.length) {
    return [];
  }

  if (anchorCoordinates) {
    return candidates.filter(
      (candidate) => haversineDistanceKm(candidate.coordinates, anchorCoordinates) <= 0.35,
    );
  }

  let bestCluster = [];
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    const cluster = candidates.filter(
      (other) => haversineDistanceKm(candidate.coordinates, other.coordinates) <= 0.35,
    );
    const clusterScore = cluster.reduce((sum, item) => sum + item.score, 0);

    if (
      cluster.length > bestCluster.length ||
      (cluster.length === bestCluster.length && clusterScore > bestScore)
    ) {
      bestCluster = cluster;
      bestScore = clusterScore;
    }
  }

  return bestCluster;
}

function dedupeVariantCandidates(candidates) {
  const unique = [];

  for (const candidate of candidates) {
    const normalizedDisplayName = normalizeText(candidate.displayName ?? candidate.name ?? "");
    const duplicate = unique.some((entry) => {
      const sameName =
        normalizeText(entry.displayName ?? entry.name ?? "") === normalizedDisplayName;
      const nearSamePoint =
        haversineDistanceKm(entry.coordinates, candidate.coordinates) <= 0.04;

      return sameName || nearSamePoint;
    });

    if (!duplicate) {
      unique.push(candidate);
    }
  }

  return unique;
}

function buildRuntimeVariantEntries(suggestionPayload) {
  const suggestions = suggestionPayload.suggestions ?? [];
  const variantEntries = [];

  for (const suggestion of suggestions) {
    if (suggestion.status !== "approved") {
      continue;
    }

    const transitCandidates = (suggestion.candidates ?? []).filter(
      (candidate) => isTransitCandidate(candidate) && isDhakaAreaCoordinate(candidate.coordinates),
    );

    if (!transitCandidates.length) {
      continue;
    }

    const clusteredCandidates = selectVariantCluster(
      transitCandidates,
      suggestion.recommended?.coordinates,
    );
    const dedupedCandidates = dedupeVariantCandidates(clusteredCandidates);

    if (!dedupedCandidates.length) {
      continue;
    }

    variantEntries.push({
      labels: dedupe([suggestion.labelEn, suggestion.label, suggestion.labelBn ?? ""]),
      variants: dedupedCandidates.map((candidate) => ({
        name: candidate.name,
        placeName: derivePlaceName(candidate.displayName) ?? candidate.name,
        address: candidate.displayName,
        coordinates: candidate.coordinates,
        source: `photon:${candidate.query}`,
      })),
    });
  }

  return variantEntries.sort((a, b) => (a.labels[0] ?? "").localeCompare(b.labels[0] ?? ""));
}

async function mergeApprovedSuggestions({ output }) {
  const overrides = await readJson(OVERRIDES_PATH);
  const suggestionPayload = await readJson(output);
  const approvedSuggestions = (suggestionPayload.suggestions ?? []).filter(
    (suggestion) => suggestion.status === "approved" && suggestion.recommended,
  );

  const mergedOverrides = mergeOverride(overrides, approvedSuggestions);
  await writeJson(OVERRIDES_PATH, mergedOverrides);
  const runtimeMetadata = buildRuntimeMetadataEntries(mergedOverrides, suggestionPayload);
  await writeJson(METADATA_PATH, runtimeMetadata);
  const runtimeVariants = buildRuntimeVariantEntries(suggestionPayload);
  await writeJson(VARIANTS_PATH, runtimeVariants);

  console.log(`Merged ${approvedSuggestions.length} approved bus stop suggestions into ${OVERRIDES_PATH}`);
  console.log(`Wrote ${runtimeMetadata.length} runtime bus stop metadata entries to ${METADATA_PATH}`);
  console.log(`Wrote ${runtimeVariants.length} runtime bus stop variant entries to ${VARIANTS_PATH}`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.mergeApproved) {
    await mergeApprovedSuggestions(args);
    return;
  }

  await generateSuggestions(args);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
