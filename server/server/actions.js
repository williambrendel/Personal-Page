/**
 * Turn "can I see your CV?" into a button that downloads it.
 *
 * An answer used to be able only to describe where a button is — "open the
 * menu at the bottom left and choose Download my resume" — which is a page
 * telling someone where to look instead of handing them the thing. (That
 * menu is gone now; the links live in the icon row. The point stands: a
 * button under the answer beats a direction to one.)
 *
 * ── Why the model does not decide this ──────────────────────────────────
 *
 * The obvious design is to let the answering model emit the keys. Two
 * reasons not to:
 *
 *   1. It cannot. llms' query action returns an explicit object — answer,
 *      followUpQuestions, and nothing else — so an `actions` field in the
 *      model's JSON is discarded inside the library before this server sees
 *      it. Changing that means a library release for four buttons.
 *
 *   2. It should not. This is a fixed classification over the question,
 *      which an embedding answers for nothing: the model is already
 *      resident, the comparison is a dot product, and the result is
 *      deterministic and testable. Letting an LLM choose would add a thing
 *      that can be talked into choosing wrongly, for no gain over matching
 *      the question against a handful of phrasings.
 *
 * The anchors are embedded once at boot. Per request this costs one
 * vectorize call on the query — roughly 20ms — and no money.
 *
 * ── The implementation lives in llms now ────────────────────────────────
 *
 * `pipelines/answer/actions` is this code, extracted. The four contact
 * destinations are the library's `CONTACT_ANCHORS` — none of them is about
 * anyone in particular — and what stays here is the one destination that is
 * about William: the book.
 *
 * The book answers are written as teasers — they say what the chapter argues
 * and leave the evidence in it — so the one thing they must always offer is
 * a way to go and read it. A link inside the prose does not survive: the
 * answering model composes from the section and drops the trailing sentence
 * often enough that an upsell resting on it is not an upsell. A button does
 * not depend on the model saying anything.
 *
 * ── Why the swap is safe, measured rather than assumed ──────────────────
 *
 * The threshold has almost no room in it. On the 23-query set in
 * scripts/measure-actions.js the lowest true match scores 0.783 and the
 * highest near miss 0.769, so the whole decision margin is 0.014 wide —
 * "I'd like to book 30 minutes" sits 0.003 above the line and "What's on
 * your resume for 2019?" 0.011 below it. Anything that moved scores by a
 * hundredth would change what visitors are offered.
 *
 * So all three inputs to the decision were compared before switching:
 * the library's four anchor sets are byte-identical to the ones this file
 * used to declare, its threshold is the same 0.78, and its cap is the same
 * 2. The library sums with a four-accumulator dot product where this used a
 * plain loop, which changes only the last bits: across 28 queries the
 * largest score difference was 1.22e-15, thirteen orders of magnitude
 * inside the margin, and no decision changed.
 *
 * It also fixes something this had: a failed `warm()` was cached forever, so
 * one transient embedding failure at boot meant no buttons for the life of
 * the process. The library does not cache the failure.
 */
import { createActions } from "@williambrendel/llms/src/pipelines/answer/actions.js";

/**
 * Phrasings for the book. Written as whole questions rather than keywords,
 * for the reason the library's own anchors are: "resume" alone also sits
 * inside "what's on your resume for 2019", which is a question about his
 * history, not a request for the file.
 */
const THE_BOOK = Object.freeze([
  "Where can I buy your book?",
  "How do I get a copy of The AI Transformation?",
  "Is your book on Amazon?",
  "Have you written a book?",
  "What's your chapter about?",
  "Tell me about your book.",
]);

const {
  actionsFor, scoresFor, warm,
  anchors: ANCHORS, similar: SIMILAR, maxActions: MAX_ACTIONS,
} = createActions({ extraAnchors: { thebook: THE_BOOK } });

export { actionsFor, scoresFor, warm, ANCHORS, SIMILAR, MAX_ACTIONS };
