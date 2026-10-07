# M9, follow-on — the owner's player test: a Quest's return and its report, the History's scopes, the Guild in four parts, the Market and the Guildmaster as views

**Objective:** build the owner's nine points from playing M9 (DL-111) before the v1.1 line's
release. These are:
- a Quest's return as one entry, with a report on the Guild's home;
- the History filtered, with a World History beside it and the whole History kept as a debug
  view;
- the Guild view in four parts, Home, Hall, Stores and Treasury;
- the Market and the Guildmaster as views of their own, and the Hall view gone;
- "Age", "Male" and "Female" capitalised;
- every Guildmaster 21 to 50 at the start and retiring at 61, with the page saying when (DL-113).

M9-S9 (#37) releases the whole as `v1.1.0` afterwards.

**Sessions:** 8.5–11 · **Depends on:** M9-S1 to M9-S8 and DL-110 (`v1.1-dev` at `d476deb`) ·
**Implements:** DL-111, DL-112 and DL-113.

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
- *Every Guildmaster is 21 to 50 at the start and retires at 61,* under `configVersion` 12.
  - The setup form and the Guildmaster view say when.
  - A 50 × 20 sweep, with the player's Guildmaster at 30, is recorded against `d476deb`'s. Every
    difference is explained by the ages, the Successions and the new `questId`s.
  - A Succession probe, a Rival Guildmaster at 50 over 12 years, is recorded.

**Status:** built and verified on `v1.1-dev` — 2026-09-30 (DL-119). Every box of M9-F1 to M9-F6 is
ticked and the gate is met. *Amended 2026-09-30 (DL-120):* the owner's answers on the close add
M9-F7, built before the release. *Released 2026-09-30 as `v1.1.0` (DL-123).* The release, M9-S9 (#37), is DL-123, deployed from CI (DL-122), and follows on the owner's
steps. *M9-F7 is built and its boxes ticked* — 2026-09-30 (DL-121), on its branch.
*Approved as amended 2026-09-29 (DL-112, DL-113); built on the owner's word the same day (DL-114 to
DL-118), and closed by M9-F6 (DL-119).*

## 0. What lands

- **The engine** (M9-F1).
  - The Quest is named on what its return causes.
  - Upkeep's parts and Day are exported.
  - Every Guildmaster 21 to 50, retiring at 61, `configVersion` 12; a Guildmaster's Retirement Turn
    exported.
  - The harness's player at 30, and the Succession probe's option.
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
  - Moving gear from one Hero to another in one step, from Stores, is later work, a candidate for
    v1.2 (DL-113 item 2).
  - Nothing is built for older saves beyond what exists (DL-113 item 3).

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

### M9-F1 · The engine: the Quest named on its return, Upkeep's parts and Day, every Guildmaster 21 to 50 and retiring at 61, the harness's ages, and the CLI's words · 1.5–2 sessions · opus

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
- *Every Guildmaster 21 to 50, retiring at 61* (DL-113 item 4).
  - In `engine/src/config.ts`: `guildmasterStartingAgeMin` 21, `guildmasterStartingAgeMax` 50,
    `guildmasterRetirementAge` 61, and `configVersion` 12.
  - The tests that pin them move: the three pinned to `configVersion` 11, `endings.test.ts`'s
    Retirement at 65, the Guild generator's range, and the five literal "30 to 45"s.
  - R8 is amended (`docs/requirements.md`), with a note beside INPUTS-REQUIRED 3.13 and 4.10.
- *A Guildmaster's Retirement Turn* (DL-113 item 5).
  - A function beside `ageOf` gives the Turn on which a Guildmaster reaches
    `guildmasterRetirementAge`.
  - `endingOf` (`engine/src/phases/endings.ts`) reads the same rule, and the engine's index exports
    it for the page.
- *The harness's ages* (DL-113 items 6 and 7).
  - `harnessSetup` sets `guildmasterAge` to 30 (`harness/src/creation.ts`).
  - A Succession probe option sets the first Rival's Guildmaster, in id order, to 50 at founding,
    and reports as DL-113 item 7 says.
- *The CLI's words.*
  - The usage says "21 to 50" (`cli/src/args.ts`).
  - `renderHero` and `renderGuildmaster` capitalise the Sex values (`cli/src/render.ts`).
- *Scope.* This story touches `engine/`, `cli/`, `harness/` and the docs above. It leaves
  `web/src/views/` alone.

**Acceptance:**

- [x] The events named above carry `questId`, and the Quest is a participant of them and of
      `hero.xp-gained`. A Level gained by a Party's Hero on the night of the return follows the
      Quest's XP, stated by a test — `phases/quests-conclude.test.ts` ('the Quest named on what its
      return causes (M9-F1)': "each event of a Quest's return carries its questId and names the
      Quest; the other causes name none", "a Level a Party's Hero gains on the night of the return
      follows the Quest's XP: away, they trained for none"), `regard.test.ts` ("names the Quest on
      each crossing, for the Patron, a Hero and the Guildmaster's Guild alike (M9-F1, DL-112 item
      2)", 'emits patron.regard-changed only on a band crossing, naming the Patron, the Guild and
      the Quest (M9-F1)'), `morale.test.ts` (new: 'a change a Quest caused carries its questId, and
      the Quest is a participant', 'a change nothing named a Quest for carries no questId…'),
      `hero-regard.test.ts` ('emits hero.regard-changed only for a change that crosses a band, one
      for each Hero whose Regard crossed, naming the Quest (M9-F1)', 'two Heroes after ten shared
      successful Quests are close…') (DL-114 item 1)
- [x] Nothing else moves. For the same seed, the History's entries keep their number, order, types
      and every other field; only the new field and participants differ — a test over seeded games:
      `phases/quests-conclude.test.ts` ('nothing else moves: the same seed gives the History of
      86c7afa, entry for entry, but for the new field and participants', three seeds of 120 Days
      pinned to fingerprints recorded at `86c7afa`; 'the games hold every type and Quest cause
      named…'; 'a History written before M9-F1, with neither, still validates and loads')
      (DL-114 item 2)
- [x] Both front ends narrate the events as before. Their narration tests over the union pass
      unchanged: `cli/src/narrate.test.ts` and `web/src/state/narrate.test.ts` are untouched and
      green.
- [x] `upkeepParts` sums to `upkeep()` for every Guild over seeded worlds. `nextUpkeepDay` is the
      night the Guild-state phase charges Upkeep — `selectors.test.ts` ("upkeepParts and
      nextUpkeepDay (M9-F1)": four tests, among them 'sums to upkeep() for every Guild over seeded
      worlds, played a season'), `phases/guild-state.test.ts` ('Upkeep is charged on the night of
      nextUpkeepDay from every Turn before it, and on no other night') (DL-114 item 3)
- [x] Setup accepts ages 21 and 50 and refuses 20 and 51, with the same refusal as before. Drawn
      founders, replacements and successors span 21 to 50 over 1,000 worlds, and the number of
      draws is unchanged — `create.test.ts` ('accepts ages 21 and 50, the ends of the range, and
      refuses 20 and 51 with the refusal it gave before…'; "the founders' ages, 21 to 50, over
      1,000 worlds (M9-F1)": each world is the one drawn under 30 to 45 but for the ages),
      `generators/guilds.test.ts` ("replacements' and successors' span 21 to 50 over a thousand
      draws each") (DL-114 item 4)
- [x] A Guildmaster founded at 50 retires on the first night they are 61, the Turn the new function
      gives. A Rival's is succeeded then, and the player's ends the game —
      `phases/endings.test.ts` ('Retirement at 61, on the Turn retirementTurn gives (M9-F1)': four
      tests, the mid-game successor among them), `time.test.ts` ('retirementTurn': four tests)
      (DL-114 item 5)
- [x] Every sweep game's player's Guildmaster is 30. The Succession probe, over a few seeds, shows
      one Succession for each game whose first Rival is still in play at 61 —
      `harness/src/creation.test.ts` ("the harness's player's Guildmaster, 30": two tests),
      `harness/src/succession.test.ts` (seven tests, among them 'shows one Succession of the first
      Rival for each game whose Rival is still in play at 61, on the Turn retirementTurn gives')
      (DL-114 items 6 and 7)
- [x] The CLI prints "Male" and "Female", and its usage says 21 to 50 — `cli/src/render.test.ts`
      ('the Sex values, capitalised (M9-F1)'), `cli/src/main.test.ts` ("help gives new's ages as
      the rules do: 21 to 50, retiring at 61 (M9-F1, DL-113 item 4)", 'refuses %s…' for 20 and 51)
      (DL-114 item 8)
- [x] DL-114 records the choices.

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
- *When the Guildmaster retires* (DL-113 item 5).
  - The setup form's Age field says "Retires at 61", from the config.
  - The Guildmaster view gives the Retirement, its Day and the years left, from M9-F1's Retirement
    Turn.
- *Scope.* `web/src/views/`, `web/src/app.tsx`, `web/src/styles.css`, `web/e2e/`, and
  `web/src/state/` for the words only.

**Acceptance:**

- [x] The seven views, in the order above, each open from the navigation with its heading focused
      and `aria-current` set. There is no Hall view — `app.test.tsx` ('opens on the home view, with
      the seven views in the navigation in order…', 'opens every view from the navigation…');
      `views/nav.test.tsx` ('holds the seven views in one order…', 'each of the seven opens from the
      navigation with its heading focused and aria-current set').
- [x] The Guildmaster's label is their name, with "Guildmaster" before a game —
      `views/nav.test.tsx` ("the Guildmaster's label is the player's Guildmaster's name…", 'before a
      game, the label reads "Guildmaster"'); `styles.test.ts` (the ellipsis);
      `state/selectors.test.ts` (`headerView`'s `guildmasterName`); `e2e/layout.spec.ts` (a long
      name, its accessible name and description).
- [x] The phone bar holds Guild, Roster, Board, Rankings and More, with More holding the other
      three. From 600px all seven show — `views/nav.test.tsx` ('on a phone the bar holds…');
      `e2e/layout.spec.ts` ('every view and the game menu…', the labels shown at each width). More
      carries a dot while the History has new entries (DL-115 item 8) — `views/nav.test.tsx` ('what
      More holds that is new').
- [x] The Guild's tabs work by pointer and by the arrow keys, and the open part is remembered. A
      remembered "hall" opens the Hall part — `views/guild.test.tsx` ("the Guild's parts (M9-F2)",
      six tests); `views/remembered.test.ts` (four tests).
- [x] Buy and Sell work from the Market view — `views/actions.test.tsx` ('the Market', four tests);
      `views/market.test.tsx` (Buy and Sell as tables, Sell's sentence when nothing is held).
- [x] Build works from the Hall part — `views/actions.test.tsx` ('the Hall', two tests, through
      Guild › Hall); `views/hall.test.tsx`.
- [x] The Guildmaster view shows what the Hall's part did — `views/guildmaster.test.tsx` (two
      tests); `views/world.test.tsx` ('the Guildmaster and the Patrons').
- [x] Every stop target and name link reaches its new place — `views/stops.test.tsx` (the
      Bankruptcy card's Sell); `views/guild.test.tsx` (the status bar's countdown and the end of a
      fast forward open Guild › Home); `views/history.test.tsx` (the Guildmaster's "Read their
      History", from the Guildmaster view).
- [x] The Bankruptcy card's Sell opens the Market's Sell — `views/stop.test.tsx` ("goes to the
      Market's Sell, and to the Board…"), `views/stops.test.tsx` ("goes to the Market's Sell…");
      `e2e/fast-forward.spec.ts`.
- [x] "Age" and the Sex values are capitalised where item 9 says, and the sentences keep "age" —
      `state/selectors.test.ts` ('says who the Hero is in one line…'), `state/world-views.test.ts`
      ('gives the Sex capitalised, and the Age as a label'), `views/roster.test.tsx` (the Roster's
      cards, and the Hero's page line in 'a Hero's page'; the page's own tests,
      `views/hero-page.test.tsx`, hold Potential and did not need the words).
- [x] The setup form says "Retires at 61". The Guildmaster view gives the Retirement's Day and the
      years left, read from the engine — `state/selectors.test.ts`, `views/new-game.test.tsx`,
      `views/guildmaster.test.tsx`.
  - *The setup form's half is built:* "Retires at N", N `guildmasterRetirementAge` (65 on this
    branch, 61 once M9-F1 merges) — `state/selectors.test.ts` ("gives the age a Guildmaster retires
    at…"), `state/setup.test.ts`, `views/new-game.test.tsx` ('when the Guildmaster retires');
    `e2e/journey.spec.ts`.
  - *The Guildmaster view's half* was moved to M9-F3 by the orchestrator (it needs M9-F1's
    Retirement Turn). DL-115 item 11 records it. *Built in M9-F3* (DL-116 item 12):
    `guildmasterView`'s `retirement`, from the engine's `retirementTurn` —
    `state/world-views.test.ts` ("the Guildmaster's Retirement, read from the engine's
    retirementTurn": five tests, among them 'gives when it will come, in the calendar’s words, and
    the years left' and 'says it came, once the night has been played'),
    `views/guildmaster.test.tsx` ("gives the Guildmaster's Retirement: its Day and the years left,
    read from the engine").
- [x] `e2e/support.ts` is changed first. `journey`, `layout` (no sideways scroll at 360, 820 and
      1280), `fast-forward` and `party-and-pool` pass through the new views — all 60 runs pass at the
      three widths.
- [x] DL-115 records the choices.

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

- [x] `storesView` matches the engine's holdings for every holder: an Item on a Hero away, a
      consumable with a Party, a stack held in two places, and a unique Item —
      `state/stores.test.ts` ("matches the engine's holdings for every holder: the Holding, each
      Hero on the Roster, and each Party away", 'a stack held in two places is a row in each…', 'an
      Item on a Hero away names the Hero, away on the Quest, and a unique Item is a row of one', and
      four more) (DL-116 item 10)
- [x] The Stores part gives the table, filters it and opens a Hero's page from a name. It shows its
      sentence when the Guild owns nothing — `views/stores.test.tsx` (six tests: 'is one table…',
      'filters by kind and by where…', "a Hero's name opens their page", "goes to the Market's
      Sell", "offers no way to the Market's Sell while the Guild holds nothing…", 'says so when the
      Guild owns nothing…') (DL-116 items 10 and 11)
- [x] The ledger misses nothing. Over seeded games, the Guild's Wealth at the start plus the sum of
      its ledger is its Wealth now, for the player's Guild and a Rival —
      `state/treasury.test.ts` ('the ledger misses nothing': three seeds of two years, every
      founding Guild, the player's and each Rival's, and 'the games bring up every category, for
      the player’s Guild and for the Rivals') (DL-116 items 1 and 4)
- [x] Each category takes exactly its events. A Transfer fee counts against the Guild it goes to
      and for the one it leaves, and a failed Quest's nil reward gives no row —
      `state/treasury.test.ts` ('wealthChangeOf: each category takes exactly its events': seven
      tests, among them 'Heroes take a signing fee, and a Transfer fee counts against the Guild it
      goes to and for the one it leaves' and "a Quest's reward is what it paid the Guild, and a
      failed Quest's nil reward gives no row") (DL-116 items 2 and 3)
- [x] Upkeep's figures are `upkeepParts`' and `nextUpkeepDay`'s, and the countdown shows only
      while the Guild is below the floor — `state/treasury.test.ts` ("gives the Guild's Wealth, and
      Upkeep's next payment with its Day and its parts, as the engine reckons them", "names the
      Guildmaster's Traits' factor…", 'gives the Bankruptcy floor, and the countdown only while the
      Guild is below it', 'gives no next payment once the game has ended'); `views/treasury.test.tsx`
      (the first two tests) (DL-116 items 6 and 7)
- [x] The Treasury part's filters and totals work, and the Hall no longer has the Upkeep sentence —
      `views/treasury.test.tsx` (seven tests, among them 'filters by income or expense and by
      category, and totals only what is shown' and 'pages the ledger by 20, from the newest'),
      `state/treasury.test.ts` ("the ledger's filters, totals and pages": five tests),
      `views/hall.test.tsx`, `views/guild.test.tsx`, `state/world-views.test.ts` ('hallView')
      (DL-116 items 5, 8 and 9)
- [x] A journey step opens Stores and Treasury at a phone's width and a desktop's —
      `e2e/journey.spec.ts` (the Stores, then the Treasury with the signing fee in its ledger,
      filtered to expense, at 360, 820 and 1280); `e2e/layout.spec.ts` (each table in its own box,
      no sideways scroll and 44px targets, and every Guild part at each width). All 60 runs pass.
- [x] DL-116 records the choices.

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

- [x] The player's Guild's and a Rival's History leave out exactly the types named. A Hero's, a
      Patron's, a Quest's and a Guildmaster's leave out nothing — `state/history.test.ts` ("the Guilds'
      filters", five tests: every Rival's too, over a game with a purchase, a sale and a Party home);
      `views/history.test.tsx` ("your Guild's History leaves out the Heroes' XP and Morale…"). A Quest's
      History has no page yet: its filter keeps everything (DL-117 item 2).
- [x] No page is ever empty, and the count and "New" count what is shown —
      `state/history.test.ts` ('no page is empty, and every page but the last holds a full page, in the
      filtered Histories', 'the count of new counts only what the filter leaves…', and the pages' count
      tests, now over a Rival's History).
- [x] The rail leaves out the same types — `state/digest.test.ts` ('counts a Party home as its History
      does…', 'leaves out what the Guild's History leaves out…'), `views/rail.test.tsx` (two tests).
- [x] "The world" takes exactly its events, for every Guild. A test game includes a fold, a
      Succession made to happen, a Quest taken and resolved by a Rival, and a Patron's band
      change — `state/history.test.ts` ("the World History", five tests, over `withWorldNews`, the
      Retirement age read from the game's rules), `views/history.test.tsx` ('the world: every Guild's
      news, grouped by Day and time of day, with no folds'); `e2e/layout.spec.ts` (the World History at
      each width).
- [x] "The whole History" is not among the choices — `state/history.test.ts` ('is not among the
      choices; the world is…'), `views/history.test.tsx` ('the choices are your Guild, the world and each
      Rival…').
- [x] The game menu's debug view shows every entry with its type, and folds nothing —
      `views/history.test.tsx` ('the game menu opens the whole History…', 'a choice leaves the debug
      view…'), `views/game-menu.test.tsx` (two tests), `state/history.test.ts` ('shows every entry,
      unfolded, each line with its event type'); `e2e/modules.spec.ts`, `e2e/layout.spec.ts`.
- [x] The World History's entries in a year of a sweep game are counted and recorded in the DL: 2,233
      to 2,677 a year over ten seeds of the harness's policy, about 20% of the History (DL-117 item 8).
- [x] DL-117 records the choices.

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

  Nothing is built for a return from before M9-F1 (DL-113 item 3).
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

- [x] `questReturn` gives every part above for:
  - a strong success with a Level;
  - a failure with an Injury;
  - a Death with its gear returned;
  - a Loot;
  - two Parties home the same night for the same Patron, each with its own Regard line.

  Tested in `state/quest-return.test.ts` ("questReturn (M9-F5)": 'a strong success with a Level…',
  'a failure with an Injury…', 'a Death with its gear returned…', 'a Loot…', 'two Parties home the
  same night for the same Patron…'; with 'a Level is matched by Hero and night (DL-112 item 2)…', the
  test DL-112 asks for, and 'a return the engine played: every part is its History's…') (DL-118 item 1)
- [x] The report's sections come in order, and one section's absence leaves no gap —
      `state/quest-return.test.ts` ("the report's sections", two tests), `views/quest-report.test.tsx`
      ('its sections come in order…', 'a section with nothing to say is not drawn, and leaves no gap…')
      (DL-118 item 2)
- [x] The report says the Patron's band moved, or gives it now — `views/quest-report.test.tsx` ('says
      the Patron's Regard for the Guild moved into a new band with this Quest, or gives its band now')
- [x] The entry is one in the rail and in the Guild's History: the band bold, a line per Hero
      behind a disclosure, the Loot the next entry, and no Encounter —
      `views/rail.test.tsx` ("a Party's return in the rail": 'is one entry…'), `views/history.test.tsx`
      ("a Party's return in the player's Guild's History": 'is one entry…'); `state/digest.test.ts` (the
      rail's entry, its Loot next, its key), `state/history.test.ts` ("…leaves out exactly … and a
      return's parts (M9-F5)", "a return's line carries its entry…") (DL-118 item 4)
- [x] A play that brings a Party home opens Guild › Home at its report, from the Board and the
      History, after one Turn and after a fast forward — `app.test.tsx` ("a Party's return opens its
      report on Guild › Home": 'after one Turn, from the %s…' and 'after a fast forward, from the %s…',
      each from the Board and the History; 'a play that brings no Party home leaves the view where it
      was'), `views/guild.test.tsx` ('the end of a fast forward… at the report of a Party home'). The
      tests are in `app.test.tsx` rather than `views/stops.test.tsx`, beside the shell's other ways in.
      (DL-118 item 5)
- [x] "Open the report" on an older entry shows it on Guild › Home, and closing it returns to Home —
      `app.test.tsx` ('"Open the report" on an older entry shows it on Guild › Home; closing it returns
      to Home', '"Open the report" in the rail shows it on Guild › Home too'), `views/history.test.tsx`,
      `views/quest-report.test.tsx` ('an older report has a way to close it')
- [x] The Party stop has no "Read what happened"; a module's stop keeps it — `views/stop.test.tsx`
      ("a Party's return and a module's stop"), `views/history.test.tsx` ('the rail opens the History…;
      a Party home opens Guild › Home at its report'), `views/world.test.tsx` (a module's stop, unchanged)
- [x] `e2e/journey.spec.ts` sends a Party, plays it home, reads the report, and opens the entry's
      Heroes, at a phone's width and a desktop's (and a tablet's; from 1100px the rail's entry too).
      `fast-forward.spec.ts` stops at the report ("a Party's return stops a fast forward at its Quest
      report on Guild › Home, from the Board") — all 63 browser runs pass.
- [x] DL-118 records the choices.

### M9-F6 · The close · 1 session · opus

- [x] A code review over the follow-on (`/code-review high`, over `86c7afa..v1.1-dev`), with every
      finding fixed test first where there is a seam. Its ten findings and the six carried from the
      stories' reviews are each answered in DL-119 items 1 and 2: the Guildmaster's Retirement as the
      world stands (`time.test.ts` "retiresOn", `phases/endings.test.ts` '… retires on the night
      retiresOn gives', `state/world-views.test.ts`, `views/guildmaster.test.tsx`); Quests tied for
      easiest (`state/selectors.test.ts`); the Board's stepper (`views/board.test.tsx`); Home beside
      the countdown (`views/guild.test.tsx`); the Treasury's factor (`state/treasury.test.ts`); the
      History with no player's Guild (`state/history.test.ts`); and the cleanups, held by the tests
      already there. What was left, and why, is in DL-119 items 1.4, 1.5 and 2.3.
- [x] A 50 × 20 sweep, with the player's Guildmaster at 30, against `d476deb`'s (`34636bfd…d11b`,
      134 Rival folds). Every difference is explained by the Guildmasters' ages (Retirements,
      Successions, and the Rivals kept by them) and by the new `questId`s. It is recorded in
      `harness/reports/`: `m9-follow-on-2026-09-30.md` (`978ddc75…c47741`, 138 Rival folds, 37
      Successions) and `m9-follow-on-comparison-2026-09-30.md`, where 19 seeds' Histories are the same
      with the `questId`s taken out and the other 31 first differ on the Day of their first Succession
      (DL-119 items 4 and 5).
- [x] The Succession probe: a Rival Guildmaster at 50, over 50 seeds × 12 years (DL-113 item 7).
      It is recorded in `harness/reports/`, with what item 7 lists: `m9-succession-2026-09-30.md`, the
      first Rival succeeded in 46 games on Turn 11,882, 4 folded first, none folding in the year after
      (DL-119 item 6).
- [x] Screenshots of every view and every Guild part at 360, 820 and 1280, with no sideways scroll
      and the heights recorded: 51, with the Quest report, the World History, the debug view and the
      new-game form, and the heights in DL-119 item 7. Three things they showed were fixed test first
      in `e2e/layout.spec.ts` (DL-119 item 3).
- [x] M9's §3 is ticked again against the new places: its eight moved rows, "(M9-F6: ticked again)"
      (DL-119 item 8).
- [x] Lint, the typecheck, the suite, the bundle gate and every browser spec pass: 3,416 tests, 63
      browser runs (DL-119 item 9).
- [x] This epic's boxes are ticked, §4 is corrected, and DL-119 is written. §4 needed no correction:
      it already gives DL-119 to the close and DL-120 to the release.

M9-S9, the release, follows on the owner's go-ahead, after M9-F7, with DL-123, deployed from CI (DL-122).

### M9-F7 · The owner's answers on the close · 1 session · opus

Added 2026-09-30 by DL-120, from the owner's answers to DL-119's open questions.

- *Words.* The debug view is "Debug: Whole History": the game menu's button, its heading and the
  back button of a page opened from it (DL-120 item 1).
- *Retirement.*
  - The years left are given in Days once the Retirement is less than a year away (item 2).
  - After another ending or a fold, the line says why none came: "Never retired: the game ended in
    Bankruptcy on Day N." or "Never retired: the Guild folded on Day N." (item 9).
- *The opening balance* (item 4).
  - `guild.founded` gains an optional founding-Wealth field, for every Guild founded.
  - The Treasury's ledger opens with "Founded with N Wealth".
  - The ledger-completeness test covers replacement Rivals.
- *A return in the Guild's History* (item 6). Injuries and Deaths from the Quest stand out as entries
  of their own beside the return's one entry, in the History and the rail, and stay in its Hero
  lines.
- *The report* (item 7). One summary line after the Heroes' outcomes gives the Morale a Death cost the
  Heroes at home, with the names behind a disclosure.
- *Home* (item 8). While the Bankruptcy countdown stands, Home says "Your Guild is below the Bankruptcy
  floor: see the steps above."
- *Tidy-ups* (item 10).
  - `pageOfEntry` and `Scope.indexOf` move into test support.
  - The rail reads a return's Hero lines without building the whole report.

**Acceptance:**

- [x] Each item above is tested at its seam and through the page, and the browser specs pass through
      the new words (DL-121 items 3 to 9).
      - *Words:* `views/game-menu.test.tsx` 'is the last control of the menu…' and "a Hero's page
        opened from it goes back to it by its name…"; `state/history.test.ts` and
        `views/history.test.tsx` (the title); `e2e/support.ts`'s `debugHistory`, read by
        `modules.spec.ts` and `layout.spec.ts`.
      - *Retirement:* `state/world-views.test.ts` 'says "in 1 year" a year or more away, and the Days
        left…', 'says why none came…' and "says why a Rival's Guildmaster never retired…";
        `views/guildmaster.test.tsx` 'says why no Retirement came…' and 'gives the Days left…'.
      - *The opening balance:* `state/treasury.test.ts` "a new game's ledger holds its opening row
        alone…" and 'shows every row, newest first…'; `views/treasury.test.tsx` 'opens with the Wealth
        the Guild was founded with…'; `e2e/journey.spec.ts` (the ledger's last row).
      - *A return in the Guild's History:* `state/quest-return.test.ts` "its Encounters, consumables,
        the dead's gear, and its Heroes' Levels that night…"; `state/digest.test.ts` "gives a Party's
        return as its one entry, the Loot next after it, then its Injuries and Deaths…" and 'counts a
        Party home as its History does…'; `state/history.test.ts` "a page of the player's Guild's
        History that would end on a return's Death runs on to the return…"; `views/history.test.tsx`
        and `views/rail.test.tsx` 'is one entry … its Injury … after it (M9-F7)…'.
      - *The report:* `state/quest-return.test.ts` 'what a Death cost the Heroes at home…', 'the Heroes
        at home: two Deaths cost each twice…' and 'a Hero away with another Party when the Death came
        is not at home…'; `views/quest-report.test.tsx` "after the Heroes' outcomes, one line says what
        a Death cost the Heroes at home…" and 'no line for the Heroes at home when no Hero died'.
      - *Home:* `views/guild.test.tsx` 'Home says the Guild is below the Bankruptcy floor where it
        would say nothing is waiting…'.
      - *Tidy-ups:* `state/history.test-support.ts`'s `pageOfEntry`, read by `state/history.test.ts`'s
        page tests; `state/quest-return.test.ts` 'puts no Encounter or consumable in words, as the report
        does, and gives the report's Hero lines'.
- [x] The field is optional: a document without it validates and loads. With the field set aside, the
      History of seeded games is unchanged. `phases/quests-conclude.test.ts` 'a History written before
      M9-F1, with none of the three, still validates and loads', 'nothing else moves…' (M9-F1's
      fingerprints kept, the stripping extended) and "every founding in the games names its Guild's
      founding Wealth…"; `generators/guilds.test.ts`, `create.test.ts`, `phases/endings.test.ts`;
      `state/treasury.test.ts` 'a save whose founding names no Wealth…' (DL-121 item 1).
- [x] The ledger, from its opening row, adds up to Wealth now for the player's Guild, the founding
      Rivals and a replacement Rival: `state/treasury.test.ts` "%s: every Guild's ledger, from its
      opening row, adds up to its Wealth now…", over three seeded games of two years, each with a
      replacement (DL-121 item 5).
- [x] A 50 × 20 sweep is run again. Its games play Day for Day as at f22f493, and it is recorded in
      `harness/reports/`: `m9-f7-2026-09-30.md` (fingerprint `b4290f09…c1a7f8`, 138 folds, 37
      Successions, every counter as at f22f493) and `m9-f7-comparison-2026-09-30.md` (all 50 games equal
      on every Day with the field set aside; 388 of 388 foundings name a Wealth) (DL-121 item 2).
- [x] A code review at medium, lint, the typecheck, the suite, the bundle gate and every browser spec
      pass. The review's two low findings are fixed test first (DL-121 item 10); the checks are in
      DL-121 item 12.
- [x] DL-121 records the choices.

## 2. Configuration, content and events

- `guildmasterStartingAgeMin` 30 → 21, `guildmasterStartingAgeMax` 45 → 50,
  `guildmasterRetirementAge` 65 → 61, `configVersion` 11 → 12 (M9-F1, DL-113 item 4).
- Events: an optional `questId` on four types, and the Quest a participant of five (M9-F1). No new
  event type.
- Engine exports: `upkeepParts`, `nextUpkeepDay` and a Guildmaster's Retirement Turn (M9-F1).
- The harness: `harnessSetup.guildmasterAge` 30, and the Succession probe's option (M9-F1).
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
| `new --age` | "Age" (30 to 45) | "Age" (21 to 50), "Retires at 61" |

## 4. Decision numbers

- DL-111: the owner's nine points and eight answers.
- DL-112: this plan.
- DL-113: the plan approved as amended, with the owner's answers on DL-112's readings and the
  Guildmasters' ages.
- DL-114: M9-F1.
- DL-115: M9-F2.
- DL-116: M9-F3.
- DL-117: M9-F4.
- DL-118: M9-F5.
- DL-119: the close, M9-F6.
- DL-120: the owner's answers on the close.
- DL-121: M9-F7.
- DL-122: a release deploys from CI (the owner, 2026-09-30).
- DL-123: the release, M9-S9 (DL-122 renumbers it from DL-120 item 12's DL-122).

## 5. Risks

- *The browser specs change again.* M9-F2 changes the navigation's order and moves four parts, so
  it changes `e2e/support.ts` first, and the specs keep their journeys.
- *`web/src/state/history.ts` is shared.* M9-F4 and M9-F5 both change it, so they run one after the
  other.
- *The rail is narrow.* A return's entry, with its drill-down, has to fit a column shown from
  1100px. M9-F5's screenshots check it.
- *The World History's size.* Every Guild's Quests, taken and resolved, are most of it. It is paged
  by 20, and M9-F4 records a year's count.
- *The sweep changes more than before.* Under the old ages no founder retired within twenty years, so
  `d476deb`'s sweep had no Succession. Founders drawn at 42 to 50, about 30% of the founding
  Rivals, now retire within twenty years, and each successor starts with Regard neutral. The
  close's comparison has to explain those differences, and the probe shows a Succession on its own.
- *A game's length follows the Guildmaster's age.* A player who chooses or draws 50 has 11 years
  before Retirement ends the game; one at 21 has 40. The page says so (M9-F2).
- *Older saves.* Nothing is built for them (DL-113 item 3). A save that adopts the new rules sees
  any Guildmaster aged 61 to 64 retire that night.
