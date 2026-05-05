import { fromRoot, parsePathArgs, readJson, writeJson } from "./script-utils.mjs";

const INPUT_PATH = fromRoot("src/lib/data/dhaka-bus-stop-approved-coordinates.json");
const OUTPUT_PATH = fromRoot("src/lib/data/dhaka-bus-stop-reviewed-metadata.json");

function parseArgs(argv) {
  return parsePathArgs(argv, {
    input: INPUT_PATH,
    output: OUTPUT_PATH,
  });
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
