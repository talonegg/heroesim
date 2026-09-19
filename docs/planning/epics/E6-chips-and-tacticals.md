# E6 — Chips and Tacticals

**Objective:** Rarely, a Party sends word and waits — the one place the player's attention snaps back mid-Commission  
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

```toml
id = "the-guide-wants-more"
name = "The guide wants more"
weight = 3
tags = ["wilds", "escort"]

[conditions]
min_beat = 2
tags = ["escort"]

[slots]
hero = "highest:Guile"

prompt = "Word comes back with a runner. The guide has stopped at the ford and will not go on for what was agreed. {hero} asks what to do."

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

- [ ] `Content` gains `decisions: DecisionDef[]`; `validateContent` rejects a Decision with no `turnBack` option, no `default`, or more than one `default`
- [ ] Narrative tokens in `prompt` and `label` resolve through the same filler Vignettes use, and an unknown token is a validation error
- [ ] Every `Consequence` kind valid in a Vignette is valid in an option, including E5's `rivalRegard`
- [ ] Three starter Decisions ship, covering press-on, pay-your-way-out and turn-back
- [ ] A Decision whose `requires.min_coin` the Guild cannot meet is offered but not selectable, and the engine refuses it by id

### E6-S2 · Firing, stopping and the pending state · 1 day

- A Decision is considered at each Beat Day after the first, once per Commission: `party.decisionUsed` gates it
- Selection mirrors Vignette selection exactly — conditions, then weight — and a Commission with no eligible Decision simply never stops
- When one fires, the Beat for that Day is **not** resolved; `party.pendingWord` is set, `PartyAwaitingWord` is emitted, and `advance` returns having simulated up to and including that Day
- While any Party awaits, `advance` returns immediately with no events and the Day unchanged. It does not throw: a front end ticking the clock is not making an error
- `advanceUntilAttention` treats an awaiting Party as attention

**Acceptance:**

- [ ] At most one `PartyAwaitingWord` per Commission across 200 seeds, asserted by counting
- [ ] `advance(career, 1000)` terminates with a Party awaiting, having advanced zero Days after the stop
- [ ] The Beat displaced by the Decision fires on the Day the Party is answered, so `beatCount` is honoured
- [ ] `PartyAwaitingWord` carries option **ids** only; a test asserts no event payload anywhere in the engine contains a space
- [ ] Two Parties can await simultaneously and are answered independently
- [ ] `pendingWord` round-trips through save and load, and a loaded Career resumes awaiting

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

- [ ] `answerParty` with an unknown party, an unknown option, or a Party that is not awaiting throws `EngineError`
- [ ] Turning back pays pro rata and a table test pins the fee for scores 0, 1 and 3 of 4 Beats
- [ ] Turning back means no further Beats, therefore no further harm (E3) — a test asserts a Hero cannot be injured after turning back
- [ ] The timeout fires on the exact Day and emits `PartyAnswered` with `byDefault: true`
- [ ] `PartyAnswered` is emitted for a player answer too, so narration reports what was chosen either way
- [ ] Answering is deterministic: the same Career and option produce the same continuation

### E6-S4 · Both front ends · 0.5 day

- CLI: an awaiting Party is the loudest thing on the screen. The prompt, the options with their costs, and a single keypress to answer. The Days remaining and the coin balance stay visible
- `narrate` gains a `Paragraph` kind for the prompt and one for the answer, so E8 needs no extra work

**Acceptance:**

- [ ] `Paragraph.kind` gains `'word'` and `'answer'`; the existing kinds are unchanged
- [ ] The CLI refuses to advance while a Party awaits, and says which Party and for how long it has waited
- [ ] An option the Guild cannot afford is shown greyed with its cost, not hidden
- [ ] The timeout is visible: the CLI prints how many Days remain before the default is taken

---

## 2. Definition of done

- [ ] Decisions are content; adding one changes no engine file
- [ ] The engine carries no prose: `PartyAwaitingWord` carries ids and costs, and nothing else
- [ ] A Career never deadlocks — the timeout guarantees `advance` over any number of Days terminates
- [ ] At most one Decision per Commission, proven by counting across the 200-seed smoke run
- [ ] Turning back is a real choice: cheaper in harm, dearer in fee and Patron Regard, and a played Career uses it at least once
- [ ] Saves from E5 load; a Party without `pendingWord` or `decisionUsed` takes the defaults
- [ ] Architecture §3, §4, §6, §7 and §9 updated in the same change; the Decision TOML shape is added beside the Vignette one

---

## 3. Known unknowns — adopted defaults

| Question | Adopted default | Change it if |
| --- | --- | --- |
| When can a Decision fire (INPUTS 7.1) | Mid-Commission, after the first Beat, 20% per Beat, at most one per Commission | A 3-Beat Commission stops too often, or a 5-Beat one never does |
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
decisionChancePerBeat: 0.2        // considered after the first Beat only
decisionsPerCommission: 1         // a cap, not a target
wordTimeoutDays: 5
turnBackTravelDays: 1
turnBackPaysProRata: true         // false ⇒ turning back pays nothing
```

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

interface PendingWord {
  decisionId: string
  beatIndex: number
  askedOn: number
  timesOutOn: number
  slots: { heroId: string; patronId: string; sphereId: string; trait?: string }
  optionIds: string[]                                   // only those whose requires are met
}

interface CareerLedger { wordsSent: number; turnedBack: number }
```

### Events

```ts
| { type: 'PartyAwaitingWord'; day; partyId; commissionId; decisionId: string; beatIndex: number;
      timesOutOn: number; options: { id: string; kind: 'pressOn' | 'sendCoin' | 'turnBack'; cost?: number;
                                     affordable: boolean }[];
      slots: { heroId: string; patronId: string; sphereId: string; trait?: string } }
| { type: 'PartyAnswered'; day; partyId; decisionId: string; optionId: string; byDefault: boolean }
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
