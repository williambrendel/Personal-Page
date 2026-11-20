/**
 * The real HTTP path, over the golden question set, as a comparable record.
 *
 *   npm --prefix server run query-baseline > server/baselines/query.txt
 *
 * Costs about 2¢ (19 engine answers). Run it before and after anything that
 * touches retrieval, embedding or the answer path, and diff the two.
 *
 * It records only the signal that is comparable between runs — status,
 * grounded documentIds, chunk count, actions, follow-up count — and not the
 * prose, which is non-deterministic and would make every diff noise.
 *
 * Even so, this is a smoke test, not a strict gate. Four runs of identical
 * code showed the chunk count and the exact set of cited documents moving
 * around: the model decides how many chunks to write and what to attribute,
 * so a one-document difference between runs means nothing. Judge a
 * migration by the deterministic instruments — baselines/retrieve.txt and
 * its cosine scores, tune-floor, calibrate-gate, measure-actions — and use
 * this to catch something that actually broke.
 *
 * It owns the server as a child process rather than asking you to start one,
 * for two reasons learned the hard way:
 *
 *   - Something on this machine SIGTERMs a long-lived `node app.js` about a
 *     minute in, so a run against a hand-started server dies mid-set. This
 *     restarts it and continues.
 *   - The first attempt measured ANOTHER project's 4-document server that
 *     held the port, and reported a confident 0/15. So it asserts the corpus
 *     size before sending a single question. A measurement tool that can
 *     silently measure the wrong process is worse than none.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_DIR = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

const PORT = Number(process.env.BASELINE_PORT || 3147);
const BASE = `http://127.0.0.1:${PORT}`;

/** The corpus this script is allowed to measure. */
const EXPECT_DOCUMENTS = 61;

/**
 * The same set tune-floor.js calibrates against, so the two baselines
 * describe the same questions.
 *
 *   null      must retrieve nothing
 *   "a|b"     must be grounded in that document
 *   ["a","b"] must be grounded in at least one of them, because more than
 *             one document genuinely answers the question
 */
const GOLDEN = [
  ["what did you do at Snap?",                      "career|snap"],
  ["tell me about iScribeHealth",                   "career|iscribehealth"],
  ["what did you build at Amazon?",                 "career|amazon_a9"],
  ["tell me about your PhD",                        "background|education_and_research"],
  ["how do you handle disagreement with your team?","stories|snap_beauty_score_filter"],
  ["tell me about a time you failed",               "stories|heali_overbuilt_before_validating"],
  // Measured flaky across four runs of identical code: sometimes both of
  // these are cited, sometimes only career|heali_ai. Both answer it.
  ["how big was your team at Heali?",               ["stories|heali_early_team", "career|heali_ai"]],
  ["how can I get in touch?",                       "logistics|contact_and_links"],
  ["what are you looking for in a role?",           "logistics|what_im_looking_for"],
  ["why did you leave iScribeHealth?",              "logistics|why_i_left_iscribehealth"],
  ["what's your favorite book?",                    "perspective|influences"],
  ["how do you feel about firing people?",          "perspective|firing_and_accountability"],
  ["what would you do in your first 90 days?",      "perspective|first_90_days"],
  ["thoughts on an 80 hour work week?",             "perspective|work_hours"],
  ["where do you see healthcare AI going?",         "perspective|future_of_healthcare_ai"],
  ["what's the capital of France?",                 null],
  ["write me a poem about cats",                    null],
  ["what is 2 + 2?",                                null],
  ["what's the weather today?",                     null],
];

/**
 * Known-expected deviations from the golden labels. Documented in
 * baselines/README.md; listed here so the report says "expected" rather than
 * leaving a reader to wonder which misses matter.
 */
const EXPECTED_DEVIATION = new Map([
  ["tell me about a time you failed",     "a near-tie between two real failure stories"],
  ["what are you looking for in a role?", "a starter: answered preloaded, never retrieves"],
]);

const wait = (ms) => new Promise(r => setTimeout(r, ms));

let child = null;
let restarts = -1;

const health = async () => {
  try {
    const r = await fetch(`${BASE}/health`);
    return r.ok ? await r.json() : null;
  } catch { return null; }
};

const ensureUp = async () => {
  if (await health()) return;
  if (child) { try { child.kill("SIGKILL"); } catch { /* already gone */ } }
  restarts += 1;
  child = spawn(process.execPath, ["app.js"], {
    cwd: SERVER_DIR,
    env: { ...process.env, PORT: String(PORT) },
    stdio: ["ignore", "ignore", "ignore"],
  });
  child.on("exit", () => { child = null; });

  for (let i = 0; i < 90; i += 1) {
    const h = await health();
    if (h) {
      if (h.documents !== EXPECT_DOCUMENTS) {
        throw new Error(
          `port ${PORT} is serving a ${h.documents}-document corpus, not this one ` +
          `(${EXPECT_DOCUMENTS}) — refusing to measure another project's server`
        );
      }
      return;
    }
    await wait(1000);
  }
  throw new Error(`no server on ${PORT} after 90s`);
};

const ask = async (q, ip) => {
  await ensureUp();
  const res = await fetch(`${BASE}/query`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify({ q }),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const rows = [];
try {
  for (const [i, [q, expected]] of GOLDEN.entries()) {
    // One address per question: the guard allows 15/hour and this set is 19.
    // The server trusts one proxy hop, so this is the real path.
    const ip = `203.0.113.${i + 1}`;
    let got = null;
    for (let attempt = 1; attempt <= 3 && !got; attempt += 1) {
      try {
        got = await ask(q, ip);
      } catch (err) {
        if (attempt === 3) throw err;
        process.stderr.write(`[retry ${attempt}: ${err.cause?.code || err.message}]`);
        await wait(500);
      }
    }
    const chunks  = Array.isArray(got.body.answer) ? got.body.answer : [];
    const sources = [...new Set(chunks.map(c => c?.source?.documentId).filter(Boolean))].sort();
    rows.push({
      q,
      expected,
      status:      got.status,
      chunks:      chunks.length,
      sources,
      hit:         expected === null
                     ? sources.length === 0
                     : [expected].flat().some(d => sources.includes(d)),
      actions:     got.body.actions ?? [],
      followUps:   (got.body.followUpQuestions ?? []).length,
      rateLimited: got.body.rateLimited === true,
    });
    process.stderr.write(".");
  }
} finally {
  if (child) { try { child.kill("SIGKILL"); } catch { /* already gone */ } }
  process.stderr.write("\n");
}

const on   = rows.filter(r => r.expected !== null);
const off  = rows.filter(r => r.expected === null);
const pad  = (s, n) => String(s).padEnd(n);
const mark = (r) => (r.hit ? "ok" : EXPECTED_DEVIATION.has(r.q) ? "~" : "MISS");

console.log(`\n${rows.length} questions — ${on.length} on-topic, ${off.length} off-topic`);
console.log(`server restarts during the run: ${restarts}\n`);
console.log(`${pad("hit", 6)}${pad("st", 5)}${pad("ch", 4)}${pad("fu", 4)}${pad("question", 48)}sources | actions`);
console.log("-".repeat(136));
for (const r of rows) {
  console.log(
    pad(mark(r), 6) + pad(r.status, 5) + pad(r.chunks, 4) + pad(r.followUps, 4) +
    pad(r.q.slice(0, 46), 48) + r.sources.join(", ") +
    (r.actions.length ? "  |  " + r.actions.join(", ") : "")
  );
}

const unexpected = rows.filter(r => !r.hit && !EXPECTED_DEVIATION.has(r.q));
console.log(`\non-topic grounded in the expected document : ${on.filter(r => r.hit).length}/${on.length}`);
console.log(`off-topic correctly ungrounded             : ${off.filter(r => r.hit).length}/${off.length}`);
console.log(`any rate-limited                           : ${rows.some(r => r.rateLimited) ? "YES" : "no"}`);

console.log(`\n~ expected, documented in baselines/README.md:`);
for (const [q, why] of EXPECTED_DEVIATION) console.log(`    ${q}  —  ${why}`);

if (unexpected.length) {
  console.log(`\nUNEXPECTED MISSES (${unexpected.length}):`);
  for (const r of unexpected) console.log(`    ${r.q}  ->  ${r.sources.join(", ") || "(nothing)"}`);
  process.exitCode = 1;
}
