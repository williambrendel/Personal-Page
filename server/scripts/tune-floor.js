/**
 * Sweep the retrieval cosine floor against a labeled query set.
 * Retrieval only — no LLM calls, no cost.
 *
 *   npm run tune-floor
 *
 * Reports, per floor value:
 *   hit@1 / hit@3  — did the expected document rank first / in the top three
 *   rows           — mean rows returned for on-topic queries (context cost)
 *   offtopic       — share of off-topic queries correctly returning nothing
 *   segs skipped   — segments the server skips as confident CONVERSATIONAL
 *
 * The sweep itself is llms' `eval/floor`. What stays here is the query set,
 * the floors worth trying, and how this app retrieves.
 *
 * ── Reading the output ──────────────────────────────────────────────────
 *
 * Production uses 0.70 (`CONFIG.RETRIEVAL.floor`), and that choice was made
 * explicitly rather than inherited — see baselines/step-8-eval-segment-filter.md.
 * On this golden set 0.74 looks strictly better (same hit@1 and hit@3, one row
 * less context, no off-topic leak) and is still the wrong change: the one leak
 * at 0.70 is "what is 2 + 2?" retrieving one row at 0.717, which the gate's
 * 0.755 minScore already rejects, and hit@3 being equal across the two only
 * says that none of *these fifteen* questions has its only good section
 * between them. A real visitor's phrasing might, and raising the floor would
 * send that question to the no-coverage path.
 *
 * The off-topic column is only meaningful because retrieval goes through the
 * engine's own `retrieve`. These scripts used to drop every CONVERSATIONAL
 * segment, so off-topic questions were never searched and the column read
 * 100% at every floor.
 */
import CONFIG          from "../config.js";

// AFTER config: config sets XENOVA_CACHE_DIR, which this reads to locate
// the ONNX model cache outside node_modules.
import { ready as runtimeReady } from "@williambrendel/llms/src/xenova/env.js";
import VectorStore     from "@williambrendel/llms/src/VectorStore/index.js";
import SectionResolver from "@williambrendel/llms/src/actions/query/SectionResolver.js";
import buildAnalyze    from "@williambrendel/llms/src/xenova/buildAnalyzeQuery/index.js";
import prewarm         from "@williambrendel/llms/src/xenova/prewarm.js";
import { retrieve }     from "@williambrendel/llms/src/actions/query/index.js";
import { MAX_OUTPUT_ROWS } from "@williambrendel/llms/src/VectorStore/constants.js";
import { sweepFloor, formatFloorSweep } from "@williambrendel/llms/src/eval/floor.js";

// expected === null means "should retrieve nothing".
const GOLDEN = [
  ["what did you do at Snap?",                     "career|snap"],
  ["tell me about iScribeHealth",                  "career|iscribehealth"],
  ["what did you build at Amazon?",                "career|amazon_a9"],
  ["tell me about your PhD",                       "background|education_and_research"],
  ["how do you handle disagreement with your team?","stories|snap_beauty_score_filter"],
  ["tell me about a time you failed",              "stories|heali_overbuilt_before_validating"],
  ["how big was your team at Heali?",              "stories|heali_early_team"],
  ["how can I get in touch?",                      "logistics|contact_and_links"],
  ["what are you looking for in a role?",          "logistics|what_im_looking_for"],
  ["why did you leave iScribeHealth?",             "logistics|why_i_left_iscribehealth"],
  ["what's your favorite book?",                   "perspective|influences"],
  ["how do you feel about firing people?",         "perspective|firing_and_accountability"],
  ["what would you do in your first 90 days?",     "perspective|first_90_days"],
  ["thoughts on an 80 hour work week?",            "perspective|work_hours"],
  ["where do you see healthcare AI going?",        "perspective|future_of_healthcare_ai"],
  ["what's the capital of France?",                null],
  ["write me a poem about cats",                   null],
  ["what is 2 + 2?",                               null],
  ["what's the weather today?",                    null],
];

const FLOORS = [0.30, 0.70, 0.74, 0.78, 0.80, 0.82, 0.84, 0.86];

const main = async () => {
  await runtimeReady;
  await prewarm(CONFIG.PREWARM);
  const [store, resolver] = await Promise.all([
    VectorStore.create(CONFIG.DATASET),
    SectionResolver.create(CONFIG.MARKDOWNS),
  ]);
  const analyze = await buildAnalyze({ store, ...CONFIG.CLASSIFIER });

  // Analyze once per query and reuse it across floors: the analysis is
  // floor-independent, so this keeps the sweep measuring retrieval rather
  // than re-embedding the same questions eight times.
  const analyzed = new Map();
  for (const [q] of GOLDEN) analyzed.set(q, await analyze(q));

  const retrieveOne = (query, { searchOptions } = {}) => retrieve({
    analysis: analyzed.get(query),
    store,
    resolver,
    searchOptions,
    maxOutputRows: MAX_OUTPUT_ROWS,
  });

  const rows = await sweepFloor({ queries: GOLDEN, retrieve: retrieveOne, floors: FLOORS });

  console.log(formatFloorSweep({ documents: store.length, queries: GOLDEN, rows }));
};

main().catch(e => { console.error(e); process.exit(1); });
