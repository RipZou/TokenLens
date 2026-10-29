import { readdirSync, readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const ORDER = [
  "system",
  "tool_definitions",
  "history",
  "tool_results",
  "retrieval",
  "user_input",
  "attachments",
  "overhead",
];

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixtureDir = join(root, "fixtures", "anthropic");

function loadFixtures() {
  return readdirSync(fixtureDir)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .map((name) => {
      const fixture = JSON.parse(readFileSync(join(fixtureDir, name), "utf8"));
      return { name: name.replace(/\.json$/, ""), ...fixture };
    });
}

function numericCounts(output) {
  const source = output?.input ?? output?.categories ?? output?.breakdown ?? output;
  if (!source || typeof source !== "object") return null;
  const counts = {};
  for (const key of ORDER) {
    if (typeof source[key] !== "number" || !Number.isInteger(source[key])) return null;
    counts[key] = source[key];
  }
  return counts;
}

function scoreOutputs(fixtures, rows) {
  const cases = rows.map((row) => {
    const expected = row.expected;
    const counts = numericCounts(row.output);
    const estimated = Boolean(row.output?.estimated ?? row.output?.input?.estimated);
    const mismatches = [];
    if (row.error) mismatches.push(`error: ${row.error}`);
    if (!counts) mismatches.push("missing integer counts for the eight input categories");
    else {
      for (const key of ORDER) {
        if (counts[key] !== expected[key]) mismatches.push(`${key}: got ${counts[key]}, expected ${expected[key]}`);
      }
      if (estimated !== expected.estimated) mismatches.push(`estimated: got ${estimated}, expected ${expected.estimated}`);
      const sum = ORDER.reduce((total, key) => total + counts[key], 0);
      row.sum = sum;
      row.invariant = sum === row.input_tokens;
      if (!row.invariant) mismatches.push(`sum ${sum} !== input_tokens ${row.input_tokens}`);
    }
    const retrievalFixture = expected.retrieval > 0;
    const retrievalOk = !retrievalFixture || (counts?.retrieval === expected.retrieval);
    return {
      name: row.name,
      pass: mismatches.length === 0,
      invariant: row.invariant ?? false,
      retrievalOk,
      mismatches,
      got: counts,
      estimated: counts ? estimated : null,
    };
  });
  const passed = cases.filter((item) => item.pass).length;
  const scored = cases.filter((item) => item.got);
  const retrievalCases = cases.filter((item) => fixtures.find((fx) => fx.name === item.name).expected.retrieval > 0);
  return {
    total: cases.length,
    passed,
    passRate: cases.length ? passed / cases.length : 0,
    invariantHolds: scored.length > 0 && scored.every((item) => item.invariant),
    retrievalHonored: retrievalCases.length > 0 && retrievalCases.every((item) => item.retrievalOk),
    cases,
  };
}

function checkFixtures(fixtures) {
  const problems = [];
  for (const fixture of fixtures) {
    const sum = ORDER.reduce((total, key) => total + fixture.expected[key], 0);
    if (sum !== fixture.usage.input_tokens) problems.push(`${fixture.name} expected sum ${sum} !== ${fixture.usage.input_tokens}`);
  }
  return problems;
}

function runClassifier(classifierPath, fixtures) {
  const absolute = resolve(classifierPath);
  const dir = mkdtempSync(join(tmpdir(), "tokenlens-score-"));
  const runnerPath = join(dir, "runner.ts");
  const payloadPath = join(dir, "fixtures.json");
  writeFileSync(payloadPath, JSON.stringify(fixtures));
  writeFileSync(runnerPath, `
    import { readFileSync } from "node:fs";
    import { classify } from ${JSON.stringify(pathToFileURL(absolute).href)};
    const fixtures = JSON.parse(readFileSync(${JSON.stringify(payloadPath)}, "utf8"));
    function wordCount(text: string): number {
      if (typeof text !== "string") return 0;
      const trimmed = text.trim();
      return trimmed ? trimmed.split(/\\s+/).length : 0;
    }
    const rows = [];
    for (const fixture of fixtures) {
      let output = null;
      let error = null;
      try {
        output = classify(fixture.request, fixture.usage, "anthropic", wordCount);
      } catch (first) {
        try {
          output = classify(fixture.request, fixture.usage);
        } catch (second) {
          error = second instanceof Error ? second.message : String(second);
        }
      }
      rows.push({ name: fixture.name, output, error, expected: fixture.expected, input_tokens: fixture.usage.input_tokens });
    }
    console.log(JSON.stringify(rows));
  `);
  const executed = spawnSync("npx", ["--yes", "tsx", runnerPath], { encoding: "utf8", cwd: root });
  rmSync(dir, { recursive: true, force: true });
  if (executed.status !== 0) {
    return { runnerError: (executed.stderr || executed.stdout || "classifier runner failed").trim() };
  }
  const line = executed.stdout.trim().split("\n").filter(Boolean).at(-1);
  return { rows: JSON.parse(line) };
}

const fixtures = loadFixtures();
const fixtureProblems = checkFixtures(fixtures);
if (fixtureProblems.length) {
  console.error(fixtureProblems.join("\n"));
  process.exit(1);
}

const classifierPath = process.argv[2];
if (!classifierPath || classifierPath === "--check-fixtures") {
  console.log(JSON.stringify({ fixtures: fixtures.length, fixtureCheck: "ok" }, null, 2));
  process.exit(0);
}

const run = runClassifier(classifierPath, fixtures);
if (run.runnerError) {
  console.log(JSON.stringify({
    classifierPath,
    passed: 0,
    total: fixtures.length,
    passRate: 0,
    invariantHolds: false,
    retrievalHonored: false,
    runnerError: run.runnerError,
    cases: [],
  }, null, 2));
  process.exit(2);
}

const report = scoreOutputs(fixtures, run.rows);
console.log(JSON.stringify({ classifierPath, ...report }, null, 2));
process.exit(report.passed === report.total ? 0 : 2);
