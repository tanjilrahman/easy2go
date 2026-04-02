import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/lib/data/dhaka-leguna-seed.json",
);

function slugify(value) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "item";
}

function parseCsvLine(line) {
  const values = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];

    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }

      continue;
    }

    if (char === "," && !inQuotes) {
      values.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseCsv(text) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) {
    return [];
  }

  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function createStableIds(labels, prefix) {
  const slugCounts = new Map();
  const idMap = new Map();

  for (const label of labels) {
    const baseSlug = slugify(label);
    const nextCount = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, nextCount);

    idMap.set(
      label,
      nextCount === 1 ? `${prefix}-${baseSlug}` : `${prefix}-${baseSlug}-${nextCount}`,
    );
  }

  return idMap;
}

function parseFare(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildDataset(rows, sourceName) {
  const routes = rows.map((row, index) => {
    const stopLabels = row.all_stoppages
      .split("|")
      .map((value) => value.trim())
      .filter(Boolean);

    return {
      id: [
        "leguna",
        slugify(row.origin),
        "to",
        slugify(row.destination),
        index,
      ].join("-"),
      origin: row.origin.trim(),
      destination: row.destination.trim(),
      via: row.via.trim() || null,
      stopLabels,
      stopCount: stopLabels.length,
      reportedFareBdt: parseFare(row.reported_fare_bdt),
      confidence: row.confidence.trim().toLowerCase(),
      evidenceType: row.evidence_type.trim().toLowerCase(),
    };
  });

  const uniqueStopLabels = [];
  const seenStops = new Set();

  for (const route of routes) {
    for (const label of route.stopLabels) {
      if (!seenStops.has(label)) {
        seenStops.add(label);
        uniqueStopLabels.push(label);
      }
    }
  }

  const stopIds = createStableIds(uniqueStopLabels, "leguna-stop");

  const normalizedRoutes = routes.map((route) => ({
    ...route,
    stopIds: route.stopLabels.map((label) => stopIds.get(label)),
  }));

  const stops = uniqueStopLabels.map((label) => {
    const routeIds = normalizedRoutes
      .filter((route) => route.stopLabels.includes(label))
      .map((route) => route.id);

    return {
      id: stopIds.get(label),
      label,
      slug: slugify(label),
      routeIds,
      routeCount: routeIds.length,
    };
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      name: sourceName,
      retrievedAt: new Date().toISOString(),
      license: "user_supplied_reference_only",
      notes: [
        "Built from a user-supplied CSV of Dhaka leguna corridors and ordered stoppages.",
        "Only the columns needed for routing and fare/advisory display are retained.",
        "Leguna remains an informal mode, so reported fares and corridors should be treated as variable.",
      ],
    },
    summary: {
      routeCount: normalizedRoutes.length,
      stopCount: stops.length,
    },
    stops,
    routes: normalizedRoutes,
  };
}

async function main() {
  const inputPath = process.argv[2];

  if (!inputPath) {
    throw new Error("Usage: node scripts/build-dhaka-leguna-seed.mjs <path-to-csv>");
  }

  const csvText = await readFile(resolve(inputPath), "utf8");
  const rows = parseCsv(csvText);

  if (rows.length === 0) {
    throw new Error("The input CSV was empty or could not be parsed.");
  }

  const dataset = buildDataset(rows, basename(inputPath));

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");

  console.log(
    `Wrote ${dataset.summary.routeCount} leguna routes and ${dataset.summary.stopCount} stops to ${OUTPUT_PATH}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
