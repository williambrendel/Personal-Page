# Stories to write

Ordered by measurement, not estimate. Last reconciled against the corpus on
**17 Nov 2026** with `npm run coverage` — a 50-question executive battery run
through the real `engine.ask()`: **32 answered, 12 thin, 6 declined**.

Format: use `story_template.md`. Keep sections under 150 words so each embeds
as one vector. Write headers as the question a visitor would type — the header
is retrieval signal, not something a reader sees.

---

## Read "thin" carefully — it is usually not a missing story

THIN means the answer had only one grounded section behind it. That is more
often a *phrasing* miss than a gap. Measured 17 Nov 2026, with
`heali_overbuilt_before_validating` already in the corpus:

| the question asked | where that story ranked |
|---|---|
| "Tell me about a time you failed. What's your biggest mistake?" | **rank 2**, score 0.945 |
| "Tell me about a time a major project failed under your watch. How did you handle it?" | **absent from all 23 candidates** |

Same story, same corpus, same floor. Everything scores in a narrow 0.66–0.96
band, so the qualifiers "major project" and "under your watch" were enough to
drop the right document out of the candidate set entirely.

Ruled out as the cause, so nobody spends a day re-testing them:

- **Section depth.** `iscribe_azure_or_aws` is the densest file in the corpus
  at 170 words per section and still reads thin.
- **The retrieval floor.** The band just under 0.70 is noise — for the
  psychological-safety question, a section about the *server architecture*
  sits at 0.675. Lowering the floor admits junk.
- **Damaged vectors.** `npm run verify` passes; the manifest matches.
- **Query segmentation.** Both phrasings split cleanly into two segments.
- **Failed augmentation.** That file has 32.3 vectors per section, inside the
  corpus band of 25–42, so its variants were generated normally. They just
  did not happen to include that phrasing.

**The fix that worked.** Add the paraphrase to the heading, in the house style
of packing variants into one header — see `iscribe_azure_or_aws.md` and
`snap_beauty_score_filter.md`. One heading edit plus one re-ingest took that
story from absent to **rank 1 (0.913)** and left the original phrasing at rank
2. No new material, three model calls.

Why it works is worth knowing, because it makes the fix predictable: the
heading is embedded as the section's breadcrumb row, so words you put in it
become retrieval signal directly. It does not depend on the augmentation
model deciding to generate that paraphrase — and in this case it did not
generate one. Putting the phrasing in the heading is the deterministic lever;
augmentation is the opportunistic one.

**It has one trap, and it is silent.** `CONFIG.STARTERS` in
`server/config.js` names its sections by `file.md#Exact heading text`, so
renaming a heading breaks every `from` reference to it — the chip keeps
working but quietly loses its preloaded answer and falls back to the engine,
slower and vaguer. Eight of the fourteen starters are assembled from more
than one section, so the odds of hitting this are good. Editing that one
heading broke the "A time I failed" chip, and `npm run check-starters`
caught it immediately. **Rename a heading, then run check-starters before
you do anything else**, and update the `from` entries it names.

So before writing anything below, check whether it already exists under
another phrasing:

```
npm run retrieve -- "<the question, worded the way a stranger would>"
```

---

## Already in the corpus (17 stories)

| File | Answers |
|---|---|
| `apple_offer_and_google` | career choices, turning down an offer |
| `heali_early_team` | early/small team, realigning priorities |
| `heali_letting_someone_go` | letting someone go, the human side, what changed |
| `heali_nutrition_engine` | favourite project, a bet on hard data |
| `heali_overbuilt_before_validating` | failure, biggest mistake, a project that failed |
| `how_i_became_a_pm` | moving from research to product |
| `how_i_ended_up_in_ai` | the path into AI |
| `iscribe_azure_or_aws` | hardest technical call, staying put |
| `iscribe_outage_night` | a decision under severe time pressure, incident response |
| `iscribe_tech_debt_tradeoff` | hard tradeoff, prioritisation |
| `iscribe_turnaround` | proudest achievement |
| `kelley_building_and_jensen_huang` | formative encounters |
| `leaving_big_tech_for_heali` | big tech to founding |
| `onboarding_my_own_director` | onboarding a senior/executive hire |
| `snap_beauty_score_filter` | disagreement, ethical concern, pushing back |
| `told_id_never_make_it` | being underestimated, core expertise challenged |
| `youtube_shipping_past_politics` | organisational politics, controversial decision, disagreeing upward |

Written since this file was last updated, and therefore dropped from the tiers
below: **firing someone** (`heali_letting_someone_go`) and **a production
incident** (`iscribe_outage_night`).

---

## Tier 1 — measured gaps, nothing in the corpus at all

These six are the questions the coverage run **declined**: no grounded section
exists, and the model correctly refused to invent one. Four of the six are
people management, which is the single biggest hole in an otherwise strong
executive corpus.

### 1. Identifying, grooming and retaining high-potential talent
**Declined 17 Nov 2026.** Prompts:
- Who is someone you spotted early, and what did you see before others did?
- What did you actually *do* for them — scope, exposure, air cover, a hard
  conversation?
- What did you do that failed to retain someone you wanted to keep?

### 2. Rewarding and recognising high performers beyond compensation
**Declined.** Prompts:
- A specific thing you gave someone that mattered more than money.
- What do you do when you have no budget and no title to hand out?
- Where does public recognition backfire?

### 3. A high performer who was toxic to peers
**Declined.** The question every hiring panel asks and almost nobody has a
real answer to. Prompts:
- What was the behaviour, and how did you first hear about it?
- How long did you tolerate it, honestly, and what did that cost the team?
- What did you say to them, and what happened next?

### 4. Mediating a dispute between HR and a business unit leader
**Declined.** Prompts:
- What was the disagreement actually about underneath the stated positions?
- Whose side were you on, and did you say so?
- What did you have to give up to land it?

### 5. Failing to meet a major deadline or KPI, and rectifying it
**Declined.** Distinct from `heali_overbuilt_before_validating`, which is a
strategy misjudgement rather than a missed commitment. Prompts:
- What was the commitment, to whom, and by when?
- When did you know you would miss it, and how did you tell them?
- What did you change so it did not happen twice?

### 6. Re-engineering an inefficient process from scratch
**Declined.** The .NET 4 → .NET 8 migration appears as a *fact* in
`career/iscribehealth.md` but has never been written as a story. Prompts:
- What was the process before, and what did it cost in time or money?
- What did you have to stop doing to make room for the rewrite?
- What were the numbers after?

### 7. Disagreeing upward — CEO, board, or investor
Partially covered: `youtube_shipping_past_politics` answers disagreeing with
*senior leadership*. The board/investor version is still missing, and it is a
different question. Prompts:
- What were you asking them to do, and what did it cost them to say yes?
- What did you do when they said no?

### 8. A hire that did not work out
Adjacent to `heali_letting_someone_go`, but that story is about the exit.
This one is about the decision that led there. Prompts:
- What did you believe about them at offer stage that turned out wrong?
- What would have shown you that in the interview?

---
## Tier 2 — strong coverage gains

### 9. Raising the $4M at Heali
"How do you fundraise?", "What was hardest about raising?" — what nearly
killed the round, and what changed the outcome.

### 10. Winding down or pivoting Heali
"Tell me about something that didn't work out", "How do you know when to
stop?" — the hardest kind of story to tell and the most credible.

### 11. A technical bet that paid off
"Tell me about a risk you took" — what you were betting on, who disagreed.

### 12. A technical bet that didn't
"What's a technical decision you regret?" — how long before you admitted it.

### 13. 100fps on mobile at Amazon A9
"Tell me about a hard technical constraint" — the one story that shows depth
rather than management.

### 14. Running 40+ concurrent projects at Snap
"How do you manage at scale?", "How do you prioritize across a portfolio?"

### 15. The first pen test at iScribeHealth
"Tell me about a compliance or security challenge" — what the findings were
and how you triaged 100% of the high-severity ones.

### 16. A great hire
"Who's the best person you've hired?" — what you saw that others missed.

### 17. Build vs buy
"How do you decide build vs buy?" — a specific decision, not the principle.

### 18. Saying no to a customer or to sales
"How do you handle pressure from the business?"

---

## Tier 3 — depth once Tier 1 and 2 exist

19. Inheriting a team in bad shape
20. Managing managers vs. managing ICs
21. M&A technical due diligence at Snap
22. The Blue Cross Blue Shield partnership
23. Feedback that changed how you work
24. Something you were wrong about for a long time
25. A skill you had to learn late
26. Losing a key person and what you changed
27. Promoting someone into a role they weren't ready for
28. Cross-functional conflict — product vs. engineering

---

## Perspective pieces still missing

Shorter than stories. Use `perspective_template.md`.

- [ ] What you look for when hiring engineers
- [ ] How you evaluate an AI product idea
- [ ] Research vs. product — how you decide what ships
- [ ] Build vs. buy vs. wait
- [ ] How you approach compliance without killing velocity
- [ ] What changed going from big tech to founding
- [ ] How you think about AI agent reliability

## Logistics still missing

- [ ] Location and remote preferences
- [ ] Company stage and size you work best at
- [ ] What you are NOT interested in
- [ ] Availability and notice period
- [ ] Compensation expectations (or a deliberate deflection)

---

## How to work through this

1. **Check it is really missing**: `npm run retrieve -- "<the question>"`.
   Free. If the material is there under another phrasing, the fix is a heading
   variant, not a new story — see the top of this file.
2. Write it with `story_template.md`, then
   `npm run ingest -- stories/<file>.md`.
3. `npm run check-starters` — free, and it catches a renamed heading that
   quietly drops a chip back to the engine.
4. `npm run coverage` — about six cents, and it is the only one of these that
   measures whether a question can actually be *answered*. `tune-floor`
   measures retrieval, which is a different thing: it cannot tell you a
   question has no material behind it.
