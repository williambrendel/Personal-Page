# Step 8 — the eval scripts now retrieve the way the server does

Measured 20 Nov 2026 on llms 2.2.1, so this isolates the correction from the
version change recorded in `step-3-llms-2.2.1.md`.

`retrieve.js`, `tune-floor.js` and `calibrate-gate.js` each re-implemented
search → unionHits → resolve, and each dropped **every** segment classified
CONVERSATIONAL. The server does not. `shouldSearchSegment` skips a
CONVERSATIONAL segment only when the classifier was confident
(`CONVERSATIONAL >= 0.7`) and searches a weak win defensively, in case a
TECHNICAL or SUPPORT segment was misread.

All three now call the engine's own exported `retrieve`. `calibrate-gate`'s
copy carried the comment "mirroring what runQuery retrieves", which is the
defect stated in its own words.

## How far apart the two rules actually were

Across 23 probe queries: 22 segments, 5 classified CONVERSATIONAL, and the
two rules disagreed on **3**. All three were off-topic queries whose single
segment scored *below* the skip threshold, so the server searches them and
the scripts did not:

| query | CONVERSATIONAL score | server | old script |
|---|---|---|---|
| what's the capital of France? | 0.518 | searches | dropped |
| write me a poem about cats | 0.593 | searches | dropped |
| what is 2 + 2? | 0.535 | searches | dropped |
| what's the weather today? | ≥ 0.7 | skips | dropped |

Only the last one was being filtered for the right reason.

## What changed in the numbers

**On-topic retrieval did not move at all.** `retrieve.txt` over the fifteen
on-topic golden questions is byte-identical, as are `measure-actions` and
`check-starters`. Those queries have no CONVERSATIONAL segments, so both
rules picked the same ones.

**`tune-floor`'s off-topic column was fiction.** It reported that off-topic
questions retrieve nothing, having never searched them:

| floor | hit@1 | hit@3 | rows | offtopic-clean before | after |
|---|---|---|---|---|---|
| 0.30 | 67% | 93% | 12.0 | 100% | **25%** |
| **0.70** | 67% | 93% | 9.5 | 100% | **75%** |
| 0.74 | 67% | 93% | 8.6 | 100% | 100% |
| 0.78 | 67% | 100% | 6.7 | 100% | 100% |
| 0.80 | 73% | 87% | 5.7 | 100% | 100% |
| 0.82 | 73% | 93% | 4.5 | 100% | 100% |
| 0.84 | 60% | 80% | 3.4 | 100% | 100% |
| 0.86 | 80% | 80% | 2.8 | 100% | 100% |

At the production floor, exactly one off-topic query leaks: **"what is 2 + 2?"
retrieves `background|skills` at 0.717** — one row, 0.017 above the floor,
matching on security-and-compliance prose that reads as technical.

**`calibrate-gate` was calibrating against a distribution that did not
exist.** Every off-topic score was a literal `0.000`, because dropping the
only segment hit `!segs.length` and returned zero. The real distribution is
nine zeros and one **0.713**.

The derived thresholds did not move — `minScore` and `goodScore` are still
0.755 — but the reason is now visible rather than accidental:

```
highest off-topic   0.713
goodScore           0.755   <- 0.042 of headroom
lowest answerable   0.756   <- 0.001 above goodScore
```

The gate sits in a 0.043-wide band between two real distributions. It is
correctly placed and it is not comfortable, and it previously looked as
though there were no off-topic signal at all.

## The floor decision: keep 0.70

The audit asked for this to be decided explicitly rather than inherited.

On this golden set **0.74 dominates 0.70** — identical hit@1 and hit@3, about
one row less context per query, and no off-topic leak. It is still the wrong
change to make:

- **The leak is already stopped downstream.** The gate's `minScore` is 0.755
  and the leaked row scores 0.717, which is why the live `/query` run shows
  4/4 off-topic correctly ungrounded. Raising the floor would be defence in
  depth against something already defended.
- **The evidence is fifteen questions.** hit@3 being equal at 0.70 and 0.74
  means none of *these* fifteen has its only good section between the two
  values. A real visitor's phrasing might, and raising the floor sends that
  question to the no-coverage path — a visible failure, traded for an
  invisible one.
- **The saving is negligible.** One row of roughly ten, on a path costing
  about $0.0013 a query.

So: 0.70 stays, now for a measured reason rather than an assumed one. If
context cost ever matters, 0.74 is the candidate and this table is the
evidence — but it should be re-measured against a larger golden set first.

## What this does not fix

`tune-floor` and `calibrate-gate` still judge retrieval alone. Production
runs the gate, the rerank stage and the answer prompt after it, so a row
retrieved is not an answer given — the 2 + 2 leak is the clearest case.
`coverage.js` is the script that measures the whole path, and it already
calls the real `engine.ask()`.
