import { readFile, readdir } from "node:fs/promises";
import { sessionSchema } from "../packages/contracts/src/session";

const directory = new URL("../content/sessions/", import.meta.url);
const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
const ids = new Set<string>();
let failed = files.length === 0;
if (failed) console.error("No session JSON files found in content/sessions/.");

for (const file of files) {
  try {
    const session = sessionSchema.parse(JSON.parse(await readFile(new URL(file, directory), "utf8")));
    if (file !== `${session.id}.json`) throw new Error("Filename must equal <session.id>.json.");
    if (ids.has(session.id)) throw new Error(`Duplicate session ID: ${session.id}`);
    ids.add(session.id);
    console.log(`OK ${file}: ${session.turns.length} turns`);
  } catch (error) {
    failed = true;
    console.error(`INVALID ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
process.exitCode = failed ? 1 : 0;
