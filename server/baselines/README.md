# Baselines — llms 2.0.0, before the stack migration

Captured 20 Nov 2026 on commit `c3b7ecb`, the last commit before any library
swap. Every later step of the migration is judged by diffing against these.

The standing rule for this work is **never worse on any axis**, and that is
only checkable against a recorded before. The point of this folder is that
"it still seems fine" is not evidence.

| File | Script | Cost | What it pins |
|---|---|---|---|
| `tune-floor.txt` | `npm run tune-floor` | free | hit@1 / hit@3 / rows / off-topic precision across eight cosine floors |
| `calibrate-gate.txt` | `npm run calibrate-gate` | free | the pre-LLM gate's derived thresholds and score distribution |
| `measure-actions.txt` | `npm run measure-actions` | free | per-destination action scores and the separation around 0.78 |
| `check-starters.txt` | `npm run check-starters` | free | that all 14 chips still resolve to corpus sections |
| `retrieve.txt` | `npm run retrieve -- "<q>"` ×15 | free | the exact context block and **cosine scores** per golden question |
| `query.txt` | `npm run query-baseline` | ~2¢ | the real HTTP path: grounded documentIds, chunk counts, actions |
| `coverage.txt` | `npm run coverage` | ~6¢ | ANSWERED / THIN / DECLINED across the 50-question interview battery |

## Why `retrieve.txt` carries the most weight

It records cosine scores to three decimals. The migration's biggest
answer-quality risk is that a newer embedding runtime re-embeds queries at
cosine 0.998–1.000 against bins embedded by the old one, while four
thresholds sit inside that drift: the retrieval floor 0.70, actions 0.78,
suggestion dedupe 0.82, and the gate's 0.003 ambiguity band. A near-tie
flipping is invisible in a pass/fail check and obvious in a score diff.

## `query.txt` is a smoke test, not a gate

Four runs of *identical* code produced different files. The chunk count
moves, and so does the exact set of cited documents — "how big was your team
at Heali?" cited `stories|heali_early_team` in three runs and only
`career|heali_ai` in the fourth. The model decides how many chunks to write
and what to attribute, so a one-document difference between two runs is
noise, not a regression.

So that question now accepts either document, and the script exits non-zero
only on a miss that is neither documented nor flaky. Judge a migration step
by the deterministic instruments — `retrieve.txt`, `tune-floor.txt`,
`calibrate-gate.txt`, `measure-actions.txt` — and use `query.txt` to catch
something that actually broke.

This is worth knowing before the migration rather than during it: a single
post-swap run showing one fewer citation would otherwise look like evidence
of embedding drift, and it is not.

## Two anomalies in `query.txt`, both expected

Neither is a defect, and both must still look the same after the migration —
if either changes, something real changed.

1. **"tell me about a time you failed" → `stories|heali_launch_that_kept_slipping`**,
   where the golden set labels `stories|heali_overbuilt_before_validating`.
   Both documents exist and both are genuine failure stories; the label names
   one valid answer and the engine grounds in the other. This is the same
   near-tie that `tune-floor.txt` reports as hit@1 80% / hit@3 93%.

2. **"what are you looking for in a role?" shows no sources.** It is a
   starter, so it returns the *preloaded* answer and never reaches
   retrieval — the server logs it as `intent: "starter", sources: ["preloaded"]`
   in 0 ms. The harness counts "no grounded documentId" as a miss; here that
   is the correct behaviour being measured, not a miss.

## How `query.txt` was captured

`scripts/query-baseline.js` owns the server as a child process and
restarts it if it dies, because something on this machine SIGTERMs a
long-lived `node app.js` about a minute in. It also **refuses to measure a
corpus that is not 61 documents**: the first attempt silently measured
another project's 4-document server that had taken port 3002/3099, and
reported a flat 0/15. A baseline that can measure the wrong process is worse
than no baseline, so the identity assertion is part of the harness.

Each question is sent from its own `X-Forwarded-For`, because the per-IP
guard allows 15/hour and the set is 19 questions. The server trusts one
proxy hop, so that is the real path, not a bypass.

## Re-running after a migration step

```
npm --prefix server run tune-floor      > server/baselines/tune-floor.txt
npm --prefix server run calibrate-gate  > server/baselines/calibrate-gate.txt
npm --prefix server run measure-actions > server/baselines/measure-actions.txt
npm --prefix server run check-starters  > server/baselines/check-starters.txt
npm --prefix server run query-baseline  > server/baselines/query.txt
npm --prefix server run coverage        > server/baselines/coverage.txt
```

Diff, don't skim. `query-baseline` marks the two documented deviations `~`
and exits non-zero only on an *undocumented* miss, so it is usable as a gate.
`retrieve.txt` has no single command; the fifteen on-topic golden questions
were run one at a time and concatenated.

Keep these files as the 2.0.0 record. When a step is accepted, write the new
numbers beside the old ones in `server/DEPLOY.md` rather than overwriting
this folder — the value is in being able to see drift accumulate across the
whole migration, not just against the previous step.
