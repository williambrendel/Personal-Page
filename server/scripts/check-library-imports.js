/**
 * Does every stack-library import this repo uses still resolve?
 *
 *   npm --prefix server run check-imports
 *
 * Free, no model calls, no network. Exits non-zero if anything fails.
 *
 * Why this exists: this server reaches into @williambrendel/llms by file
 * path — `@williambrendel/llms/src/VectorStore/index.js` and 50-odd more —
 * which worked because that package had no `exports` map, so every file was
 * reachable. The moment a library adds one, every path not listed in it
 * stops resolving. @williambrendel/utils already has a map, and guessing
 * wrong there fails with ERR_PACKAGE_PATH_NOT_EXPORTED, which says nothing
 * about which form to use instead.
 *
 * A broken import is not subtle at runtime, but it is invisible until the
 * code path runs: most of these live in scripts that nobody executes on a
 * deploy, so `npm run ingest` or `tune-floor` would be the thing that
 * discovered it, weeks later. This checks all of them in a second.
 *
 * It discovers the specifiers by reading the source rather than listing
 * them, so it cannot drift out of date as imports are added or rewritten to
 * the shorter subpath form.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const SCOPE = "@williambrendel/";

/**
 * Specifiers the source does not state literally, so a scan cannot find
 * them. Both are prompt files opened through `import.meta.resolve`, and they
 * are the most fragile thing here: a `.ppl` is not JavaScript, so an
 * `exports` map that lists only module directories would drop it.
 */
const COMPUTED = [
  "@williambrendel/llms/src/pipelines/rag/prompts/follow-up-questions.ppl",
  "@williambrendel/llms/src/pipelines/rag/prompts/follow-up-answers.ppl",
];

const sourceFiles = (dir, found = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) sourceFiles(full, found);
    else if (entry.isFile() && entry.name.endsWith(".js")) found.push(full);
  }
  return found;
};

// Any quoted string starting with the scope: static imports, dynamic
// imports and import.meta.resolve arguments all look the same here, which
// is the point. A template literal with a ${} hole is skipped — those are
// the COMPUTED ones above.
const scanned = new Map();
for (const file of sourceFiles(SERVER_DIR)) {
  const src = fs.readFileSync(file, "utf8");
  for (const m of src.matchAll(/["'`](@williambrendel\/[^"'`$]+)["'`]/g)) {
    if (!scanned.has(m[1])) scanned.set(m[1], []);
    scanned.get(m[1]).push(path.relative(SERVER_DIR, file));
  }
}

for (const spec of COMPUTED) {
  if (!scanned.has(spec)) scanned.set(spec, ["(computed at run time)"]);
}

const specifiers = [...scanned.keys()].sort();
const failures = [];

for (const spec of specifiers) {
  try {
    const resolved = fileURLToPath(import.meta.resolve(spec));
    if (!fs.existsSync(resolved)) {
      failures.push({ spec, why: "resolved to a path that does not exist", resolved });
    }
  } catch (err) {
    failures.push({ spec, why: err.code || err.message });
  }
}

// Record the resolved versions beside the count: a dependency measurement is
// only true for the registry state it was taken in, and these libraries
// publish several times a day. A number without its versions is a number
// that will mislead someone next week.
const lock = JSON.parse(fs.readFileSync(path.join(SERVER_DIR, "package-lock.json"), "utf8"));
const entries = Object.entries(lock.packages || {}).filter(([p]) => p);
const installed = entries
  .filter(([p]) => p.includes(`node_modules/${SCOPE}`))
  .map(([p, v]) => [p.slice(p.indexOf(SCOPE)), v.version])
  .sort(([a], [b]) => a.localeCompare(b));

// Two counts, both true, and quoting the wrong one starts an argument.
// The lockfile carries every platform's native binaries; only this
// platform's are ever installed, which is why `npm install` reports a
// smaller number than the lockfile holds.
const total    = entries.length;
const optional = entries.filter(([, v]) => v.optional).length;

console.log(`\n${specifiers.length} stack-library specifiers across ${new Set([...scanned.values()].flat()).size} files\n`);
for (const [name, version] of installed) console.log(`  ${name.padEnd(30)} ${version}`);
console.log(`\n  ${total} entries in the lockfile`);
console.log(`  ${total - optional} of them required, ${optional} optional (per-platform native binaries)`);
console.log(`  so roughly ${total - optional} plus this platform's share actually install — npm reports ~126`);

if (failures.length) {
  console.log(`\n${failures.length} FAILED TO RESOLVE:\n`);
  for (const f of failures) {
    console.log(`  ${f.spec}`);
    console.log(`      ${f.why}${f.resolved ? ` (${f.resolved})` : ""}`);
    for (const where of scanned.get(f.spec)) console.log(`      used by ${where}`);
  }
  console.log("\nIf this is ERR_PACKAGE_PATH_NOT_EXPORTED, the package added an");
  console.log("exports map that does not list this path. Check its package.json");
  console.log("`exports` for the subpath to use instead, and report the gap to");
  console.log("the Libraries session rather than vendoring a copy.\n");
  process.exitCode = 1;
} else {
  console.log("\n  every specifier resolves\n");
}
