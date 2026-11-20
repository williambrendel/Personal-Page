/**
 * Retrieval-only diagnostic — no API key, no Claude call, no cost.
 *
 * Runs analyze → search → resolve and prints exactly the context block that
 * would be handed to the answer prompt. Use this to tune the corpus and the
 * classifier without spending tokens.
 *
 *   npm run retrieve -- "how do you handle disagreement?"
 */


import CONFIG              from "../config.js";

// AFTER config: config sets XENOVA_CACHE_DIR, which this reads to locate
// the ONNX model cache outside node_modules.
import { ready as runtimeReady } from "@williambrendel/llms/src/xenova/env.js";
import VectorStore         from "@williambrendel/llms/src/VectorStore/index.js";
import SectionResolver     from "@williambrendel/llms/src/actions/query/SectionResolver.js";
import buildAnalyze        from "@williambrendel/llms/src/xenova/buildAnalyzeQuery/index.js";
import search              from "@williambrendel/llms/src/VectorStore/search.js";
import unionHits           from "@williambrendel/llms/src/actions/query/unionHits.js";
import serializeQueryContext from "@williambrendel/llms/src/xenova/serializeQueryContext.js";
import prewarm             from "@williambrendel/llms/src/xenova/prewarm.js";
import { MAX_OUTPUT_ROWS } from "@williambrendel/llms/src/VectorStore/constants.js";

const QUERIES = process.argv.slice(2).length
  ? [process.argv.slice(2).join(" ")]
  : [
      "what did you do at Snap?",
      "how do you handle disagreement with your team?",
      "how can I get in touch?",
      "hi there",
      "what's the capital of France?",
      "tell me about your PhD",
      "have you worked on healthcare?",
      "what's your opinion on remote work?",
    ];

const main = async () => {
  await runtimeReady;
  await prewarm(CONFIG.PREWARM);

  const [store, resolver] = await Promise.all([
    VectorStore.create(CONFIG.DATASET),
    SectionResolver.create(CONFIG.MARKDOWNS),
  ]);
  const analyzeQuery = await buildAnalyze({ store, ...CONFIG.CLASSIFIER });

  console.log(`Loaded ${store.length} documents, ${store.vecDim} dimensions.\n`);
  console.log("=".repeat(78));

  for (const q of QUERIES) {
    const analysis = await analyzeQuery(q);

    const searchable = analysis.segments.filter(s =>
      s.classification?.label !== "CONVERSATIONAL"
    );

    const hits = unionHits(await Promise.all(
      searchable.map(seg => search(store, seg.vec, CONFIG.RETRIEVAL))
    ));

    const enriched = [];
    for (const hit of hits) {
      const text = resolver.resolve(hit.documentId, hit.range);
      if (text !== null) enriched.push({ ...hit, sectionText: text });
    }
    const results = enriched.slice(0, MAX_OUTPUT_ROWS);

    console.log(`\nQUERY: ${q}`);
    console.log(`  corrected: ${analysis.corrected}`);
    console.log(`  greeting: ${analysis.greeting}   intent: ${serializeQueryContext.buildIntents(analysis)}`);
    console.log(`  segments: ${analysis.segments.map(s =>
      `"${s.text}" → ${s.classification?.label}(${s.classification?.confidence?.toFixed(2)})`
    ).join("  |  ") || "none"}`);
    console.log(`  retrieved: ${results.length}`);

    for (const r of results.slice(0, 4)) {
      const snippet = r.sectionText.replace(/\s+/g, " ").slice(0, 105);
      console.log(`    ${r.score.toFixed(3)}  ${r.documentId.padEnd(38)} ${snippet}…`);
    }
    if (!results.length) console.log("    (nothing — answer prompt takes the no-coverage path)");
    console.log("-".repeat(78));
  }
};

main().catch(err => { console.error(err); process.exit(1); });
