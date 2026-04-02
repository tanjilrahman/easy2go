import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL = "https://bus.grelts.com/routes/";
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../src/lib/data/dhaka-bus-seed.json",
);

const ROUTE_MATCHER =
  /\{\\\"route\\\":\{\\\"bus_name\\\":.*?\},\\\"index\\\":\d+\}/g;

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

function slugify(value) {
  const slug = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return slug || "item";
}

function extractTime(value) {
  const match = value.match(/(\d{2}:\d{2})/);
  return match?.[1] ?? null;
}

function parseEmbeddedRoutes(html) {
  return [...html.matchAll(ROUTE_MATCHER)].map((match) =>
    JSON.parse(match[0].replace(/\\"/g, '"')),
  );
}

function createStableIds(labels, prefix) {
  const slugCounts = new Map();
  const idMap = new Map();

  for (const label of labels) {
    const { labelEn } = splitLocalizedLabel(label);
    const baseSlug = slugify(labelEn);
    const nextCount = (slugCounts.get(baseSlug) ?? 0) + 1;
    slugCounts.set(baseSlug, nextCount);

    idMap.set(
      label,
      nextCount === 1 ? `${prefix}-${baseSlug}` : `${prefix}-${baseSlug}-${nextCount}`,
    );
  }

  return idMap;
}

async function fetchSourceHtml() {
  const response = await fetch(SOURCE_URL, {
    headers: {
      "user-agent": "easy2go-dataset-builder/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch ${SOURCE_URL}: ${response.status}`);
  }

  return response.text();
}

function buildDataset(routeRecords, retrievedAt) {
  const uniqueBusLabels = [];
  const seenBusLabels = new Set();
  const uniqueStopLabels = [];
  const seenStopLabels = new Set();

  for (const record of routeRecords) {
    if (!seenBusLabels.has(record.route.bus_name)) {
      uniqueBusLabels.push(record.route.bus_name);
      seenBusLabels.add(record.route.bus_name);
    }

    for (const stopLabel of record.route.stops) {
      if (!seenStopLabels.has(stopLabel)) {
        uniqueStopLabels.push(stopLabel);
        seenStopLabels.add(stopLabel);
      }
    }
  }

  const busIds = createStableIds(uniqueBusLabels, "bus");
  const stopIds = createStableIds(uniqueStopLabels, "stop");

  const routes = routeRecords.map((record) => {
    const bus = splitLocalizedLabel(record.route.bus_name);
    const start = splitLocalizedLabel(record.route.start);
    const end = splitLocalizedLabel(record.route.end);
    const routeId = [
      "route",
      slugify(bus.labelEn),
      slugify(start.labelEn),
      "to",
      slugify(end.labelEn),
      record.index,
    ].join("-");

    return {
      id: routeId,
      sourceIndex: record.index,
      busId: busIds.get(record.route.bus_name),
      busLabel: record.route.bus_name,
      busLabelEn: bus.labelEn,
      busLabelBn: bus.labelBn,
      startStopId: stopIds.get(record.route.start),
      endStopId: stopIds.get(record.route.end),
      startLabel: record.route.start,
      endLabel: record.route.end,
      stopIds: record.route.stops.map((stopLabel) => stopIds.get(stopLabel)),
      stopLabels: record.route.stops,
      stopCount: record.route.stops.length,
      serviceType: record.route.seating_service_type,
      openingTimeText: record.route.starting_time,
      openingTime24h: extractTime(record.route.starting_time),
      closingTimeText: record.route.closing_time,
      closingTime24h: extractTime(record.route.closing_time),
    };
  });

  const buses = uniqueBusLabels.map((label) => {
    const localized = splitLocalizedLabel(label);
    const routeIds = routes
      .filter((route) => route.busLabel === label)
      .map((route) => route.id);

    return {
      id: busIds.get(label),
      label,
      labelEn: localized.labelEn,
      labelBn: localized.labelBn,
      routeIds,
      routeCount: routeIds.length,
    };
  });

  const stops = uniqueStopLabels.map((label) => {
    const localized = splitLocalizedLabel(label);
    const routeIds = routes
      .filter((route) => route.stopLabels.includes(label))
      .map((route) => route.id);

    return {
      id: stopIds.get(label),
      label,
      labelEn: localized.labelEn,
      labelBn: localized.labelBn,
      slug: slugify(localized.labelEn),
      routeIds,
      routeCount: routeIds.length,
    };
  });

  return {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: {
      name: "Dhaka Bus Finder",
      url: SOURCE_URL,
      retrievedAt,
      license: "all_rights_reserved_reference_only",
      notes: [
        "Extracted from server-rendered route records on bus.grelts.com.",
        "This is a seed dataset for internal normalization and validation, not a licensed public feed.",
        "The source exposes route variants and ordered stop labels, but not verified stop coordinates or route geometry.",
      ],
    },
    summary: {
      routeCount: routes.length,
      busCount: buses.length,
      stopCount: stops.length,
    },
    buses,
    stops,
    routes,
  };
}

async function main() {
  const retrievedAt = new Date().toISOString();
  const html = await fetchSourceHtml();
  const routeRecords = parseEmbeddedRoutes(html);

  if (routeRecords.length === 0) {
    throw new Error("No route records were extracted from the source page.");
  }

  const dataset = buildDataset(routeRecords, retrievedAt);

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(dataset, null, 2)}\n`, "utf8");

  console.log(
    `Wrote ${dataset.summary.routeCount} routes, ${dataset.summary.busCount} buses, and ${dataset.summary.stopCount} stops to ${OUTPUT_PATH}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
