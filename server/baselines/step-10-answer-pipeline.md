# Step 10 — the answer page's server side moves into llms 2.8.0

`server/server/{engine,starters,actions,log,history}.js` became bindings over
`@williambrendel/llms/pipelines/answer`. 1,041 lines deleted, 174 added — a net
867 lines gone, and most of what stays is the prose explaining why the thing
works the way it does.

The library release merges this app's copies with Pagebeat's, so "it is our code,
extracted" was a claim to check rather than accept. Nothing below is taken from
the library's own test suite or from the Libraries session's benchmarks; every
number is from this corpus, on this machine, before and after.

## What was verified, and how

### history — 923 comparisons, 0 differences

The Libraries session reported `pipelines/rag/history` as "byte-identical" to
ours. It is not: 274 lines differ. It is a rewrite with options, hoisted string
constants and manual loops in place of `map`/`some`.

Since these are pure functions, the rewrite was tested rather than read: both
implementations ran over 28 queries against 21 history shapes — control
characters, non-breaking spaces, 5,000-character questions, empty and missing
`q`, 30-turn transcripts, `null` and numeric fields. Every input the server can
actually receive produced identical output.

They diverge only on a non-string *query*, where ours threw `TypeError` and the
library returns safely. `resolveQuery` in app.js admits only a non-empty trimmed
string, so that path was unreachable. The library is the more defensive of the
two, for free.

### actions — 1.22e-15 drift against a 0.014 margin

This was the risk worth taking seriously, because the threshold has almost no
room in it. On `scripts/measure-actions.js`'s 23 queries the lowest true match
scores 0.783 and the highest near miss 0.769: the entire decision margin is
0.014 wide. "I'd like to book 30 minutes" sits 0.003 above the line; "What's on
your resume for 2019?" 0.011 below it. Anything moving scores by a hundredth
would change what visitors are offered.

So all three inputs to the decision were compared, not just the arithmetic:

- the library's four `CONTACT_ANCHORS` sets are **byte-identical** to the ones
  this app declared,
- its threshold is the same `0.78` and its cap the same `2`,
- it sums with a four-accumulator dot product where we used a plain loop.

Across 28 queries the largest score difference was **1.22e-15** — thirteen
orders of magnitude inside the margin, and three better than the 1e-12 the
Libraries session estimated from their own tests. `measure-actions` output after
the swap is byte-identical to before, separation line included.

The library also fixes a defect this app had: a failed `warm()` was cached
forever, so one transient embedding failure at boot meant no buttons for the
life of the process.

### starters — byte-identical across 14 entries and 248 sections

Both implementations were built in one process and compared directly:
every starter entry, and then `sectionFor`, `answerFor` and `followUpsFor`
over all 248 sections of all 61 documents. Zero differences anywhere.

The library additionally passes `neverSuggest` into `followUpsFrom`, which this
app did not — so `CONFIG.NEVER_SUGGEST` previously applied to the opening chips
but not to follow-ups offered after an engine answer. Both of its entries are
real section headings in the corpus, so that looked like a live leak. Measured,
it is not: `followUpsFrom` prefers the persisted questions written at ingest
over raw headings, and the gentler paraphrases are what get offered. 0 offences
either way, across all 248 sections. The library's filter is real protection
that is currently dead on this corpus — worth having, not worth claiming credit
for.

### engine — the HTTP path, twice

`npm test` exits 0 with `largest score drift 0.0000` on the golden set, the
manifest verifying, and starters 14/14 — so retrieval is bit-identical, not
merely close.

`query-baseline` (the real HTTP path, 19 questions, ~2¢) was run twice:

| run | on-topic grounded | off-topic ungrounded |
|---|---|---|
| committed baseline, 2026-11-20 | 13/15 | 4/4 |
| after the swap, run 1 | 12/15 | 4/4 |
| after the swap, run 2 | 13/15 | 4/4 |

Run 1 missed on "how do you handle disagreement with your team?", citing
`stories|youtube_shipping_past_politics` instead of `stories|snap_beauty_score_filter`.
That is sampling, not the swap, and the reason is in the golden record: both
documents are retrieved, `snap_beauty_score_filter` scores 0.9655 but
`youtube_shipping_past_politics` holds **three of the top four chunks** at 0.866.
`CONFIG.HAIKU55` sets no temperature, so generation runs at the API default of
1.0. Retrieval was provably unchanged, the prompt file and config are the same,
and history is empty for these queries — so the model's input was identical and
only its sampling differed. Run 2 came back to the committed numbers exactly.

The `calendly` action on "write me a poem about cats" is pre-existing and
present in the committed baseline: it comes from app.js's task-request path, not
from the action classifier.

## Two things that are not improvements, said plainly

**The performance numbers do not matter here.** The Libraries session measured
`actionsFor` 13.0 → 6.7 µs, `pick(3)` 74 → 8.9 µs, and starters memory
704 → 659 KB. Those are real, but `actionsFor` also spends roughly 20,000 µs
embedding the query, so 6 µs is about 0.03% of the call, and 45 KB is noise in a
server process. The case for this swap is 867 fewer lines in one place with
tests around it, not speed.

**No new dependencies.** 152 lockfile entries before and after; the only change
is llms' own version and its `utils` range.

## One deliberate deviation from `npm install`

`npm install @williambrendel/llms@2.8.0` rewrote the range as `^2.8.0`. It was
put back to `~2.8.0`, because the caret is a policy change this step has no
business making: `update-apps` pushes to main unattended when the gate is green,
and a caret would let it adopt an llms *minor* on its own. `0eaa98e Widen llms
to ~2.4.2` shows minors are adopted here by hand, with measurements. That is the
reason this file exists.
