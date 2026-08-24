import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const sourceRoot = join(__dirname, "..", "src");
const indicatorWriteTables = [
  "indicator_values",
  "indicator_month_projections",
  "indicator_month_targets"
];
const drilldownTerms = [
  "drilldown",
  "drill-down",
  "drill down",
  "commercial_drilldown",
  "marketing_drilldown",
  "financial_drilldown"
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) return sourceFiles(path);
    if (/\.(ts|tsx)$/.test(entry)) return [path];
    return [];
  });
}

describe("Drill Down boundary", () => {
  it("keeps Drill Down code from writing Dashboard indicator value tables", () => {
    const violations = sourceFiles(sourceRoot).flatMap((path) => {
      const content = readFileSync(path, "utf8").toLowerCase();
      const relativePath = relative(sourceRoot, path).toLowerCase();
      const mentionsDrilldown = relativePath.includes("drilldown") || drilldownTerms.some((term) => content.includes(`class ${term}`));
      const writesIndicatorTables = indicatorWriteTables.some((table) => content.includes(table));
      return mentionsDrilldown && writesIndicatorTables ? [relativePath] : [];
    });

    expect(violations).toEqual([]);
  });
});
