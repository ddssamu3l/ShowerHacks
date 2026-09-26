import { writeFile } from "node:fs/promises";
import { z } from "zod";
import { sessionShapeSchema } from "../packages/contracts/src/session";

const output = new URL("../packages/contracts/session.schema.json", import.meta.url);
await writeFile(output, JSON.stringify(z.toJSONSchema(sessionShapeSchema), null, 2) + "\n");
console.log("Generated packages/contracts/session.schema.json");
