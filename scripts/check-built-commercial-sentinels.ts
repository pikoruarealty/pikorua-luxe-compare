import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";

const root = ".output/public";
const sentinels = (process.env.COMMERCIAL_SENTINEL_VALUES ?? "918273645,564738291")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const hits: string[] = [];

async function scan(directory: string): Promise<void> {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    if (!entry.isFile()) continue;
    const text = (await readFile(path)).toString("utf8");
    for (const sentinel of sentinels) {
      if (text.includes(sentinel)) hits.push(`${relative(root, path)} contains ${sentinel}`);
    }
  }
}

await scan(root);
if (hits.length)
  throw new Error(`Commercial sentinel leaked into public build:\n${hits.join("\n")}`);
console.log(`Public build contains none of ${sentinels.length} commercial sentinels`);
