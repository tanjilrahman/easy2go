import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DATASET_PATH = resolve(ROOT_DIR, "src/lib/data/dhaka-bus-seed.json");
const OUTPUT_PATH = resolve(ROOT_DIR, "src/lib/data/dhaka-bus-stop-coordinate-candidates.json");
const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const DHAKA_BOUNDS = {
  south: 23.55,
  west: 90.15,
  north: 24.05,
  east: 90.65,
};

function parseArgs(argv) {
  const args = {
    limit: Number.POSITIVE_INFINITY,
    minScore: 35,
    output: OUTPUT_PATH,
    overpassUrl: OVERPASS_URL,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (argument === "--help" || argument === "-h") {
      args.help = true;
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

    if (argument.startsWith("--min-score=")) {
      args.minScore = Number(argument.slice("--min-score=".length));
      continue;
    }

    if (argument === "--min-score") {
      args.minScore = Number(argv[index + 1] ?? args.minScore);
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

    if (argument.startsWith("--overpass-url=")) {
      args.overpassUrl = argument.slice("--overpass-url=".length);
      continue;
    }

    if (argument === "--overpass-url") {
      args.overpassUrl = argv[index + 1] ?? args.overpassUrl;
      index += 1;
    }
  }

  return args;
}

function printHelp() {
  console.log(`Build reviewable bus stop coordinate candidates from dhaka-bus-seed.json.

Usage:
  node scripts/build-bus-stop-coordinate-candidates.mjs [options]

Options:
  --limit <n>             Only process the first n seed stops after route-count sorting.
  --min-score <n>         Minimum candidate score to keep. Default: 35.
  --output <path>         Output JSON path. Default: src/lib/data/dhaka-bus-stop-coordinate-candidates.json.
  --overpass-url <url>    Overpass API endpoint. Default: ${OVERPASS_URL}.
`);
}

function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, " ")
    .trim();
}

function tokenizeText(value) {
  return normalizeText(value).split(" ").filter(Boolean);
}

function significantTokens(value) {
  const ignored = new Set([
    "bus",
    "stop",
    "stand",
    "station",
    "stoppage",
    "বাস",
    "স্টপ",
    "স্ট্যান্ড",
    "স্টেশন",
    "ষ্টপ",
    "ষ্ট্যান্ড",
    "ষ্টেশন",
  ]);

  return tokenizeText(value).filter((token) => {
    if (ignored.has(token) || /^\p{N}+$/u.test(token)) {
      return false;
    }

    return token.length >= 3 || /[\p{Script=Bengali}]/u.test(token);
  });
}

function dedupe(values) {
  return Array.from(new Set(values.filter(Boolean)));
}

function splitLocalizedLabel(label) {
  const match = label.match(/^(.*)\s+\(([\p{Script=Bengali}].*)\)$/u);

  if (!match) {
    return {
      label,
      labelEn: label,
      labelBn: null,
    };
  }

  return {
    label,
    labelEn: match[1].trim(),
    labelBn: match[2].trim(),
  };
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

function buildOverpassQuery() {
  const { south, west, north, east } = DHAKA_BOUNDS;
  const bounds = `${south},${west},${north},${east}`;

  return `[out:json][timeout:60];
(
  node["highway"="bus_stop"](${bounds});
  way["highway"="bus_stop"](${bounds});
  relation["highway"="bus_stop"](${bounds});
  node["amenity"="bus_station"](${bounds});
  way["amenity"="bus_station"](${bounds});
  relation["amenity"="bus_station"](${bounds});
  node["public_transport"~"platform|station|stop_position"](${bounds});
  way["public_transport"~"platform|station|stop_position"](${bounds});
  relation["public_transport"~"platform|station|stop_position"](${bounds});
);
out center tags;`;
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function fetchOverpassTransitObjects(overpassUrl) {
  const response = await fetch(overpassUrl, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
      "user-agent": "easy2go-bus-stop-coordinate-candidates/1.0",
    },
    body: new URLSearchParams({ data: buildOverpassQuery() }),
  });

  if (!response.ok) {
    throw new Error(`Overpass lookup failed with status ${response.status}`);
  }

  const payload = await response.json();
  return payload.elements ?? [];
}

function elementCoordinates(element) {
  if (Number.isFinite(element.lat) && Number.isFinite(element.lon)) {
    return [element.lat, element.lon];
  }

  if (Number.isFinite(element.center?.lat) && Number.isFinite(element.center?.lon)) {
    return [element.center.lat, element.center.lon];
  }

  return null;
}

function candidateName(element) {
  const tags = element.tags ?? {};
  return tags.name ?? tags["name:en"] ?? tags["name:bn"] ?? tags.ref ?? "";
}

function candidateAliases(element) {
  const tags = element.tags ?? {};
  return dedupe([
    tags.name,
    tags["name:en"],
    tags["name:bn"],
    tags.alt_name,
    tags.old_name,
    tags.ref,
  ]);
}

function toTransitCandidate(element) {
  const coordinates = elementCoordinates(element);

  if (!coordinates) {
    return null;
  }

  const tags = element.tags ?? {};

  return {
    osmType: element.type,
    osmId: element.id,
    name: candidateName(element),
    aliases: candidateAliases(element),
    coordinates,
    tags: {
      highway: tags.highway,
      amenity: tags.amenity,
      public_transport: tags.public_transport,
      bus: tags.bus,
      operator: tags.operator,
      network: tags.network,
    },
  };
}

function strongestTextScore(stopLabels, candidate) {
  const candidateValues = candidate.aliases.length ? candidate.aliases : [candidate.name];
  let best = 0;
  let bestLabel = "";
  let bestValue = "";

  for (const label of stopLabels) {
    const normalizedLabel = normalizeText(label);
      const labelTokens = significantTokens(label);

    for (const value of candidateValues) {
      const normalizedValue = normalizeText(value);
      const valueTokens = significantTokens(value);
      let score = 0;

      if (!normalizedLabel || !normalizedValue) {
        continue;
      }

      if (normalizedValue === normalizedLabel) {
        score += 80;
      } else if (normalizedValue.startsWith(normalizedLabel)) {
        score += 68;
      } else if (normalizedValue.includes(normalizedLabel)) {
        score += 55;
      } else if (normalizedLabel.includes(normalizedValue) && normalizedValue.length >= 4) {
        score += 35;
      }

      const overlap = labelTokens.filter((token) => valueTokens.includes(token)).length;
      score += overlap * 14;

      if (score > best) {
        best = score;
        bestLabel = label;
        bestValue = value;
      }
    }
  }

  return { score: best, matchedLabel: bestLabel, matchedValue: bestValue };
}

function transitTagScore(candidate) {
  const tags = candidate.tags;

  if (tags.highway === "bus_stop") {
    return 25;
  }

  if (tags.amenity === "bus_station") {
    return 20;
  }

  if (tags.public_transport === "platform" || tags.public_transport === "stop_position") {
    return 15;
  }

  if (tags.public_transport === "station") {
    return 12;
  }

  return 0;
}

function confidenceFromScore(score) {
  if (score >= 90) {
    return "strong_candidate";
  }

  if (score >= 65) {
    return "candidate";
  }

  return "weak_candidate";
}

function buildStopLabels(stop) {
  const localized = splitLocalizedLabel(stop.label);
  return dedupe([stop.labelEn, stop.labelBn, localized.labelEn, localized.labelBn]);
}

function scoreCandidatesForStop(stop, transitCandidates, minScore) {
  const stopLabels = buildStopLabels(stop);
  const scored = transitCandidates
    .map((candidate) => {
      const text = strongestTextScore(stopLabels, candidate);
      const score = text.score + transitTagScore(candidate);

      return {
        osmType: candidate.osmType,
        osmId: candidate.osmId,
        name: candidate.name,
        aliases: candidate.aliases,
        coordinates: candidate.coordinates,
        score,
        confidence: confidenceFromScore(score),
        matchedLabel: text.matchedLabel,
        matchedValue: text.matchedValue,
        source: `osm:${candidate.osmType}/${candidate.osmId}`,
        tags: candidate.tags,
      };
    })
    .filter((candidate) => candidate.score >= minScore && candidate.matchedLabel)
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
    .slice(0, 8);

  return scored.map((candidate, index) => ({
    ...candidate,
    recommended: index === 0 && candidate.confidence !== "weak_candidate",
  }));
}

function sortStopsForReview(stops) {
  return [...stops].sort((a, b) => b.routeCount - a.routeCount || a.labelEn.localeCompare(b.labelEn));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (!Number.isFinite(args.limit) && args.limit !== Number.POSITIVE_INFINITY) {
    throw new Error("--limit must be a number.");
  }

  const dataset = await readJson(DATASET_PATH);
  const stops = sortStopsForReview(dataset.stops).slice(0, args.limit);

  if (stops.length === 0) {
    await writeJson(args.output, {
      generatedAt: new Date().toISOString(),
      sourceDataset: "src/lib/data/dhaka-bus-seed.json",
      provider: "openstreetmap-overpass",
      bounds: DHAKA_BOUNDS,
      minScore: args.minScore,
      candidates: [],
    });
    console.log(`Wrote 0 bus stop coordinate candidates to ${args.output}`);
    return;
  }

  const elements = await fetchOverpassTransitObjects(args.overpassUrl);
  const transitCandidates = elements.map(toTransitCandidate).filter(Boolean);
  const candidates = stops.map((stop) => ({
    stopId: stop.id,
    label: stop.label,
    labelEn: stop.labelEn,
    labelBn: stop.labelBn,
    routeCount: stop.routeCount,
    status: "needs_review",
    candidates: scoreCandidatesForStop(stop, transitCandidates, args.minScore),
  }));

  await writeJson(args.output, {
    generatedAt: new Date().toISOString(),
    sourceDataset: "src/lib/data/dhaka-bus-seed.json",
    provider: "openstreetmap-overpass",
    bounds: DHAKA_BOUNDS,
    minScore: args.minScore,
    transitObjectCount: transitCandidates.length,
    candidates,
  });

  const matchedCount = candidates.filter((entry) => entry.candidates.length > 0).length;
  console.log(
    `Wrote ${candidates.length} bus stop entries to ${args.output}; ${matchedCount} have OSM candidates.`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
