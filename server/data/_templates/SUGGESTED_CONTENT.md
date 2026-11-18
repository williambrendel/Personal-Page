# Stories to write

Ordered by measurement, not estimate. Last reconciled against the corpus on
**17 Nov 2026** with `npm run coverage` — a 50-question executive battery run
through the real `engine.ask()`. Two runs, same corpus apart from one
heading edit: **32/12/6**, then **33 answered, 10 thin, 7 declined**. The
spread between those two runs is the noise floor of this instrument — read
the declines, not the totals.

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

## One paragraph per heading — and keep a two-part answer in one section

Measured 18 Nov 2026 while writing `heali_launch_that_kept_slipping`, and it
cost three ingests to find, so it is worth reading before writing the next
file.

The first draft had four headings with two or three paragraphs under each.
Each paragraph becomes its own vector, so the two paragraphs of the opening
section took both retrieved slots and the rest of the story never surfaced.
Rewriting it to one paragraph per heading did not fix it either — scores
against "Describe failing to meet a major deadline or KPI. How did you
rectify it?":

| section | score | outcome |
|---|---|---|
| the setup — the launch kept slipping | **0.765** | retrieved |
| reasonable delay vs feature creep | 0.706 | above the floor, cut by the gap rule |
| what it cost, and the fix | 0.670 | below the 0.70 floor |

One row reached the answer prompt, out of three sections that were all about
the right event.

The engine answered from the setup alone and then said, correctly and
damningly, *"I haven't written up how the launch was eventually resolved."*
The rectification was sitting in the file, two paragraphs away.

**Why the obvious fix does not work.** The heading on that second section
already said "How did you rectify it?", word for word from the question, and
it still scored 0.670. The query is split into segments and each is searched
separately — and the segment "How did you rectify it?" is anaphoric. On its
own it has no subject and almost no embedding signal, so it does no retrieval
work at all. Only "Describe failing to meet a major deadline or KPI" does.
**A question that asks two things will be answered by whichever section
matches the first thing**, so the answer to the second has to live in that
same section.

What fixed it: one section, ~170 words, carrying setup → cost → fix as a
single paragraph. `iscribe_azure_or_aws` is the precedent for that length.
The two lesson-shaped headings stayed separate, because they answer genuinely
different questions a visitor would type.

So: **one paragraph per heading**, and if a battery question has two clauses,
put the whole arc under the clause that carries the nouns.

## Already in the corpus (19 stories)

| File | Answers |
|---|---|
| `apple_offer_and_google` | career choices, turning down an offer |
| `heali_early_team` | early/small team, the values a team runs on |
| `heali_letting_someone_go` | letting someone go, the human side, what changed |
| `heali_nutrition_engine` | favourite project, a bet on hard data |
| `heali_overbuilt_before_validating` | failure, biggest mistake, a project that failed |
| `heali_launch_that_kept_slipping` | a missed deadline, a commitment slipped, feature creep |
| `how_i_became_a_pm` | moving from research to product |
| `how_i_ended_up_in_ai` | the path into AI |
| `iscribe_azure_or_aws` | hardest technical call, staying put |
| `iscribe_outage_night` | a decision under severe time pressure, incident response |
| `iscribe_tech_debt_tradeoff` | hard tradeoff, prioritisation |
| `iscribe_turnaround` | proudest achievement |
| `iscribe_wrong_crowd_to_convince` | realigning after a market shift, finding the real buyer |
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

Five of the original nine were written on 18 Nov 2026 from William's own
answers and verified through `npm run ask`:
`heali_launch_that_kept_slipping`, `iscribe_wrong_crowd_to_convince`,
`perspective/growing_people` (covers both the talent and the reward
questions) and `perspective/no_room_for_toxicity`. What follows is what is
actually left.

### 1. Mediating a dispute between HR and a business unit leader — **deliberately left declined**

Asked on 18 Nov 2026; William's answer was "I don't have a personal story
about that", with a generic mediation framework attached as a possible
substitute. **That substitute was not added, and should not be.** The page's
whole claim is that a stranger gets a vetted answer from a person, and
`perspective/ai_slop.md` is William arguing in his own words against work
that is "correct, organised, grammatically sound — and completely hollow".
Publishing competent management advice nobody lived would be that exact
thing, on his own site, under his name. An honest decline costs one question
on a 50-question battery. Getting caught publishing slop costs the premise.

So this stays a decline until there is a real incident to tell. Prompts, for
when there is one:
- What was the disagreement actually about underneath the stated positions?
- Whose side were you on, and did you say so?
- What did you have to give up to land it?

### 2. Re-engineering an inefficient process from scratch

**Still declined.** `retrieve` returns nothing at all for it. The .NET 4 →
.NET 8 migration appears as a *fact* in `career/iscribehealth.md` — "cut
production downtime by 70%" — but has never been written as a story, so it
is the cheapest one left. Prompts:
- What was the process before, and what did it cost in time or money?
- What did you have to stop doing to make room for the rewrite?
- What were the numbers after?

### 3. Disagreeing upward — CEO, board, or investor

Partially covered: `youtube_shipping_past_politics` answers disagreeing with
*senior leadership*. The board/investor version is still missing, and it is a
different question. Prompts:
- What were you asking them to do, and what did it cost them to say yes?
- What did you do when they said no?

### 4. A hire that did not work out

Adjacent to `heali_letting_someone_go`, but that story is about the exit.
This one is about the decision that led there. Prompts:
- What did you believe about them at offer stage that turned out wrong?
- What would have shown you that in the interview?

### A note on the toxic-high-performer entry

`perspective/no_room_for_toxicity.md` answers the question, but it is thin on
lived detail: William's own position is two sentences ("I cut them off. There
is no place for toxicity"), and the reasoning around it is Simon Sinek's
trust-versus-performance matrix, **attributed in the text rather than absorbed
into his voice**. Keep that attribution. If a specific incident ever gets
written up — how long the behaviour was tolerated, what was said, what it
cost the team — it belongs in that file and should push the borrowed framing
into second place.


## Tier 2 — strong coverage gains

### 5. Raising the $4M at Heali
"How do you fundraise?", "What was hardest about raising?" — what nearly
killed the round, and what changed the outcome.

### 6. Winding down or pivoting Heali
"Tell me about something that didn't work out", "How do you know when to
stop?" — the hardest kind of story to tell and the most credible.

### 7. A technical bet that paid off
"Tell me about a risk you took" — what you were betting on, who disagreed.

### 8. A technical bet that didn't
"What's a technical decision you regret?" — how long before you admitted it.

### 9. 100fps on mobile at Amazon A9
"Tell me about a hard technical constraint" — the one story that shows depth
rather than management.

### 10. Running 40+ concurrent projects at Snap
"How do you manage at scale?", "How do you prioritize across a portfolio?"

### 11. The first pen test at iScribeHealth
"Tell me about a compliance or security challenge" — what the findings were
and how you triaged 100% of the high-severity ones.

### 12. A great hire
"Who's the best person you've hired?" — what you saw that others missed.

### 13. Build vs buy
"How do you decide build vs buy?" — a specific decision, not the principle.

### 14. Saying no to a customer or to sales
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
4. `npm run coverage` — about six cents, and the only one of these that
   measures whether a question can actually be *answered*. `tune-floor`
   measures retrieval, which is a different thing: it cannot tell you a
   question has no material behind it.

**Do not A/B a single edit on the coverage total.** There is a model in that
loop, so labels on borderline questions flip between runs. The heading edit
above moved its own question from THIN to ok, and the same run moved
"realigning a team's priorities" from THIN to DECLINED — which was not
caused by the edit: that question still retrieves the same section at the
same 0.722, and the edited story does not appear in its results at all. Its
two rows are simply both weak (the top one, at 0.770, is about family time),
so the model grounded it one run and not the next.

Read the total as a standing inventory, not as an instrument. To tell whether
one change worked, use `npm run retrieve` — it has no model in it and it
returns the same ranking every time.
