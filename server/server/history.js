/**
 * Conversation memory without a conversation store.
 *
 * There is no database and no session — the API answers each request on its
 * own, which is what keeps it a single process on a t4g.small. So the page
 * holds the transcript and sends the tail of it with every question. The
 * client IS the store; the server stays stateless and still gets context.
 *
 * That buys two things, neither of which costs a model call:
 *
 *   1. Retrieval that survives a follow-up. "What about at Samsung?" embeds
 *      to almost nothing — no topic words, just a pronoun and a company. The
 *      question before it carries the subject, so a dependent query is
 *      retrieved as the pair.
 *
 *   2. An answer that can resolve the reference, because the exchange it
 *      refers to is in front of the model.
 *
 * ── The history is NOT trusted ──────────────────────────────────────────
 *
 * It arrives in the request body, so a client can send whatever it likes,
 * including answers "William" never gave. It is therefore quoted as reported
 * text inside the context rather than replayed as real assistant turns: the
 * model is told, in the block itself, that it is the page's record and that
 * the retrieved sections are the only source of fact. A forged turn can
 * mislead about what was already said; it cannot manufacture a source.
 *
 * The caps exist for the same reason, plus two duller ones: the body limit
 * is 16 KB, and every character here is a prompt token on each request.
 *
 * ── The implementation lives in llms now ────────────────────────────────
 *
 * `pipelines/rag/history` is this code, extracted, and it is the default the
 * answer pipeline's engine uses — so this file exists for `app.js`, which
 * cleans the transcript at the edge before anything downstream sees it.
 *
 * Checked before switching, not assumed: a differential test ran both
 * implementations over 923 input pairs — 28 queries against 21 history
 * shapes, including control characters, non-breaking spaces, oversized
 * strings, empty and missing questions, and 30-turn transcripts — and found
 * zero differences on every input the server can actually receive.
 *
 * The one place they diverge is a non-string query, where this threw a
 * TypeError and the library returns safely. `resolveQuery` in app.js admits
 * only a non-empty trimmed string, so that path was unreachable; the
 * library is the more defensive of the two for free.
 */
export {
  clean,
  condense,
  isDependent,
  preamble,
  MAX_TURNS,
  MAX_QUESTION_CHARS,
  MAX_ANSWER_CHARS,
} from "@williambrendel/llms/src/pipelines/rag/history.js";
