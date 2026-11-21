/**
 * The retrieval gate: does this corpus still retrieve what it used to?
 *
 *   npm --prefix server run golden            verify (exits non-zero on drift)
 *   npm --prefix server run golden -- --write re-record the expectation
 *
 * Deterministic and free. No model calls, so it is safe to run in `npm test`
 * and safe for an unattended dependency update to depend on. It is the gate
 * update-apps is judged on before it pushes a library bump to main.
 *
 * ── What is here and what is in the library ─────────────────────────────
 *
 * The comparison is llms' `eval/golden` now. What stays here is the part that
 * is about *this* corpus: the questions, the document each one must find, and
 * how this app retrieves.
 *
 * The library's rules are the ones this file used to implement, and they are
 * worth restating because they are the reason the gate is trustworthy:
 * documents and their order are compared exactly, scores within a tolerance.
 * The tolerance defaults to 0.02 — measured here, from the largest harmless
 * drift this corpus has seen (8.0e-3, the @xenova to @huggingface runtime
 * change) plus margin. The tolerance is not the gate: a reorder fails
 * whatever it is set to, and a row crossing the 0.70 floor changes the row
 * count, which is structural too.
 *
 * Tied scores used to be the weak spot — this corpus has a query returning
 * twelve rows at exactly 0.9200, where order came down to sort stability.
 * llms 2.4 made the tie-break deterministic (pre-rerank cosine, then
 * documentId, then range), so asserting exact order is now fair rather than
 * merely lucky.
 */
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
import { run } from "@williambrendel/llms/src/eval/golden.js";

const EXPECTED_PATH = path.join(
  path.dirname(path.dirname(fileURLToPath(import.meta.url))),
  "baselines/golden-retrieval.json"
);

/**
 * The same set tune-floor.js calibrates against. The second element is the
 * document the question must find; `null` means it must retrieve nothing.
 *
 * This is app data, not library data: it encodes what this corpus is supposed
 * to be able to answer, which is an editorial judgement about William's
 * writing rather than anything llms could know.
 */
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

  // The engine's own retrieval, so the gate measures the path the server
  // runs. `retrieve` decides which segments to search itself — the thing
  // three eval scripts in this repo used to get wrong by dropping every
  // CONVERSATIONAL segment.
  const retrieveOne = async (query) => retrieve({
    analysis: await analyze(query),
    store,
    resolver,
    searchOptions: CONFIG.RETRIEVAL,
    maxOutputRows: MAX_OUTPUT_ROWS,
  });

  const result = await run({
    path:     EXPECTED_PATH,
    queries:  GOLDEN,
    retrieve: retrieveOne,
    write:    process.argv.includes("--write"),
    rerecord: "npm --prefix server run golden -- --write",
  });

  if (!result.ok) process.exitCode = 1;
};

main().catch((e) => { console.error(e); process.exit(1); });
