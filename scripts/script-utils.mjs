import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export function fromRoot(...segments) {
  return resolve(ROOT_DIR, ...segments);
}

export function parsePathArgs(argv, defaults, pathKeys = Object.keys(defaults)) {
  const args = { ...defaults };
  const pathKeySet = new Set(pathKeys);

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    for (const key of pathKeySet) {
      if (argument.startsWith(`--${key}=`)) {
        args[key] = fromRoot(argument.slice(key.length + 3));
        break;
      }

      if (argument === `--${key}`) {
        args[key] = fromRoot(argv[index + 1] ?? args[key]);
        index += 1;
        break;
      }
    }
  }

  return args;
}

export async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function readOptionalJson(path, fallback) {
  try {
    return await readJson(path);
  } catch (error) {
    if (error?.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function splitLocalizedLabel(label) {
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

function topCandidateSummary(stop) {
  const candidate = stop.candidates[0];

  if (!candidate) {
    return null;
  }

  return {
    name: candidate.name,
    coordinates: candidate.coordinates,
    score: candidate.score,
    confidence: candidate.confidence,
    source: candidate.source,
  };
}

export function unresolvedStopSummary(stop) {
  return {
    stopId: stop.stopId,
    label: stop.label,
    labelEn: stop.labelEn,
    labelBn: stop.labelBn,
    routeCount: stop.routeCount,
    status: stop.status,
    reviewReason: stop.reviewReason,
    topCandidate: topCandidateSummary(stop),
  };
}
