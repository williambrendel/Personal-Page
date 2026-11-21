/**
 * Calibrate the pre-LLM gate (llms v1.10.0) against THIS corpus.
 *
 *   npm run calibrate-gate
 *
 * Retrieval only — no model calls, no cost.
 *
 * The gate's shipped defaults (minScore 0.54, goodScore 0.60) were measured
 * on Ask Nereus's 316-document knowledge base. This corpus is 50 documents
 * of one person's career, which is topically far narrower, so its score
 * distribution is different and the defaults do not transfer. gate.calibrate
 * derives thresholds from two score sets:
 *
 *   answerable — top score for questions the corpus genuinely covers
 *   offTopic   — top score for questions it must refuse
 *
 * It picks minScore to keep `keepAnswerable` of the answerable questions
 * above it, and goodScore just above the highest off-topic score.
 */

import CONFIG from "../config.js";

// AFTER config: config sets XENOVA_CACHE_DIR.
import { ready as runtimeReady } from "@williambrendel/llms/src/xenova/env.js";
import VectorStore     from "@williambrendel/llms/src/VectorStore/index.js";
import SectionResolver from "@williambrendel/llms/src/actions/query/SectionResolver.js";
import buildAnalyze    from "@williambrendel/llms/src/xenova/buildAnalyzeQuery/index.js";
import prewarm         from "@williambrendel/llms/src/xenova/prewarm.js";
import { retrieve }     from "@williambrendel/llms/src/actions/query/index.js";
import { calibrateGate, formatCalibration } from "@williambrendel/llms/src/eval/gate.js";

/** Questions this corpus genuinely covers — drawn from what it actually contains. */
const ANSWERABLE = [
  "What did you do at Snap?",
  "Tell me about iScribeHealth",
  "What did you build at Amazon?",
  "Tell me about your PhD",
  "How did you get into AI?",
  "Where are you from?",
  "What do you do for fun?",
  "What are your core values?",
  "Why did you leave big tech?",
  "What keeps you awake at night?",
  "Tell me about a time a project failed.",
  "How do you run a team?",
  "What's your best story from grad school?",
  "How did you become a product manager?",
  "Tell me about a critical decision under time pressure.",
  "Have you written a book?",
  "How old are you?",
  "Can you work in Europe?",
  "What's your view on diversity in a team?",
  "How would you approach AI adoption at a company?",
  "Tell me about managing a layoff.",
  "How do you manage remote teams?",
  "What are you looking for in a role?",
  "Why did you leave iScribeHealth?",
  "What's the most misunderstood thing about your leadership?",
  "How do you handle burnout?",
  "What would you change in your first 90 days?",
  "Tell me about disagreeing with leadership.",
  "What did you do at Google?",
  "How do you balance tech debt against shipping?",
];

/** Questions it must refuse. */
const OFF_TOPIC = [
  "What is the best sourdough recipe?",
  "Who won the 2022 World Cup?",
  "Write me a Python script to scrape a website?",
  "What's the capital of Mongolia?",
  "How do I fix a leaking tap?",
  "What's the weather tomorrow?",
  "Explain quantum entanglement.",
  "Recommend a good restaurant in Paris.",
  "How do I treat a sprained ankle?",
  "What's the stock price of Nvidia?",
];

const main = async () => {
  await runtimeReady;
  await prewarm(CONFIG.PREWARM);
  const [store, resolver] = await Promise.all([
    VectorStore.create(CONFIG.DATASET),
    SectionResolver.create(CONFIG.MARKDOWNS),
  ]);
  const analyze = await buildAnalyze({ store, ...CONFIG.CLASSIFIER });
  const floor = CONFIG.RETRIEVAL?.floor ?? 0;

  // The engine's own retrieval, so the scores are the ones production sees.
  // This script used to re-implement it and drop every CONVERSATIONAL
  // segment, which made every off-topic score a literal 0.000 — the gate was
  // being calibrated against a distribution that did not exist. See
  // baselines/step-8-eval-segment-filter.md.
  const retrieveOne = async (query, { searchOptions } = {}) => retrieve({
    analysis: await analyze(query),
    store,
    resolver,
    searchOptions,
  });

  const calibration = await calibrateGate({
    answerable: ANSWERABLE,
    offTopic:   OFF_TOPIC,
    retrieve:   retrieveOne,
    floor,
  });

  console.log(formatCalibration({ documents: store.length, ...calibration }));
};

main().catch(e => { console.error(e); process.exit(1); });
