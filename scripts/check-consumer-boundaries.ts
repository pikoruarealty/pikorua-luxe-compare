import { readdir, readFile } from "node:fs/promises";
import { extname, join, relative } from "node:path";

const roots = ["src/components", "src/routes", "src/stores"];
const forbidden = [
  "@/db/",
  "@/repositories/",
  "@/domain/private-pricing.server",
  "@/domain/recommendation",
  "baseSalePriceRupees",
  "privateLowerBoundRupees",
  "privateUpperBoundRupees",
  "rateRupeesPerSqFt",
];
const failures: string[] = [];

async function scan(directory: string): Promise<void> {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) await scan(path);
    if (!entry.isFile() || ![".ts", ".tsx"].includes(extname(entry.name))) continue;
    const source = await readFile(path, "utf8");
    for (const token of forbidden) {
      if (source.includes(token)) failures.push(`${relative(".", path)} contains ${token}`);
    }
  }
}

for (const root of roots) await scan(root);
if (failures.length) {
  throw new Error(`Consumer/private boundary violation:\n${failures.join("\n")}`);
}
console.log("Consumer source boundary check passed");
