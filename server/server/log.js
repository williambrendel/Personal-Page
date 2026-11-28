/**
 * One line per question, so a bad answer can be explained after the fact.
 *
 * Until now the only record of a query was the Anthropic bill. When a chip
 * produced an answer that missed — "what was the PhD in" coming back with
 * the story of how the PhD happened — there was nothing to look at: not the
 * question, not what was retrieved, not which chip it came from.
 *
 * What is written, and what is not:
 *
 *   - The question, the documents the answer actually cited, the intent the
 *     classifier assigned, the follow-ups offered, the buttons shown, and
 *     how long it took. That set is chosen to answer one question — "why did
 *     it say that" — and the cited documentIds are the part that does it,
 *     because a wrong answer is nearly always a retrieval miss.
 *   - NOT the IP. The rate limiter needs one in memory and that is a
 *     different thing from writing it down next to what someone asked. The
 *     questions alone are not identifying; questions plus address are.
 *   - NOT the answer text. It is reconstructible from the sources and it
 *     would multiply the size of the file by twenty.
 *
 * Two sinks, on purpose. stdout is the real one: under systemd it lands in
 * the journal, which already handles rotation, retention and disk pressure,
 * and it is there whether or not a path is configured. The file is for
 * reading without root and for keeping a longer tail than the journal is
 * configured to hold.
 *
 * ── The implementation lives in llms now ────────────────────────────────
 *
 * `pipelines/answer/log` is this code, extracted. Its `logQuery(entry, file)`
 * keeps this signature exactly, on one shared log per process, so every call
 * site in app.js is unchanged.
 *
 * It also fixes something this had: on a write error this nulled `stream`
 * unconditionally, so an error arriving from the OLD stream after a rotation
 * discarded the new one and the file sink went quiet until the path changed.
 * The library nulls it only if the erroring stream is still the current one.
 */
export { logQuery, MAX_BYTES } from "@williambrendel/llms/src/pipelines/answer/log.js";
