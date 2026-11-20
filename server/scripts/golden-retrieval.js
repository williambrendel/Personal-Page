/**
 * The retrieval gate: does this corpus still retrieve what it used to?
 *
 *   npm --prefix server run golden            verify (exits non-zero on drift)
 *   npm --prefix server run golden -- --write re-record the expectation
 *
 * Deterministic and free. No model calls, so it is safe to run in `npm test`
 * and safe for an unattended dependency update to depend on.
 *
 * ── What it asserts, and why in this shape ──────────────────────────────
 *
 * Retrieval has two parts worth defending differently.
 *
 * The documents retrieved, and their order, are *structure*: if a query
 * stops finding `career|snap`, something is broken, and no tolerance should
 * hide it. Those are compared exactly.
 *
 * The cosine scores are *continuous*: a newer embedding runtime moves them
 * slightly even when the corpus and the ranking are untouched. Going from
 * llms 2.0.0 to 2.2.1 moved them by up to 0.008 while every ranking held.
 * So scores are compared within a tolerance, and the tolerance is the point
 * of the test rather than an escape from it: SCORE_TOLERANCE is deliberately
 * smaller than the margin between the retrieval floor (0.70) and the lowest
 * score this corpus actually produces, so a drift large enough to change
 * what gets retrieved cannot pass.
 *
 * The off-topic queries are asserted by row count, which is what catches a
 * regression in the other direction: a library change that made retrieval
 * more permissive would start answering "what is 2 + 2?" from the corpus.
 * One row is expected there today — `background|skills` at 0.717, which the
 * gate's 0.755 minScore then rejects. Two would be news.
 *
 * ── On tied scores ─────────────────────────────────────────────────────
 *
 * Some queries come back with every row on the same score — "tell me about
 * a time you failed" returns twelve rows at exactly 0.9200. That is the
 * rerank stage, which rewrites `hit.score` (see the note in coverage.js);
 * rerank now standardizes the candidate pool per dimension, and on this
 * corpus it saturates for a query that matches many sections about equally.
 *
 * It means the ORDER among tied rows is decided by sort stability rather
 * than by score, so in principle a library change could reorder them
 * without changing retrieval quality. Measured stable across repeated runs
 * on a fixed version, so it is asserted exactly: a reorder is worth looking
 * at rather than tolerating silently, and the failure output prints both
 * orders side by side.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import CONFIG from "../config.js";

// AFTER config: config sets XENOVA_CACHE_DIR, which this reads to locate
// the ONNX model cache outside node_modules.
import { ready as runtimeReady } from "@williambrendel/llms/src/xenova/env.js";
import VectorStore     from "@williambrendel/llms/src/VectorStore/index.js";
import SectionResolver from "@williambrendel/llms/src/actions/query/SectionResolver.js";
import buildAnalyze    from "@williambrendel/llms/src/xenova/buildAnalyzeQuery/index.js";
import prewarm         from "@williambrendel/llms/src/xenova/prewarm.js";
import { retrieve }    from "@williambrendel/llms/src/actions/query/index.js";
import { MAX_OUTPUT_ROWS } from "@williambrendel/llms/src/VectorStore/constants.js";

const WRITE = process.argv.includes("--write");
const EXPECTED_PATH = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  "baselines/golden-retrieval.json"
);

/**
 * Loose enough for a runtime change, tight enough to catch a real one.
 *
 * 0.02, and not smaller, for a measured reason. Three sources of harmless
 * score drift are known:
 *
 *   1.8e-5   llms' SIMD kernel rounding the query, on int16 files
 *   2.0e-3   the same, on int8 files (this corpus is int16 — dtype 3)
 *   8.0e-3   the embedding runtime changing: @xenova/transformers 2.17 to
 *            @huggingface/transformers 4.3, going from llms 2.0.0 to 2.2.1,
 *            which moved scores this much with every ranking unchanged
 *
 * The Libraries session proposed 1e-4, which covers the kernel but not the
 * runtime: it would have failed the 2.2.1 upgrade, where nothing about
 * retrieval actually changed. 0.02 clears the largest observed drift with
 * 2.5x margin.
 *
 * It is not the real gate. Rankings are compared exactly, so any reordering
 * fails whatever this is set to, and a row drifting across the 0.70 floor
 * changes the row count, which is also structural. This bounds the one
 * thing structure cannot see: every score moving together. The report prints
 * the largest drift each run, so growth is visible before it matters.
 */
const SCORE_TOLERANCE = 0.02;

/** The same set tune-floor.js calibrates against. `null` must retrieve nothing. */
const GOLDEN = [
  ["what did you do at Snap?",                      "career|snap"],
  ["tell me about iScribeHealth",                   "career|iscribehealth"],
  ["what did you build at Amazon?",                 "career|amazon_a9"],
  ["tell me about your PhD",                        "background|education_and_research"],
  ["how do you handle disagreement with your team?","stories|snap_beauty_score_filter"],
  // These two are the pair that flip in the /query smoke test, where the
  // model chooses which chunk to cite. Retrieval is not where that happens:
  // both documents are retrieved, every run, so the label is safe to assert
  // here even though the HTTP test has to tolerate it.
  ["tell me about a time you failed",               "stories|heali_overbuilt_before_validating"],
  ["how big was your team at Heali?",               "stories|heali_early_team"],
  ["how can I get in touch?",                        "logistics|contact_and_links"],
  ["what are you looking for in a role?",            "logistics|what_im_looking_for"],
  ["why did you leave iScribeHealth?",              "logistics|why_i_left_iscribehealth"],
  ["what's your favorite book?",                     "perspective|influences"],
  ["how do you feel about firing people?",           "perspective|firing_and_accountability"],
  ["what would you do in your first 90 days?",       "perspective|first_90_days"],
  ["thoughts on an 80 hour work week?",              "perspective|work_hours"],
  ["where do you see healthcare AI going?",          "perspective|future_of_healthcare_ai"],
  ["what's the capital of France?",                  null],
  ["write me a poem about cats",                     null],
  ["what is 2 + 2?",                                 null],
  ["what's the weather today?",                      null],
];

const main = async () => {
  await runtimeReady;
  await prewarm(CONFIG.PREWARM);
  const [store, resolver] = await Promise.all([
    VectorStore.create(CONFIG.DATASET),
    SectionResolver.create(CONFIG.MARKDOWNS),
  ]);
  const analyze = await buildAnalyze({ store, ...CONFIG.CLASSIFIER });

  const actual = {};
  for (const [q, mustInclude] of GOLDEN) {
    const analysis = await analyze(q);
    const { results, skipped } = await retrieve({
      analysis,
      store,
      resolver,
      searchOptions: CONFIG.RETRIEVAL,
      maxOutputRows: MAX_OUTPUT_ROWS,
    });
    actual[q] = {
      rows: results.map(r => ({ documentId: r.documentId, score: Number(r.score.toFixed(4)) })),
      skippedSegments: skipped.length,
      mustInclude,
    };
  }

  if (WRITE) {
    fs.writeFileSync(EXPECTED_PATH, `${JSON.stringify(actual, null, 2)}\n`);
    const rows = Object.values(actual).reduce((n, v) => n + v.rows.length, 0);
    console.log(`golden retrieval: recorded ${GOLDEN.length} queries, ${rows} rows`);
    console.log(`  ${EXPECTED_PATH}`);
    return;
  }

  if (!fs.existsSync(EXPECTED_PATH)) {
    console.error("golden retrieval: no expectation recorded.");
    console.error("  Run: npm --prefix server run golden -- --write");
    process.exitCode = 1;
    return;
  }

  const expected = JSON.parse(fs.readFileSync(EXPECTED_PATH, "utf8"));
  const problems = [];
  let maxDrift = 0;

  for (const [q, exp] of Object.entries(expected)) {
    const got = actual[q];
    if (!got) { problems.push(`${q}\n      missing from this run — the golden set changed`); continue; }

    const expIds = exp.rows.map(r => r.documentId);
    const gotIds = got.rows.map(r => r.documentId);
    if (expIds.join(" > ") !== gotIds.join(" > ")) {
      problems.push(
        `${q}\n      expected: ${expIds.join(", ") || "(nothing)"}` +
        `\n      actual:   ${gotIds.join(", ") || "(nothing)"}`
      );
      continue;
    }

    if (exp.skippedSegments !== got.skippedSegments) {
      problems.push(
        `${q}\n      segments skipped as confident CONVERSATIONAL: ` +
        `expected ${exp.skippedSegments}, got ${got.skippedSegments}`
      );
    }

    for (const [i, row] of exp.rows.entries()) {
      const drift = Math.abs(row.score - got.rows[i].score);
      if (drift > maxDrift) maxDrift = drift;
      if (drift > SCORE_TOLERANCE) {
        problems.push(
          `${q}\n      ${row.documentId}: ${row.score} -> ${got.rows[i].score}` +
          `  (drift ${drift.toFixed(4)} over the ${SCORE_TOLERANCE} tolerance)`
        );
      }
    }

    // The label is independent of the recording: a re-record cannot quietly
    // bless a run that stopped finding the document the question is about.
    if (exp.mustInclude && !gotIds.includes(exp.mustInclude)) {
      problems.push(`${q}\n      must retrieve ${exp.mustInclude} and did not`);
    }
    if (exp.mustInclude === null && gotIds.length > exp.rows.length) {
      problems.push(`${q}\n      off-topic and now retrieves more than recorded`);
    }
  }

  const queries = Object.keys(expected).length;
  const rows = Object.values(expected).reduce((n, v) => n + v.rows.length, 0);

  if (problems.length) {
    console.error(`\ngolden retrieval: ${problems.length} problem(s) across ${queries} queries\n`);
    for (const p of problems) console.error(`  ${p}`);
    console.error(
      "\n  If this is a deliberate corpus or threshold change, re-record with:" +
      "\n    npm --prefix server run golden -- --write" +
      "\n  and read the diff before committing it.\n"
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `golden retrieval: OK — ${queries} queries, ${rows} rows, ` +
    `largest score drift ${maxDrift.toFixed(4)} (tolerance ${SCORE_TOLERANCE})`
  );
};

main().catch((e) => { console.error(e); process.exit(1); });
