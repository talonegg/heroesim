# M9, follow-on — the owner's player test: a Quest's return and its report, the History's scopes, the Guild in four parts, the Market and the Guildmaster as views

**Objective:** build the owner's nine points from playing M9 (DL-111) before the v1.1 line's
release. These are:
- a Quest's return as one entry, with a report on the Guild's home;
- the History filtered, with a World History beside it and the whole History kept as a debug
  view;
- the Guild view in four parts, Home, Hall, Stores and Treasury;
- the Market and the Guildmaster as views of their own, and the Hall view gone;
- "Age", "Male" and "Female" capitalised;
- every Guildmaster from 21.

M9-S9 (#37) releases the whole as `v1.1.0` afterwards.

**Sessions:** 8–10.5 · **Depends on:** M9-S1 to M9-S8 and DL-110 (`v1.1-dev` at `d476deb`) ·
**Implements:** DL-111 and DL-112.

**Gate:**
- Each of DL-111's nine points is met, and a test drives each through the page's own controls, or
  the CLI's for the words and the age.
- *A Party's return.*
  - It is one entry in the rail and in the player's Guild's History: the band in bold, a line per
    Hero, and the Loot apart.
  - A play that brings a Party home opens Guild › Home at its report, from any view.
  - The report reopens from its entry.
- *The History's scopes* filter as DL-111 item 4 says. The World History takes what DL-112 item 7
  names, and the debug view has every entry.
- *The seven views.*
  - Every view and every one of the Guild's four parts opens at 360px, 820px and 1280px with no
    sideways scroll of the page.
  - The journeys pass through them.
  - Every CLI command's row in M9's §3 is ticked again against its new place.
- *Every Guildmaster is 21 to 45 at the start* under `configVersion` 12. A 50 × 20 sweep is recorded
  against `d476deb`'s, with every difference explained by the ages and the new `questId`s.

**Status:** planned — 2026-09-29 (DL-112). No story has started. The plan waits for the owner's
approval.

## 0. What lands

- **The engine** (M9-F1).
  - The Quest is named on what its return causes.
  - Upkeep's parts and Day are exported.
  - `guildmasterStartingAgeMin` 21, `configVersion` 12.
  - The CLI's words.
- **The navigation** (M9-F2). Seven views: Guildmaster, Guild (Home and Hall; Stores and Treasury
  from M9-F3), Roster, Board, Market, Rankings and History. There is one order at every width, the
  Hall view is gone, and the page's words are changed.
- **Stores and Treasury** (M9-F3).
- **The History's scopes** (M9-F4): the Guilds' filters, the World History and the debug view.
- **A Quest's return and its report** (M9-F5).
- **The close** (M9-F6).
- **Not in the follow-on.**
  - No CLI command is added. The CLI has no Stores, Treasury or World History, and its
    `show history` is unchanged, since the owner asked for the page.
  - Autosave, keyboard shortcuts and C9 stay after M9 (DL-99, DL-108).
  - Random Events stays M10 on v1.2.

**Rules that bind every story.** M9's rules hold unchanged: the web computes no rule (ADR-0007);
the page requests nothing (principle 12, R38); Potential is never rendered; `CONTEXT.md`'s words;
accessibility; tests before code at the seams; green at each boundary.

- *Words.* The Treasury, the Stores, the World History and the Quest report are `CONTEXT.md` terms
  (DL-111 item 11).
- *What is read from the History, and how.*
  - Every figure the Treasury and the report show is read from an event's payload, or from an
    engine function.
  - Nothing groups entries by Turn where an event names what it belongs to (DL-112 item 2).

## 1. Stories

### M9-F1 · The engine: the Quest named on its return, Upkeep's parts and Day, every Guildmaster from 21, and the CLI's words · 1–1.5 sessions · opus

- *The Quest named* (DL-112 item 2).
  - The optional `questId`, in `engine/src/events.ts`:
    - `hero.morale-changed`, with the causes `encounters`, `strong-success` and `roster-death`
      (`engine/src/morale.ts`);
    - `patron.regard-changed` and `guildmaster.regard-changed`, with `quest-success` or
      `quest-failure` (`regardOnQuestResolved`, `engine/src/regard.ts`);
    - `hero.regard-changed`, with `shared-quest` (`regardOnSharedQuest`,
      `engine/src/hero-regard.ts`).
  - The Quest is a participant of each of these, and of `hero.xp-gained`
    (`engine/src/phases/quests-conclude.ts`).
- *Upkeep's parts and Day* (DL-112 item 3).
  - `upkeepParts` goes beside `upkeep()` in `engine/src/selectors.ts`, and `upkeep()` returns its
    total.
  - `nextUpkeepDay` gives the Day, and `phases/guild-state.ts` reads the same rule.
  - Both are exported from the engine's index.
- *Every Guildmaster from 21* (DL-111 item 10).
  - `guildmasterStartingAgeMin` 21, `configVersion` 12 (`engine/src/config.ts`), and the tests
    pinned to 11 move.
  - R8 is amended (`docs/requirements.md`), with a note beside INPUTS-REQUIRED 3.13 and 4.10.
- *The CLI's words.*
  - The usage says "21 to 45" (`cli/src/args.ts`).
  - `renderHero` and `renderGuildmaster` capitalise the Sex values (`cli/src/render.ts`).
- *Scope.* This story touches `engine/`, `cli/`, `harness/` and the docs above. It leaves
  `web/src/views/` alone.

**Acceptance:**

- [ ] The events named above carry `questId`, and the Quest is a participant of them and of
      `hero.xp-gained`. A Level gained by a Party's Hero on the night of the return follows the
      Quest's XP, stated by a test — `phases/quests-conclude.test.ts`, `regard.test.ts`,
      `morale.test.ts`, `hero-regard.test.ts`.
- [ ] Nothing else moves. For the same seed, the History's entries keep their number, order, types
      and every other field; only the new field and participants differ — a test over seeded games.
- [ ] A save written at `d476deb` loads under schema 4, plays on, and adopts `configVersion` 12
      through the rules notice.
- [ ] Both front ends narrate the events as before. Their narration tests over the union pass
      unchanged.
- [ ] `upkeepParts` sums to `upkeep()` for every Guild over seeded worlds. `nextUpkeepDay` is the
      night the Guild-state phase charges Upkeep — `selectors.test.ts`, `phases/guild-state.test.ts`.
- [ ] Setup accepts an age of 21 and refuses 20, with the same refusal as before. Drawn founders,
      replacements and successors span 21 to 45 over 1,000 worlds, and the number of draws is
      unchanged — `create.test.ts`, `generators/guilds.test.ts`.
- [ ] The CLI prints "Male" and "Female", and its usage says 21 to 45 — `cli/src/render.test.ts`,
      `cli/src/main.test.ts`.
- [ ] DL-113 records the choices.

### M9-F2 · Seven views: the Guildmaster, the Guild in parts, the Market; the Hall view gone; one order at every width; the page's words · 1.5–2 sessions · opus

- *The views* (DL-112 item 5).
  - `ViewId` is guildmaster, guild, roster, board, market, rankings and history
    (`web/src/views/section.tsx`, `web/src/app.tsx`).
  - Each view has its title, its "About this view", and a labelled region whose heading takes the
    focus.
- *Navigation* (`views/nav.tsx`, `web/src/styles.css`).
  - The Guildmaster sits at the top of the side navigation. Its label is the player's Guildmaster's
    name, cut with an ellipsis, with "Guildmaster" as its accessible description; before a game it
    reads "Guildmaster".
  - Then come Guild, Roster, Board, Rankings, Market and History.
  - On the phone the bar is Guild, Roster, Board, Rankings and More. More holds Guildmaster, Market
    and History.
- *The Guild's parts.*
  - The Guild view has tabs under its heading: Home and Hall here, Stores and Treasury from M9-F3.
  - The part open is remembered in this browser (`views/remembered.ts`).
  - A view remembered as "hall" opens the Hall part.
- *Moved parts.*
  - The Hall part takes the facility rows and Build from `views/hall.tsx`. The Upkeep sentence
    stays until M9-F3 moves it.
  - The Market view takes Buy and Sell (`views/market.tsx`).
  - The Guildmaster view takes the Guildmaster part (`views/guildmaster.tsx`).
- *Links.* Every link and stop target to a moved part goes to its new place. The Bankruptcy card's
  Sell step opens the Market's Sell.
- *The page's words* (DL-111 item 9).
  - "Age" as a label: the Roster card reads "Rogue · Level 1 · Age 18", and the Hero's page line
    "Age 18 · Male".
  - The Sex values are capitalised on the Hero's page and the Guildmaster view.
  - Ages inside sentences stay lowercase.
- *Scope.* `web/src/views/`, `web/src/app.tsx`, `web/src/styles.css`, `web/e2e/`, and
  `web/src/state/` for the words only.

**Acceptance:**

- [ ] The seven views, in the order above, each open from the navigation with its heading focused
      and `aria-current` set. There is no Hall view — `app.test.tsx`, `views/nav.test.tsx`.
- [ ] The Guildmaster's label is their name, with "Guildmaster" before a game.
- [ ] The phone bar holds Guild, Roster, Board, Rankings and More, with More holding the other
      three. From 600px all seven show.
- [ ] The Guild's tabs work by pointer and by the arrow keys, and the open part is remembered. A
      remembered "hall" opens the Hall part — `views/guild.test.tsx`, `views/remembered.test.ts`.
- [ ] Buy and Sell work from the Market view.
- [ ] Build works from the Hall part.
- [ ] The Guildmaster view shows what the Hall's part did — `views/actions.test.tsx`,
      `views/market.test.tsx`, `views/guildmaster.test.tsx`.
- [ ] Every stop target and name link reaches its new place.
- [ ] The Bankruptcy card's Sell opens the Market's Sell — `views/stop.test.tsx`,
      `views/stops.test.tsx`.
- [ ] "Age" and the Sex values are capitalised where item 9 says, and the sentences keep "age" —
      `state/selectors.test.ts`, `state/world-views.test.ts`, `views/hero-page.test.tsx`,
      `views/roster.test.tsx`.
- [ ] `e2e/support.ts` is changed first. `journey`, `layout` (no sideways scroll at 360, 820 and
      1280), `fast-forward` and `party-and-pool` pass through the new views.
- [ ] DL-114 records the choices.

### M9-F3 · Stores and Treasury · 1.5–2 sessions · opus

Depends on M9-F1 for Upkeep's parts and Day, and on M9-F2 for the Guild's parts.

- *Stores* (DL-112 item 6).
  - `storesView` goes in `web/src/state/`. It lists every Item the Guild owns, from the engine's
    `holdings` and `carriedGear`: the Holding, the gear each Hero on the Roster carries, and the
    consumables and gear with a Party away.
  - The Stores part is one table: Item, Kind, where it is, Quantity, and what a held Item sells
    for.
  - It filters by kind and by where. Names open the Hero's page, and there is a way to the Market's
    Sell.
  - A sentence stands in when the Guild owns nothing.
- *Treasury* (DL-112 item 6).
  - `treasuryView` goes in `web/src/state/`.
  - *What it shows:*
    - the Guild's Wealth;
    - Upkeep's next payment with its Day and its parts;
    - the Bankruptcy floor, and the countdown while below it;
    - the ledger, read from the History by the six categories, newest first and paged, with the
      totals of what is shown.
  - The Treasury part filters by income, expense or both, and by category.
  - Each row gives the Day, what happened (with names that open whom they name), the category and
    the amount.
  - The Upkeep sentence moves here from the Hall.

**Acceptance:**

- [ ] `storesView` matches the engine's holdings for every holder: an Item on a Hero away, a
      consumable with a Party, a stack held in two places, and a unique Item —
      `state/stores.test.ts`.
- [ ] The Stores part gives the table, filters it and opens a Hero's page from a name. It shows its
      sentence when the Guild owns nothing — `views/stores.test.tsx`.
- [ ] The ledger misses nothing. Over seeded games, the Guild's Wealth at the start plus the sum of
      its ledger is its Wealth now, for the player's Guild and a Rival —
      `state/treasury.test.ts`.
- [ ] Each category takes exactly its events. A Transfer fee counts against the Guild it goes to
      and for the one it leaves, and a failed Quest's nil reward gives no row.
- [ ] Upkeep's figures are `upkeepParts`' and `nextUpkeepDay`'s, and the countdown shows only
      while the Guild is below the floor.
- [ ] The Treasury part's filters and totals work, and the Hall no longer has the Upkeep sentence —
      `views/treasury.test.tsx`, `views/hall.test.tsx`.
- [ ] A journey step opens Stores and Treasury at a phone's width and a desktop's.
- [ ] DL-115 records the choices.

### M9-F4 · The History's scopes: the Guilds' filters, the World History, the debug view · 1–1.5 sessions · opus

Depends on M9-F2 for the game menu's place and the navigation. It runs beside M9-F3, before
M9-F5.

- *Filters* (DL-111 item 4, DL-112 item 7).
  - In `web/src/state/history.ts`, the player's Guild leaves out `hero.xp-gained`,
    `hero.morale-changed`, the three `*.regard-changed`, `guild.upkeep-paid`, `item.bought` and
    `item.sold`.
  - A Rival leaves out `guild.upkeep-paid`, `item.bought` and `item.sold`.
  - Folding, paging, the count and "New" work on what is left.
  - The rail (`railView`, `web/src/state/digest.ts`) uses the player's Guild's filter.
- *"The world"* is a scope beside "Your Guild" and each Rival's, with the events DL-112 item 7
  names. It is grouped by Day and time of day, with no folds.
- *The debug view.*
  - "The whole History" leaves the History's choices.
  - The game menu's "Debug: the whole History" opens every entry, unfiltered and unfolded, with its
    event type.
  - The search still finds anyone in the whole History.

**Acceptance:**

- [ ] The player's Guild's and a Rival's History leave out exactly the types named. A Hero's, a
      Patron's, a Quest's and a Guildmaster's leave out nothing.
- [ ] No page is ever empty, and the count and "New" count what is shown —
      `state/history.test.ts`.
- [ ] The rail leaves out the same types — `state/digest.test.ts`, `views/rail.test.tsx`.
- [ ] "The world" takes exactly its events, for every Guild. A test game includes a fold, a
      Succession made to happen, a Quest taken and resolved by a Rival, and a Patron's band
      change — `state/history.test.ts`, `views/history.test.tsx`.
- [ ] "The whole History" is not among the choices.
- [ ] The game menu's debug view shows every entry with its type, and folds nothing —
      `views/history.test.tsx`, `views/game-menu.test.tsx`.
- [ ] The World History's entries in a year of a sweep game are counted and recorded in the DL.
- [ ] DL-116 records the choices.

### M9-F5 · A Quest's return: one entry, and its report on Guild › Home · 2–2.5 sessions · opus

Depends on M9-F1 for the `questId`s, M9-F2 for Guild › Home, and M9-F4 for the Guild's scope.

- *The selector.* `questReturn` goes in `web/src/state/`. It reads one return from the History by
  its Party and Quest (DL-112 item 8), and gives:
  - the Quest, its Patron, the Party and the band;
  - the Encounters, in the History's words, with the consumables used;
  - the reward: Wealth, Fame and XP;
  - the Loot;
  - each Hero's outcome: XP; a Level, matched by Hero and night; Morale; an Injury with the Day it
    heals, or a Death; and Regard with Party mates on a band change;
  - the Patron's Regard for the Guild: moved into a new band, or its band now.

  A return from before M9-F1 gives no Morale or Regard lines.
- *The report* is a list of typed sections, in DL-112 item 8's order, drawn on Guild › Home.
  - It takes the "Came home" cards' place, one for each Party home in the last play.
  - An older report opens from its entry, with a way to close it.
- *The entry.* One shape in the rail (`views/rail.tsx`) and the player's Guild's History
  (`views/history-entries.tsx`):
  - the band in bold (`<strong>`) and the reward;
  - a disclosure with a line per Hero;
  - "Open the report".

  The Loot is the next entry, and no Encounter is shown.
- *Where a return opens.*
  - A play in which the player's Party came home, one Turn or a fast forward, opens Guild › Home
    at the report, with its heading focused.
  - "Read it in the History" goes. The Party stop drops "Read what happened", and a module's stop
    keeps it (`views/stop.tsx`, `views/guild.tsx`, `web/src/app.tsx`).

**Acceptance:**

- [ ] `questReturn` gives every part above for:
  - a strong success with a Level;
  - a failure with an Injury;
  - a Death with its gear returned;
  - a Loot;
  - two Parties home the same night for the same Patron, each with its own Regard line;
  - a return from a save made at `d476deb`.

  Tested in `state/quest-return.test.ts`.
- [ ] The report's sections come in order, and one section's absence leaves no gap.
- [ ] The report says the Patron's band moved, or gives it now — `views/quest-report.test.tsx`.
- [ ] The entry is one in the rail and in the Guild's History: the band bold, a line per Hero
      behind a disclosure, the Loot the next entry, and no Encounter —
      `views/rail.test.tsx`, `views/history.test.tsx`.
- [ ] A play that brings a Party home opens Guild › Home at its report, from the Board and the
      History, after one Turn and after a fast forward — `app.test.tsx`, `views/stops.test.tsx`.
- [ ] "Open the report" on an older entry shows it on Guild › Home, and closing it returns to Home —
      `app.test.tsx`.
- [ ] The Party stop has no "Read what happened"; a module's stop keeps it.
- [ ] `e2e/journey.spec.ts` sends a Party, plays it home, reads the report, and opens the entry's
      Heroes, at a phone's width and a desktop's. `fast-forward.spec.ts` stops at the report.
- [ ] DL-117 records the choices.

### M9-F6 · The close · 1 session · opus

- [ ] A code review over the follow-on (`/code-review high`), with every finding fixed test first
      where there is a seam.
- [ ] A 50 × 20 sweep against `d476deb`'s (`34636bfd…d11b`, 134 Rival folds). Every difference is
      explained by the Guildmasters' ages (retirements, Successions, and the Rivals kept by them)
      and by the new `questId`s. It is recorded in `harness/reports/`.
- [ ] Screenshots of every view and every Guild part at 360, 820 and 1280, with no sideways scroll
      and the heights recorded.
- [ ] M9's §3 is ticked again against the new places.
- [ ] Lint, the typecheck, the suite, the bundle gate and every browser spec pass.
- [ ] This epic's boxes are ticked, §4 is corrected, and DL-118 is written.

M9-S9, the release, follows on the owner's go-ahead, with DL-119.

## 2. Configuration, content and events

- `guildmasterStartingAgeMin` 30 → 21, `configVersion` 11 → 12 (M9-F1).
- Events: an optional `questId` on four types, and the Quest a participant of five (M9-F1). No new
  event type.
- Engine exports: `upkeepParts` and `nextUpkeepDay` (M9-F1).
- Content stays at 15 and the save schema at 4.

## 3. The CLI table's rows that move

These rows of M9's §3 are ticked again at M9-F6 against their new places:

| CLI command | In M9's shell | After the follow-on |
| --- | --- | --- |
| `show hall`, `build` | The Hall view | Guild › Hall |
| `show market`, `buy`, `sell` | The Hall view's "Market" and "What the Guild holds" | The Market view, Buy and Sell |
| `show guildmaster` | The Hall view's "Guildmaster" | The Guildmaster view |
| `show roster` | "What the Guild holds" in the Hall | Guild › Stores, for everything the Guild owns |
| `show history [entityId]` | "The whole History" among the choices | "The world" among the choices, and the whole History in the game menu's debug view |
| `new --age` | "Age" (30 to 45) | "Age" (21 to 45) |

## 4. Decision numbers

- DL-111: the owner's nine points and eight answers.
- DL-112: this plan.
- DL-113: M9-F1.
- DL-114: M9-F2.
- DL-115: M9-F3.
- DL-116: M9-F4.
- DL-117: M9-F5.
- DL-118: the close, M9-F6.
- DL-119: the release, M9-S9.

## 5. Risks

- *The browser specs change again.* M9-F2 changes the navigation's order and moves four parts, so
  it changes `e2e/support.ts` first, and the specs keep their journeys.
- *`web/src/state/history.ts` is shared.* M9-F4 and M9-F5 both change it, so they run one after the
  other.
- *The rail is narrow.* A return's entry, with its drill-down, has to fit a column shown from
  1100px. M9-F5's screenshots check it.
- *The World History's size.* Every Guild's Quests, taken and resolved, are most of it. It is paged
  by 20, and M9-F4 records a year's count.
- *Succession all but leaves the sweep.* With founders at 21 to 45, only one drawn at 45 reaches 65
  within twenty years. Tests make it happen, and the close says how many the sweep shows.
- *Older saves.* Their returns from before M9-F1 have no Morale or Regard lines. A fixture from
  `d476deb` tests it.
