/**
 * Boot-time resource loading + a single `ask()` entry point, shared by the
 * HTTP server and the CLI.
 *
 * Everything heavy — the ONNX embedding model, the VectorStore, the
 * SectionResolver, the answer prompt — loads once per process and stays
 * resident. Nothing here is per-request.
 *
 * ── The implementation lives in llms now ────────────────────────────────
 *
 * `pipelines/answer/engine` is this code, extracted. This file is the
 * binding: it supplies this corpus's paths, this site's prompt and voice
 * configuration, and the two entry shapes the rest of the app already
 * imports — a default export that is the getter itself, and `getEngine` as
 * the same function named.
 *
 * Three things were checked before switching rather than assumed:
 *
 *   - The manifest guard. The library throws on a corpus that drifted from
 *     its vectors, using `manifest.describe` when the manifest has one. Ours
 *     does — it is llms' own `createManifest` — so the operator sees the same
 *     lines and the same "Run: npm run ingest". The `integrity.reason`
 *     branch this file used to carry was already dead code: `verify()`
 *     returns ok/stale/missing/untracked and no reason.
 *
 *   - The history wiring. The library defaults to `pipelines/rag/history`'s
 *     `condense` and `preamble`, which a differential test showed to be
 *     identical to ours on every input the server can receive. So the
 *     condensed-retrieval and quoted-transcript behaviour is unchanged, and
 *     the reason for it is unchanged too: see server/history.js.
 *
 *   - Runtime sequencing. `ready` is not decoration. llms' xenova/env
 *     configures the runtime inside an async IIFE, so importing it for its
 *     side effects only schedules that work — it does not finish it. Before
 *     llms 2.1 it happened to land first by microtask order, which is luck,
 *     not sequencing. The library awaits `ready` before prewarm, which is
 *     what actually guarantees the cache directory and the remote-model lock
 *     are in place before a model is loaded.
 */
import CONFIG   from "../config.js";
import manifest from "../scripts/manifest.js";
import { createEngine } from "@williambrendel/llms/src/pipelines/answer/engine.js";

/**
 * @returns {Promise<{ask: Function, store: object, resolver: object, analyzeQuery: Function}>}
 *   Idempotent — the first call builds, every later call returns the same engine.
 *
 * `ask(query, { history })` takes the tail of the conversation as the PAGE
 * recorded it; there is no session store, so the client carries it. See
 * server/history.js for the caps and for why it is quoted as reported text
 * rather than replayed as real assistant turns.
 */
const getEngine = createEngine({
  dataset:    CONFIG.DATASET,
  markdowns:  CONFIG.MARKDOWNS,
  manifest,
  promptPath: CONFIG.ANSWER_PROMPT,

  // Mode 1 with domain anchors, NLI disabled. See CONFIG.CLASSIFIER.
  classifier:    CONFIG.CLASSIFIER,
  llmConfig:     CONFIG.HAIKU55,
  searchOptions: CONFIG.RETRIEVAL,
  greeting:      CONFIG.GREETING,
  fallback:      CONFIG.FALLBACK,

  // Only the feature-extraction model. See CONFIG.PREWARM.
  prewarm: CONFIG.PREWARM,
});

// Both shapes, as the CommonJS version allowed: the default is the function
// itself, and `getEngine` is the same function as a named export.
export default getEngine;
export { getEngine };
