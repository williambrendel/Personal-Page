/**
 * Boot-time resource loading + a single `ask()` entry point, shared by the
 * HTTP server and the CLI.
 *
 * Everything heavy — the ONNX embedding model, the VectorStore, the
 * SectionResolver, the answer prompt — loads once per process and stays
 * resident. Nothing here is per-request.
 */


import fs from "node:fs/promises";

import CONFIG          from "../config.js";

// AFTER config: config sets XENOVA_CACHE_DIR, which this reads to locate
// the ONNX model cache outside node_modules.
import "llms/src/xenova/env.js";
import VectorStore     from "llms/src/VectorStore/index.js";
import SectionResolver from "llms/src/actions/query/SectionResolver.js";
import buildAnalyze    from "llms/src/xenova/buildAnalyzeQuery/index.js";
import runQuery        from "llms/src/actions/query/index.js";
import prewarm         from "llms/src/xenova/prewarm.js";
import claudeRun       from "llms/src/claude/index.js";
import manifest        from "../scripts/manifest.js";
import { condense, preamble } from "./history.js";

let enginePromise;

const build = async () => {
  const started = Date.now();

  // Only the feature-extraction model. See CONFIG.PREWARM.
  await prewarm(CONFIG.PREWARM);

  // Fail fast on a stale corpus. Section ranges are byte offsets into the
  // markdown; if the markdown moved, the resolver returns misaligned text
  // rather than an error, and the model fabricates to bridge the gaps.
  // Refusing to start is strictly better than answering wrongly in his name.
  const integrity = await manifest.verify();
  if (!integrity.ok) {
    const detail = [
      ...integrity.stale.map(id => `stale (edited since ingest): ${id}`),
      ...integrity.missing.map(id => `missing markdown: ${id}`),
      ...integrity.untracked.map(id => `never ingested: ${id}`),
    ];
    throw new Error(
      `Corpus is out of sync with the vector store` +
      (integrity.reason ? ` (${integrity.reason})` : "") + ".\n  " +
      (detail.join("\n  ") || "") +
      "\n\n  Section ranges are byte offsets into the markdown, so serving " +
      "this would\n  return misaligned text and invite fabricated answers. " +
      "Run: npm run ingest"
    );
  }

  const [store, resolver, answerPrompt] = await Promise.all([
    VectorStore.create(CONFIG.DATASET),
    SectionResolver.create(CONFIG.MARKDOWNS),
    fs.readFile(CONFIG.ANSWER_PROMPT, "utf8"),
  ]);

  // Mode 1 with domain anchors, NLI disabled. See CONFIG.CLASSIFIER.
  const analyzeQuery = await buildAnalyze({ store, ...CONFIG.CLASSIFIER });

  const boot = ((Date.now() - started) / 1000).toFixed(1);
  console.log(`Engine ready in ${boot}s — ${store.length} documents, ${store.vecDim} dimensions.`);

  /**
   * @param {string} rawQuery
   * @param {{history?: {q: string, a: string}[]}} [options]
   *   `history` is the tail of the conversation as the PAGE recorded it —
   *   there is no session store, so the client carries it. See
   *   server/history.js for the caps and why it is quoted rather than
   *   replayed as real turns.
   */
  const ask = (rawQuery, { history = [] } = {}) => runQuery({
    // Retrieval runs on the condensed form so a follow-up still embeds to
    // something; the model is shown the exchange and can resolve the rest.
    rawQuery: history.length ? condense(rawQuery, history) : rawQuery,
    store,
    resolver,
    analyzeQuery,
    // The history rides in on the context string rather than as extra
    // conversation turns: turns carry the authority of something the
    // assistant actually said, and this came from the client.
    runLLM:           history.length
      ? (config, context) => claudeRun(config, preamble(history) + context)
      : claudeRun,
    prompts:          { answer: answerPrompt },
    llmConfig:        CONFIG.HAIKU55,
    searchOptions:    CONFIG.RETRIEVAL,
    greetingTemplate: CONFIG.GREETING,
    fallbackAnswer:   CONFIG.FALLBACK,
  });

  return { ask, store, resolver, analyzeQuery };
};

/** Idempotent — the first call builds, every later call returns the same engine. */
const getEngine = () => enginePromise || (enginePromise = build());

// Both shapes, as the CommonJS version allowed: the default is the function
// itself, and `getEngine` is the same function as a named export. The old
// Object.defineProperty/freeze pair existed only to attach that second name
// to a module.exports function; ES modules do it directly, and the bindings
// an importer sees are already read-only.
export default getEngine;
export { getEngine };
