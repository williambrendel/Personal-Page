/**
 * Precomputed answers, and the tree of follow-ups underneath them.
 *
 * ── The idea ────────────────────────────────────────────────────────────
 *
 * Every heading in the corpus is a question, and the body under it is the
 * answer somebody already wrote. So for any question we have a section for,
 * there is nothing to work out at request time: no retrieval, no model, no
 * rewrite of text that was already right. The only reason to involve a model
 * is a question nobody anticipated.
 *
 * That holds one level down too, and the level below that. A section's
 * follow-ups are the other sections of the same document — questions the
 * author wrote on purpose, in order — and each of those has its own
 * siblings. Which makes the answerable part of this corpus a graph, and the
 * part a visitor is likely to walk a small, bounded subgraph of it.
 *
 * So we walk it at boot and hand the page the whole thing: the opening
 * chips, their answers, their follow-ups, those follow-ups' answers, and so
 * on to DEPTH. A visitor can go four questions deep without the page making
 * a single request, and without a model ever restating something the author
 * already said better.
 *
 * ── Why this is cheap ───────────────────────────────────────────────────
 *
 * Follow-up edges stay inside one document, so the subgraph under a chip is
 * at most that document — three to five sections, a few KB. Three chips,
 * deduplicated, is a payload smaller than one of the page's icons. Past the
 * edge of the tree the page falls back to asking, which still works and is
 * what it always did.
 *
 * ── What it costs ───────────────────────────────────────────────────────
 *
 * The text is published exactly as written, headings stripped. Nothing is
 * composed, trimmed, or adapted to the phrasing of the chip. That is the
 * point, and it puts one requirement on the corpus: a section has to stand
 * on its own, because it will be read on its own. See
 * data/_templates/README.md — "Before you ingest: does this section need
 * rewriting?" — for the rule, which is mostly "no".
 *
 * ── Drift ───────────────────────────────────────────────────────────────
 *
 * Nothing is baked to disk, deliberately. A generated JSON of answers would
 * be a fourth copy of the corpus to keep in step with the markdown, the .bin
 * vectors and the manifest, and it would go stale silently. Reading markdown
 * at boot means an edit is live on the next restart, which happens on every
 * deploy, and the manifest guard already refuses to boot on markdown that
 * has drifted from its vectors.
 *
 * A heading that no longer exists is logged loudly and that one entry loses
 * its precomputed answer — it falls through to the engine and still works,
 * slower. A missing section must not take the site's chat down.
 *
 * ── It went into the library, as it stood ───────────────────────────────
 *
 * This file used to end by saying that it knew about markdown, `##` headings
 * and a list of roots, and nothing about what the site was for — that the
 * same code would serve a personal page, a storefront answering "will this
 * fit my setup?", or a creator answering "how did you make this?" — and that
 * this was why it was written to be lifted into the shared library as it
 * stood. It has been: `pipelines/answer/starters`.
 *
 * What is left here is the part that IS about this site: where the corpus is,
 * which questions open it, and which ones must never be offered.
 *
 * `buildGraph` keeps its second argument defaulted, because scripts/
 * follow-ups.js passes only the markdown root and a missing dataset root
 * would not throw — it would just find no persisted questions and quietly
 * fall back to headings.
 */
import CONFIG from "../config.js";
import {
  createStarters,
  buildGraph as buildGraphRaw,
  expand, followUpsFrom, parseSections, normalise, DEPTH,
} from "@williambrendel/llms/src/pipelines/answer/starters.js";

import { actionsFor } from "./actions.js";

/** Idempotent at the call site in app.js, which builds once at boot. */
const build = () => createStarters({
  markdowns:    CONFIG.MARKDOWNS,
  dataset:      CONFIG.DATASET,
  starters:     CONFIG.STARTERS,
  neverSuggest: CONFIG.NEVER_SUGGEST,
  actionsFor,
});

const buildGraph = (root, datasetRoot = CONFIG.DATASET) => buildGraphRaw(root, datasetRoot);

export { build, buildGraph, expand, followUpsFrom, parseSections, normalise, DEPTH };
