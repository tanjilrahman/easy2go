import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const INPUT_PATH = resolve(ROOT_DIR, "src/lib/data/dhaka-bus-stop-approved-coordinates.json");
const OUTPUT_PATH = resolve(ROOT_DIR, "src/lib/data/dhaka-bus-stop-reviewed-metadata.json");

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const approvedCoordinates = await readJson(args.input);
  const metadata = approvedCoordinates.approvedCoordinates.map((entry) => ({
    labels: entry.labels,
    placeName: entry.placeName,
    address: entry.address,
    coordinates: entry.coordinates,
    source: entry.source,
    confidence: entry.confidence,
  }));

  await writeJson(args.output, metadata);
  console.log(`Wrote ${metadata.length} reviewed bus stop metadata entries to ${args.output}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
