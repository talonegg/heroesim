# E6 — Chips and Tacticals

**Objective:** Rarely, a Party sends word and waits — the one place the player's attention snaps back mid-Commission  
**Status:** Built and independently verified 2026-09-20 (DL-23, DL-24)  
**Estimate:** 2–3 days · **Depends on:** E1 · **Implements:** [Design §Time and the loop](../design.md#time-and-the-loop) · **Realises:** ADR-0002, ADR-0008  
**Gate:** A Career in which a Party sends word, is answered "turn back", returns early with a partial outcome, and a second Party's word times out and takes its default

---

## 0. What lands in E6

- **A Decision point:** after the first Beat of a Commission, `config.decisionChancePerBeat` of the time, the Party stops and asks
- **At most one per Commission.** The design's remedy for passivity is *rare* mid-Commission decision points, and rare is a rule, not a hope
- **`advance` stops** and returns `PartyAwaitingWord` carrying the Decision id and its option ids — never their prose
- **`answerParty` resumes.** Press on, turn back, or send coin
- **Turning back** returns the Party early with a partial outcome: the work is not done, but the people come home
- **Decisions are authored content**, `content/decisions/*.toml`, in the same shape and spirit as Vignettes — adding one is writing a file

**Deliberately deferred:**

- More than one Decision per Commission, and Decisions that chain
- Recalling a single Hero rather than the whole Party
- Decisions outside a Commission (between them, the whole game is already a decision point)
- Decisions that change who is on the Party
- A Decision that fires on a specific Beat *result* — conditions read the Commission and the Party, not the last Check

---

## 1. Stories

### E6-S1 · Decisions as content · 0.5–1 day

`content/decisions/*.toml`, one Decision per file, parsed by the `content` package and validated by `validateContent` with the same named-field errors Vignettes get.

`prompt` sits with the other top-level keys and **above** `[conditions]`, because a bare key
written after a table header belongs to that table — written below `[slots]` it would be read
as `slots.prompt` (verified against the real parser; architecture §4 carries the same note).

```toml
id = "the-guide-wants-more"
name = "The guide wants more"
weight = 3
tags = ["wilds", "escort"]

prompt = "Word comes back with a runner. The guide has stopped at the ford and will not go on for what was agreed. {hero} asks what to do."

[conditions]
min_beat = 2
tags = ["escort"]

[slots]
hero = "highest:Guile"

[[options]]
id = "press-on"
kind = "pressOn"
label = "Tell them to go on without the guide."
default = true
consequences = [{ kind = "score", delta = -1 }]
effect = { dc_delta = 1 }

[[options]]
id = "send-coin"
kind = "sendCoin"
label = "Send forty coin up the road."
cost = 40
requires = { min_coin = 40 }
consequences = []
effect = { backing_delta = 1 }

[[options]]
id = "turn-back"
kind = "turnBack"
label = "Bring them home."
consequences = [{ kind = "patronRegard", delta = -1, reason = "came home without finishing" }]
```

Prose lives in `prompt` and `label`, which are content, exactly as Vignette narratives are (ADR-0002 is about the *engine*, not about content files). The engine emits ids; `narrate` resolves them.

**Acceptance:**

- [x] `Content` gains `decisions: DecisionDef[]`; `validateContent` rejects a Decision with no `turnBack` option, no `default`, or more than one `default` (file: `engine/tests/decisions.test.ts`, "refuses a Decision with no turnBack option, naming the field", "refuses a Decision with no default, naming the field", "refuses a Decision with more than one default, naming both"). Three more named-field refusals shipped beside them: a `sendCoin` with no `cost`, duplicate option ids, and — added by the build — a `default` carrying a cost or a `requires`, because the default is what the timeout takes and must be a thing the Guild can always do (DL-23 §3)
- [x] Narrative tokens in `prompt` and `label` resolve through the same filler Vignettes use, and an unknown token is a validation error (files: `engine/tests/decisions.test.ts`, "refuses an unknown token in the prompt and in a label alike" and "refuses {trait} in a prompt that cannot promise the Hero holds it"; `narrate/tests/word.test.ts`, "fills a label for every option the offer carries"). One `checkNarrativeTokens`, one `fillTokens`, one `conditionsHold`, one `pickByWeight` and one `fillHeroSlot` serve Vignettes and Decisions alike — shared, not copied
- [x] Every `Consequence` kind valid in a Vignette is valid in an option, including E5's `rivalRegard` and E6's new `backing` (file: `engine/tests/decisions.test.ts`, "takes every Consequence kind a Vignette takes, including E5's rivalRegard and E6's backing"; the `backing` kind applied and clamped in `engine/tests/answer.test.ts`, "moves it, clamped exactly as a committed Party's is")
- [x] Three starter Decisions ship, covering press-on, pay-your-way-out and turn-back: `content/decisions/{the-guide-wants-more,the-workings-are-wrong,somebody-is-flagging}.toml`, each with all three kinds (file: `content/tests/parse.test.ts`, "ships three Decisions, each offering all three kinds with exactly one default"). They reach the browser bundle unchanged (file: `web/tests/content.test.ts`, whose browser-against-Node deep equality still holds)
- [x] A Decision whose `requires.min_coin` the Guild cannot meet is offered but not selectable, and the engine refuses it by id (files: `engine/tests/word.test.ts`, "is offered, and says so with its cost and the shortfall"; `engine/tests/answer.test.ts`, "throws InsufficientCoin for an option the Guild cannot pay for, and refuses it by id"). `pendingWord.optionIds` holds **every** option rather than E6 §4's "only those whose requires are met", because an option that was never offered cannot be refused by id, and affordability is re-read at the moment of answering — coin moves while a Party waits (DL-23 §8)

### E6-S2 · Firing, stopping and the pending state · 1 day

- A Decision is considered at each Beat Day after the first, once per Commission: `party.decisionUsed` gates it
- Selection mirrors Vignette selection exactly — conditions, then weight — and a Commission with no eligible Decision simply never stops
- When one fires, the Beat for that Day is **not** resolved; `party.pendingWord` is set, `PartyAwaitingWord` is emitted, and `advance` returns having simulated up to and including that Day
- While any Party awaits, `advance` returns immediately with no events and the Day unchanged. It does not throw: a front end ticking the clock is not making an error
  - **As built, this clause is the one E6 gave up, and deliberately (DL-23 §3).** It cannot hold beside §2's "a Career never deadlocks": if `advance` never moves the Day while a Party awaits, `timesOutOn` can never arrive and the default can never be taken. The rule built is that a stretch of Days **stops on** the Day word arrives, having simulated it and not one Day more — which is this story's own acceptance box below — and that the **next** call runs on past it, the awaiting Party standing still while the rest of the world carries on, until the timeout settles it. It still does not throw, so the intent of this clause is kept
- `advanceUntilAttention` treats an awaiting Party as attention

**Acceptance:**

- [x] At most one `PartyAwaitingWord` per Commission across 200 seeds, asserted by counting (files: `engine/tests/decisions.test.ts`, "holds across two hundred seeds, by counting"; and again over 200 played Careers in `engine/tests/e6-gate.test.ts`, "holds every invariant E6 adds, and reports what Decisions actually do")
- [x] `advance(career, 1000)` terminates with a Party awaiting, having advanced zero Days after the stop (file: `engine/tests/word.test.ts`, "stops on the Day the word arrives, having advanced zero Days after it"). Its companion in the definition of done — `advance(career, 10_000)` reaching an ending — is met by the rule DL-23 §3 records: a **later** call does pass Days, so the timeout can arrive
- [x] The Beat displaced by the Decision fires on the Day the Party is answered, so `beatCount` is honoured (files: `engine/tests/answer.test.ts`, "resolves the displaced Beat that Day, so beatCount is honoured" and "resolves the displaced Beat on the Day it fires" for the timeout; `engine/tests/e6-gate.test.ts` checks it over 200 played Careers)
- [x] **Met as amended.** `PartyAwaitingWord` carries option **ids**, kinds, costs and numbers and no prose (file: `engine/tests/word.test.ts`, "carries option ids, kinds, costs and affordability on the event, and nothing else"). The second half **cannot** be written as stated and never could (DL-20 §7, DL-22): names of things in the world and content-authored reasons carry spaces by design. The test written is "no event carries **engine-authored English**, and E6's new events carry ids and numbers only" (file: `engine/tests/e6-gate.test.ts`, "over a fleet of played Careers, except the two that predate E6") — `name`, `guildName`, `trait` and the content-authored `reason` on `RivalRegardChanged` and `ConsequenceApplied` exempt by field; `HeroRegardForGuildmasterChanged.reason` and `PatronRegardChanged.reason` named as a **known exemption** the test asserts it actually saw; and `PartyAwaitingWord`, `PartyAnswered` and `PartyTurnedBack` held to the letter — no string field of theirs contains a space at all, and every Decision and option id is kebab-case. Turning the two exempt fields into ids is its own decision for the owner and is not taken here (DL-23 §12)
- [x] Two Parties can await simultaneously and are answered independently (file: `engine/tests/word.test.ts`, "lets both wait, and answers them independently"; and in the browser, `web/e2e/word.spec.ts`, "answering puts the Party back to work and says so in the Report")
- [x] `pendingWord` round-trips through save and load, and a loaded Career resumes awaiting (file: `engine/tests/word.test.ts`, "round-trips the pending word exactly", "resumes awaiting, and carries on exactly as if it had not been saved", "loads twice to the same bytes")

### E6-S3 · Answering · 0.5–1 day

```ts
answerParty(career, partyId, optionId, content): Step
```

- `pressOn` applies the option's consequences and `effect`, clears `pendingWord`, and the Commission continues
- `sendCoin` deducts `cost` first — refusing with `EngineError('InsufficientCoin')` if it cannot — then behaves as `pressOn`
- `turnBack` ends the Commission on the spot: remaining Beats are skipped, `returnsOn` becomes `day + config.turnBackTravelDays`, and on return `succeeded` is `false` while the fee paid is `round(fee × score / beatCount)` clamped to at least zero
- `effect.dcDelta` raises or lowers every remaining Beat's DC; `effect.backingDelta` adjusts the Party's fixed Backing; `effect.beatsRemainingDelta` lengthens or shortens the run
- A Party left awaiting for `config.wordTimeoutDays` is auto-answered with the `default` option

**Acceptance:**

- [x] `answerParty` with an unknown party, an unknown option, or a Party that is not awaiting throws `EngineError`, and every rejection leaves the Career byte-identical (file: `engine/tests/answer.test.ts`, the four cases under "answerParty refuses what it cannot do, and touches nothing when it does")
- [x] Turning back pays pro rata and a table test pins the fee for scores 0, 1 and 3 of 4 Beats (file: `engine/tests/turn-back.test.ts`, "is the fee scaled by the share of the work done, at four Beats" — 0, 25 and 75 of a 100-coin fee — with "is never below nothing, however badly the work went" and "is what the Party is actually paid on the Day it comes home")
- [x] Turning back means no further Beats, therefore no further harm (E3) (file: `engine/tests/turn-back.test.ts`, "cannot injure, scar or kill anybody after the word goes back" — forty seeds at `injuryChanceOnFailure: 1` and `scarChanceOnCriticalFailure: 1`, so it is not one lucky Career; checked again over 200 played Careers in `engine/tests/e6-gate.test.ts`)
- [x] The timeout fires on the exact Day and emits `PartyAnswered` with `byDefault: true` (file: `engine/tests/answer.test.ts`, "fires on the exact Day, takes the default, and says it was by default")
- [x] `PartyAnswered` is emitted for a player answer too, so narration reports what was chosen either way (files: `engine/tests/answer.test.ts`, "reports the answer, and that it was not taken by default"; `narrate/tests/word.test.ts`, "becomes an answer paragraph carrying the option's own label" and "says plainly when nobody answered and the Party decided for itself")
- [x] Answering is deterministic: the same Career and option produce the same continuation (file: `engine/tests/answer.test.ts`, "gives the same continuation for the same Career and the same option" — all three kinds, compared byte for byte and again sixty Days later — and "never touches the Career it was given")

### E6-S4 · Both front ends · 0.5 day

- CLI: an awaiting Party is the loudest thing on the screen. The prompt, the options with their costs, and a single keypress to answer. The Days remaining and the coin balance stay visible
- `narrate` gains a `Paragraph` kind for the prompt and one for the answer, so E8 needs no extra work

**Acceptance:**

- [x] `Paragraph.kind` gains `'word'` and `'answer'`; the existing kinds are unchanged (file: `narrate/tests/stream.test.ts`, "covers every kind of paragraph the loop can produce", which now names nine and the same seven as before)
- [x] The CLI refuses to advance while a Party awaits, and says which Party and for how long it has waited (files: `cli/tests/display.test.ts`, "names the Party, what they are on, how long they have waited and how long is left"; `cli/tests/e2e.test.ts`, "refuses to advance while a Party waits, and says which and for how long", driving the real process). A **second** `n` lets the Days run, which is the two-keypress idiom insisting has used since E2 and the only way a scripted session reaches a timeout without a back door (DL-23 §3): `cli/tests/e2e.test.ts`, "lets a second n run the Days, and the Party then decides for itself"
- [x] An option the Guild cannot afford is shown greyed with its cost, not hidden — and marked in **text**, because colour is never load-bearing (files: `cli/tests/display.test.ts`, "greys an option the Guild cannot pay for and says so in text, rather than hiding it"; `web/tests/word.test.tsx`, "disables an option the Guild cannot pay for, with the reason in text and its cost still shown"; `web/e2e/word.spec.ts` on all three device projects, with `docs/verification/<project>/word.png` as the evidence)
- [x] The timeout is visible: the CLI prints how many Days remain before the default is taken, and which option it will be (file: `cli/tests/display.test.ts`, "shows the Days waited, the Days left and the coin the Guild holds" and "marks which option is taken if nobody answers, in words"). The web client says the same in its header cue and on each card (`web/tests/word.test.tsx`)

---

## 2. Definition of done

- [x] Decisions are content; adding one changes no engine file — a Decision is a TOML file under `content/decisions/`, read by the pure entry and the Node entry alike (file: `content/tests/parse.test.ts`, "carries no top-level key the validator would silently drop" over the Decision files, and the browser-against-Node equality in `web/tests/content.test.ts`)
- [x] The engine carries no prose: `PartyAwaitingWord` carries ids, kinds, costs and numbers and nothing else (file: `engine/tests/e6-gate.test.ts`, "over a fleet of played Careers, except the two that predate E6"). The prompt and the labels are filled by `narrate`'s `wordProse`, from content
- [x] A Career never deadlocks — the timeout guarantees `advance` over any number of Days terminates (file: `engine/tests/e6-gate.test.ts`, "reaches an ending from a Career with a Party awaiting, over ten thousand Days", "terminates under advanceUntilAttention called over and over, unanswered", and "leaves every automatic policy written before Decisions unedited and still finishing"). This and E6-S2's "advance returns immediately with no events and the Day unchanged" are in tension as written, and DL-23 §3 records how it was resolved: a stretch stops **on** the Day word arrives; the **next** stretch runs on
- [x] At most one Decision per Commission, proven by counting across the 200-seed smoke run (file: `engine/tests/e6-gate.test.ts`). Measured over 200 played Careers at the adopted 20%: **0.476 words per Commission**, which is inside E6 §5's own brake of one per two Commissions — reported, not tuned. **The balance pass then tuned it** (DL-24 §B2): the brake sat a hair under a line it was always going to sit a hair under, and "rarely" is what the design asks for. At the shipped 10% the same fleet measures **0.266** and the authored content under a sensible player measures **0.210**, one Commission in 4.8
- [x] Turning back is a real choice: cheaper in harm, dearer in fee and Patron Regard, and a played Career uses it at least once (files: `engine/tests/turn-back.test.ts` for the harm and the fee; `engine/tests/e6-gate.test.ts`'s gate turns a Party back on a fixed seed, and its 200-Career smoke turns back 5,752 Commissions). The balance harness measures what it costs at fleet scale: a policy that turns back a third of the words it is given reaches Retirement on **5.0%** of Careers against **24.2%** for one that never answers at all, so calling work off is emphatically not free (DL-23's Consequences)
- [x] Saves from E5 load; a Party without `pendingWord` or `decisionUsed` takes the defaults (file: `engine/tests/word.test.ts`, "loads with the defaults, and a Party already away can still be asked", which strips E6's five config fields, both ledger counters and both Party fields from a played document and asserts every fill — and that a Party committed before the rule existed can still be asked, which is DL-23 §13)
- [x] Architecture §3, §4, §5, §6, §7, §9 and §10 updated in the same change; the Decision TOML shape is added beside the Vignette one, with the note that `prompt` sits above `[conditions]` because a bare key after a table header belongs to that table

---

## 3. Known unknowns — adopted defaults

| Question | Adopted default | Change it if |
| --- | --- | --- |
| When can a Decision fire (INPUTS 7.1) | Mid-Commission, after the first Beat, **10%** per Beat, at most one per Commission. Adopted at 20%, lowered by the balance pass once it was measured: 20% compounded to about one Commission in two and a half, which is not "rarely" (DL-24 §B2) | A 3-Beat Commission stops too often, or a 5-Beat one never does |
| What the options do (INPUTS 7.2) | Three kinds — `pressOn`, `sendCoin`, `turnBack` — with numeric `effect`s | A fourth kind is wanted. It is a closed vocabulary owned by the engine, exactly as Consequence kinds are (DL-03) |
| Are these the FPL sense of "Chips"? | No. The epic keeps the name from the plan, but the thing is a Decision: a moment, not a once-per-season token. There is no inventory of Chips | The owner wants consumable one-shot abilities, which is a different epic |
| What happens if nobody answers? | The `default` option is taken after 5 Days | The default is doing the player's thinking for them too often |
| Does turning back count as a failure? | Yes, `succeeded: false`, but it pays pro rata and skips the remaining harm | Turning back becomes either free or unthinkable |
| Can a Decision fire on the last Beat? | Yes, and pressing on then resolves it immediately. Turning back then pays nearly the whole fee | It reads as a formality |
| Do Decisions respect Regard or Traits? | Only through `conditions.requiresTrait` and the slot Hero, as Vignettes do | A Decision needs to know who refuses — which is E2's question, asked at commitment |

---

## 4. Technical notes — exact engine additions

### `GameConfig`

```ts
decisionChancePerBeat: 0.1        // considered after the first Beat only; 0.2 as adopted,
                                  //   lowered by the balance pass (DL-24 §B2)
decisionsPerCommission: 1         // a cap, not a target
wordTimeoutDays: 5
turnBackTravelDays: 1
turnBackPaysProRata: true         // false ⇒ turning back pays nothing
```

**As built (DL-23 §6):** `turnBackPaysProRata` is a **number**, `turnBackFeeFactor` (default 1).
Every `GameConfig` field is one — `deserialiseCareer` requires it, `cloneCareer` copies the
config with a spread, and `--config key=value` can only set a number — and a factor
generalises the boolean rather than merely encoding it: the fee paid is
`max(0, round(fee × turnBackFeeFactor × score / beatCount))`, so 1 is `true`, 0 is `false`,
and anything between is a half-measure the balance pass can reach for.

### Content

```ts
interface DecisionDef {
  id: string; name: string; weight: number
  tags: string[]
  conditions: { minBeat?: number; maxBeat?: number; spheres?: string[]; requiresTrait?: string; tags?: string[] }
  slots: { hero: 'any' | `with_trait:${string}` | `highest:${Stat}` | `lowest:${Stat}` }
  prompt: string                                        // prose; filled by narrate
  options: DecisionOption[]
}

interface DecisionOption {
  id: string
  kind: 'pressOn' | 'sendCoin' | 'turnBack'
  label: string                                         // prose; filled by narrate
  cost?: number                                         // coin, required for sendCoin
  requires?: { minCoin?: number }
  default?: boolean                                     // exactly one per Decision; taken on timeout
  consequences: Consequence[]
  effect?: { backingDelta?: number; dcDelta?: number; beatsRemainingDelta?: number }
}

interface Content { decisions: DecisionDef[] }          // addition
```

Conditions, slots and weight are deliberately the same shape as `Vignette`'s, so the existing selector serves both and a content author learns one language.

### State

```ts
interface Party {                                       // additions
  decisionUsed: boolean
  pendingWord?: PendingWord
  dcDelta: number                                       // accumulated from effects; 0 by default
  turnedBackOn?: number
}
//   As built: `decisionUsed` stays the flag it is here and `decisionsPerCommission` is read
//   as a gate rather than a counter — 0 switches Decisions off for a whole Career and 1 is
//   the cap — because more than one per Commission is §0's own deferred item (DL-23 §7).

interface PendingWord {
  decisionId: string
  beatIndex: number
  askedOn: number
  timesOutOn: number
  slots: { heroId: string; patronId: string; sphereId: string; trait?: string }
  optionIds: string[]                                   // only those whose requires are met
}
//   As built: `optionIds` holds **every** option the Decision offers, in authored order. An
//   option that was never offered cannot be "offered but not selectable, and refused by id"
//   as E6-S1's own acceptance box requires; and coin moves while a Party waits, so
//   affordability is worked out fresh by `wordOffers` and enforced by `answerParty` rather
//   than frozen here (DL-23 §8).

interface CareerLedger { wordsSent: number; turnedBack: number }
```

### Events

```ts
| { type: 'PartyAwaitingWord'; day; partyId; commissionId; decisionId: string; beatIndex: number;
      timesOutOn: number; options: { id: string; kind: 'pressOn' | 'sendCoin' | 'turnBack'; cost?: number;
                                     affordable: boolean }[];
      slots: { heroId: string; patronId: string; sphereId: string; trait?: string } }
| { type: 'PartyAnswered'; day; partyId; commissionId; decisionId: string; optionId: string;
      byDefault: boolean; slots: { heroId: string; patronId: string; sphereId: string; trait?: string } }
//   `commissionId` and `slots` are two fields more than sketched here, for the reason
//   `ApplicantDeclined` carries a name (DL-19): the option's `label` is authored prose with
//   the same tokens a prompt has, and `pendingWord` is cleared by the time this is read, so
//   nothing else is left to fill them from (DL-23 §11).
| { type: 'PartyTurnedBack'; day; partyId; commissionId; beatsResolved: number; beatCount: number }
```

`PartyAnswered` is not in the brief's list and is added deliberately: the timeout needs a fact to report, and narration must be able to say what was chosen without the front end remembering. `PartyReturned` is unchanged — a Party that turned back returns through it with `succeeded: false` and the pro-rata `feePaid`, so every consumer of returns already handles it.

`CoinChanged.reason` gains `'sendCoin'` under the widening rule in [E3 §4](E3-injuries-and-scars.md#4-technical-notes--exact-engine-additions).

### Consequence

One new kind, so an option's `effect` and a Vignette's outcome speak one vocabulary:

```ts
| { kind: 'backing'; delta: number }      // adjusts the committed Party's fixed Backing
```

### Engine API

```ts
export function answerParty(career: Career, partyId: string, optionId: string, content: Content): Step
//   throws EngineError('NoSuchParty' | 'NotAwaitingWord' | 'NoSuchOption' | 'InsufficientCoin' | 'CareerEnded')
export function awaitingParties(career: Career): Party[]
export function advance(career, days, content): Step            // now returns early on PartyAwaitingWord
export function advanceUntilAttention(career, content, maxDays?): Step   // awaiting counts as attention
```

---

## 5. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Decisions stop being rare and the game becomes a prompt machine | Two independent brakes: 20% per Beat *and* a hard cap of one per Commission. The smoke run counts them; if the mean exceeds one per two Commissions, the chance drops |
| `advance` deadlocks on an unanswered Party | The timeout, and a test that calls `advance(career, 10_000)` on a Career with an awaiting Party and asserts it reaches an ending |
| A front end forgets to check for an awaiting Party and silently stalls | `advance` returning zero events with the Day unchanged is detectable, and both front ends assert on it. The CLI test drives an unanswered Party to its timeout |
| Turning back becomes the correct answer to everything | It forfeits most of the fee and costs Patron Regard, and the Commission still counts as failed in the ledger. Watch the turn-back rate in a played Career |
| Decision content duplicates Vignette content and the two drift | They share the condition shape, the slot language, the selector and the token filler. Only `outcomes` versus `options` differ |
| The name "Chips" misleads a later reader into building an inventory | Recorded in §3 and in the decision log: these are Decisions; there is no Chip inventory, and the file name is historical |

> **Where those tests are now.** E7 restructured the terminal front end and its suite (DL-25, DL-26): `cli/tests/display.test.ts` became `cli/tests/views.test.ts`, `layout.test.ts` and `screen.test.ts`, the screens that ask for a confirming keypress became `cli/tests/confirm.test.ts`, and `cli/tests/saves.test.ts` became `cli/tests/slots.test.ts`. Every assertion cited above moved with the code it covers; none was dropped.
