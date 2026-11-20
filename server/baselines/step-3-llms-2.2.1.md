# Step 3 — llms 2.0.0 (git tag) → @williambrendel/llms 2.2.1 (GitHub Packages)

Measured 20 Nov 2026 against the 2.0.0 baselines in this folder. The 2.0.0
files are left untouched on purpose; this is the diff.

The headline: **the embedding runtime changed** (`@xenova/transformers` 2.17
→ `@huggingface/transformers` 4.3.2, `onnxruntime-node` 1.14 → 1.30) while
the vector bins stayed exactly as they were. So queries are now embedded by
a newer runtime than the corpus was, which is the drift the baselines exist
to measure. The bins were not regenerated: Sonnet augmentation is
non-deterministic and re-ingesting in the same step would have confounded
the comparison.

## The deterministic instruments

| Instrument | Result |
|---|---|
| `check-starters` | **byte-identical** — 14/14 still resolve |
| `calibrate-gate` derived thresholds | **identical** — minScore and goodScore both 0.755, and all four percentages unchanged |
| `measure-actions` | **0 missed, 0 false positives**, unchanged. Separation was (0.770, 0.783), now (0.769, 0.783) |
| `tune-floor` **at the production floor of 0.70** | **identical** — hit@1 67%, hit@3 93%, 9.5 rows, off-topic 100% clean |
| `tune-floor` at floors we don't use | moves: hit@1 73%→67% at 0.78, 80%→73% at 0.82, 67%→60% at 0.84 |

`CONFIG.RETRIEVAL.floor` is 0.70, so the only row of that sweep which
describes production is the one that did not move. The movement at 0.78 and
above is real and worth knowing before anyone raises the floor — it is no
longer true that 0.82 buys a better hit@1 than 0.70 does.

## Cosine drift, the thing most likely to bite

Fifteen golden questions, scores compared row by row:

- **largest single score change: 0.008** (`what would you do in your first 90 days?`, row 2)
- **rows that crossed the 0.70 floor: 0**
- **queries whose ranking moved: 1 of 15**
- 11 of 15 moved by ≤0.002; 4 moved by 0.006–0.008

The audit predicted ≤0.002. The real figure is four times that, still far
inside the floor's margin, but worth recording as the measured number rather
than the expected one.

### The one ranking change

`where do you see healthcare AI going?` — the fourth retrieved row changed:

| | 2.0.0 | 2.2.1 |
|---|---|---|
| row 4 | `perspective\|ai_for_good` at 0.788 | `perspective\|future_of_healthcare_ai` at 0.782 |

This is precisely the near-tie flip the README warned about: two documents
six thousandths apart, and the re-embedding reordered them. Both sit well
above the floor, and the new fourth row is *more* on topic for that question
than the one it replaced. Not a regression — but it is the mechanism, so if
answer quality ever drifts after a runtime change, this is where to look.

## Footprint, memory and boot

| | 2.0.0 | 2.2.1 |
|---|---|---|
| packages installed | 262 | **126** |
| `npm audit` | advisories needing review | **0 vulnerabilities** |
| boot (3 cold starts) | 1.1–2.8s | 2.2–3.6s |
| `/health` rss | 173–388 MB observed | 127–252 MB observed |

The first boot after the swap took 8.4s and then settled; that was the new
runtime's cold file load, not a regression. **The rss figures are too noisy
to claim a win** — both ranges are wide and depend on when the sample is
taken relative to GC. It is not worse, and that is all the measurement
supports.

## Two risks from the audit, both real, both now handled

1. **`xenova/env.js` configures the runtime inside an async IIFE.** Importing
   it for side effects only *schedules* that work. Before 2.1 it happened to
   land first by microtask order, which is luck. Every entry point now awaits
   the exported `ready` before the first model touch.
2. **`XENOVA_ALLOW_REMOTE_MODELS` defaults to `"true"`.** A file missing from
   `.model_cache` would be downloaded at boot on a 1 GB t4g. `config.js` now
   pins it to `false` when `NODE_ENV=production`, so a missing file fails the
   health check and the old release keeps serving. Left unlocked elsewhere,
   because `npm run ingest` and a new machine legitimately need to fetch once.

## The deploy path

The private dependency is no longer a git tag, so the git URL rewriting in
`ship.sh` and `deploy.yml` is gone, along with `.github/scripts/library-tokens.sh`.
`server/.npmrc` points the scope at GitHub Packages and expands
`NODE_AUTH_TOKEN`; the token is never written to a file. The same
`LLMS_READ_TOKEN` secret is reused, so there is nothing for the operator to
re-create — what it needs is `read:packages` rather than repo read, and
`ship.sh` now preflights against the registry instead of the repo API,
because a token with only repo read used to pass the old check and then fail
inside the container.

Verified in a cold arm64 container: with `NODE_AUTH_TOKEN`, `npm ci`
installs `@williambrendel/llms` 2.2.1 and `utils`; without it, the registry
answers `E401 unauthenticated` and the install refuses. (A first attempt at
that negative control was invalid — it reused a container whose npm cache
the positive run had already warmed, so it never contacted the registry.)

**Not yet verified:** a full `ship.sh` run. `--check` stops before the
build and needs a clean tree on `main`, so the end-to-end deploy is still
unproven and should be watched on its first run.

## Not done here

Steps 4–11 of the audit are untouched: config onto llms presets, utils/io in
the scripts, dropping the `LLMS_SRC` hack in `follow-ups.js` (its comment
still claims `buildFollowUps` is unpublished, which is now false), server v3,
the eval scripts onto `runQuery.retrieve`, and `actions.js` onto
`createActionModel`.
