# Heroesim v2 — design principles

Each principle names what goes wrong without it. When two principles conflict, the earlier one
wins. Established 2026-09-24; see [`requirements.md`](./requirements.md) for what they apply to.

## 1. Engine first; story where it matters

Build a robust, measurable mechanical engine. Narrate sparingly: a Quest's outcome is a report,
not a short story. Story arrives through modules (Scenarios, Campaigns, Contacts) at the
moments designed to carry it.

*Without it:* every Quest gets a paragraph, the writing runs dry within a weekend, and the
engine's rules bend to serve prose that nobody reads twice.

## 2. Growth is the pull

Every system must feed one of the five pulls: managing the Guild, growing a young Hero,
harder and richer Quests, Loot, and later Campaigns. A mechanic that feeds none of them is
cut, however elegant.

*Without it:* the game accretes systems that are fun to build and dull to play.

## 3. Reproducible by seed

The engine takes a seeded random source and an explicit clock. A game is reproducible from its
seed and the player's choices. Cosmetic randomness lives in the front end.

*Without it:* a bug from a save cannot be replayed, and the harness measures noise instead of
the difference between two rules.

## 4. Every Guild is a Guild

The player's Guild and every Rival are the same type with a different controller. No rule may
ask "is this the player's?".

*Without it:* every operation grows a special case, the ones that forget it are the bugs, and
the door to other players' Guilds as Rivals is shut.

## 5. Typed events plus state, never prose

The engine returns the new World State and the typed events that explain it. Turning events
into English is the front end's job.

*Without it:* the front end diffs two states and guesses why, tests assert on strings, and a
second front end is a rewrite.

## 6. Content over code

Classes, Stats, Skills, Synergies, Items, Quest templates, events and dispositions are data
files with conditions. The engine matches conditions and applies effects; adding content never
changes it.

*Without it:* every new Class or Synergy is an engine change, and the engine's shape freezes
around the first twenty Stats.

## 7. Modules plug in; the core runs with none

A module registers with the World Engine, owns a slice of World State and is called at defined
phases of a Turn. Campaigns, Scenarios and Contacts are modules. The core is a complete game
without them.

*Without it:* "later" never comes, because every story feature lands inside the core and the
core stops being measurable.

## 8. Every tunable is a named, defaulted configuration field

A literal balance number in rules code is a defect.

*Without it:* the balance pass is a hunt through source, and no two harness runs are
comparable.

## 9. Measured before tuned

A harness with an automatic policy plays many seeded games and reports counters. A rule is
tuned against those counters, not against a feeling from one playthrough.

*Without it:* balance drifts with the owner's mood and the last game played.

## 10. A rhythm the player can learn

Three Turns a Day with fixed duties: Board and Market in the morning, Quests every Turn,
healing, Morale and ageing at night, and Random Events at night once that module exists. The
engine stops fast forward when a decision is needed.

*Without it:* fast forward is unsafe, and the player cannot plan.

## 11. Nothing significant is forgotten

The History inside the World State keeps every engine event and every Milestone, unbounded. A
Hero's page is their History. Every discrete change — a Quest's outcome, an Injury, a Level, a
Transfer, a purchase — is an event. A nightly drift toward a baseline (Morale, training XP,
Regard decay) is a rule of the configuration, not an event; it is recorded when it crosses a
band, and is otherwise recomputable from the events that bound it. Two discrete changes are
named exceptions, recorded in the same way only when they cross a band: a change of Regard made
by the core's own rules, and the Morale a Transfer costs the Heroes who stay. A module's change
of Regard is not exempt and always appends an entry (amended 2026-09-28, DL-84; the module rule
is to be built; the owner's decision, where the agents recommended that the Transfer's Morale
cost always be recorded).

*Without it:* the Hero the player grew for ten years is a row of numbers.

## 12. Single player, siloed, zero running cost

Each player has their own World State and local saves. No server, player account, network
call or paid dependency; a hosting account that serves static files at zero running cost is
allowed.

*Without it:* the engine gains a deployment, a login and a bill before it has a game.

## 13. Vocabulary is binding

`CONTEXT.md` defines the terms and the words to avoid. Code, documents and the UI use them
exactly. A term that turns out wrong is changed in the glossary first.

*Without it:* Quest, Mission and Commission become three types for one thing.

## 14. Reversible by default, recorded when not

Prefer the reversible choice. A decision that is hard to reverse, surprising later and the
result of a real trade-off gets an ADR before it is implemented.

*Without it:* the next reader "fixes" the deliberate thing.
