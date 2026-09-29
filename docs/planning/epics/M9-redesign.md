# M9 — The page redesigned, the Guildmaster's setup, and two fast-forward stops

**Objective:** the v1.1 line's one milestone. The browser page becomes views in a shell, with the
History as the one place to read what happened, a Party builder that shows each Hero's
availability and attributes, and a new visual style (DL-99). Beside it: the Guildmaster set up by
the player within a Trait budget, with a Rival Guildmaster succeeded rather than folded (#30), and
the Bankruptcy and staffable-Quest stops (#32). #37 releases the line as `v1.1.0`.

**Sessions:** 12–16 · **Depends on:** v1.0.1 · **Implements:** DL-99; DL-100; issues #30, #32
and #37; DL-83 item 19, DL-85 items 6 and 8, DL-87 item 5, DL-88 items 3 and 4.

**Gate:**
- The page opens as views in a shell at 360px, 820px and 1280px, with no sideways scroll of the
  page, and every CLI command has its browser equivalent, ticked in §3.
- The journeys pass through the new shell at a phone's width and a desktop's.
- The History opens on the player's Guild and is reachable for any Guild, Hero, Guildmaster or
  Patron.
- A player sets up their Guildmaster within the budget, from both front ends.
- A Rival Guildmaster's Retirement is met by a successor.
- Fast forward stops when the Guild falls below the Bankruptcy floor, and on request when a
  staffable Quest appears.
- A 50 × 20 harness sweep is recorded against `v1.0.1`'s, and the changes are explained by #30
  and #32 alone.

**Status:** planned — 2026-09-29.

## 0. What lands in M9

- **The shell and the style** (DL-99 items 1 and 6, the review's A1 to A6, B1, B12, C1, C2, C7, C8
  and D1 to D8): the status bar, the views, the home view, the game menu, help on request, a new
  visual style.
- **The Board and the Party builder** (DL-99 item 3, the review's B2, C4 to C6, E1 and E2).
- **The History** (DL-99 item 2, the review's B6 and B11).
- **The other views** (the review's B3 to B5, B7 to B10, E4 and E5).
- **#32, and #30** (DL-100 items 2 to 5).
- **Not in M9.** Autosave and keyboard shortcuts (DL-99 items 4 and 5, after M9). C9 is also left
  out: its refusals before the click need engine functions of their own. C3's changes beside the
  totals are left to the builder's time.

**Rules that bind every story.**
- **The web computes no rule.** Nothing in `web/` computes a rule (ADR-0007): every number and
  every judgement shown comes from a selector under `web/src/state/`. Only `state/` and
  `content.ts` import the engine's values (DL-65 item 7).
- **The page requests nothing** (principle 12, R38). It stays one page with one classic script,
  opening from `file://`, and the bundle gate passes. Fonts come from system stacks, and icons are
  inline SVG components.
- **Potential is never rendered** (M3-S3).
- **Vocabulary** (principle 13). Views and labels use `CONTEXT.md`'s terms. A new term goes into
  the glossary first.
- **Accessibility.**
  - Controls are at least 44px, and colour is never the only cue.
  - Each view is a labelled region with a heading, which takes the focus when the view opens.
  - Views switch as React state, with no router. The navigation marks the current view with
    `aria-current`.
- **Tests before code at the seams.** Engine functions and the `state/` selectors are the seams,
  and each change there is written test first. Views are tested with Testing Library, and the
  journeys with Playwright.
- **Green at each boundary.** Each story leaves lint, typecheck and the whole suite green at each
  commit, and records its choices in its own DL entry.

## 1. Stories

### M9-S1 · Bankruptcy and staffable-Quest stops (#32) · 1–1.5 sessions · opus

#32's acceptance boxes, the fourth already ticked by v1.0.1.
- *Events.* `guild.below-floor` and `guild.floor-recovered` come from the Guild-state phase and
  are narrated in both front ends (`cli/src/narrate.ts`, `web/src/state/narrate.ts`).
- *Always-on stop.* It fires when the watched Guild falls below the floor. A Rival's crossing does
  not stop the player's fast forward.
- *Opt-in stop.* A new `--until` condition in the CLI and an opt-in stop for the web's selectors,
  when a Quest the watched Guild's free Heroes can staff appears, even with a Party out. The
  page's control for it is M9-S7's.
- *The harness* counts the new events, and the DL records every other counter unchanged.
- *Scope.* This story touches `engine/`, `cli/`, `harness/` and `web/src/state/` only, not
  `web/src/views/`.

**Acceptance:** #32's boxes 1, 2, 3 and 5, and its DL (DL-101).

- [x] #32 box 1: the Guild-state phase emits `guild.below-floor`, with the Guild's Wealth, the floor
      and the Day Bankruptcy falls on (`bankruptcyCountdown`), the night `belowFloorSince` is set,
      and `guild.floor-recovered` the night it is cleared, for every Guild alike and never for a
      folded one; both narrated in both front ends, whose tests enumerate the union —
      `engine/src/phases/guild-state.test.ts` ('the Bankruptcy floor heard: guild.below-floor and
      guild.floor-recovered (M9-S1, DL-85 item 6, DL-101)', five tests, one played through
      `advance`); `cli/src/narrate.test.ts` ('the Bankruptcy floor (M9-S1, DL-101)', and 'gives %s
      one short line in the CLI's words' over the union); `web/src/state/narrate.test.ts` ('the map
      has words for exactly the union…', '%s says exactly what the CLI says, less its ids', 'every
      entry of its History as a sentence…'); `cli/src/main.test.ts` ('prints the Bankruptcy
      countdown after the Turns…', now reading `guild.floor-recovered`'s line) (DL-101 items 1, 2)
- [x] #32 box 2: fast forward stops, unasked, when the watched Guild falls below the floor, naming
      the Guild and the night; a Rival's crossing does not stop the player's; a Guild already below
      when it starts does not stop it again — `engine/src/stops.test.ts` ('below-floor (M9-S1,
      DL-85 item 6)', 'stopsOfTurn'); `engine/src/fast-forward.test.ts` ('fastForward: the
      Bankruptcy floor (always on, M9-S1)', three tests); `cli/src/main.test.ts` ("the player's
      Guild falling below the floor stops it unasked, naming the night, the countdown after
      (M9-S1)"); `web/src/state/reducer.test.ts` ("the player's Guild falling below the floor stops
      it unasked, where one call would, with the page's sentence"); `narrateStop` in both
      `narrate.test.ts` (DL-101 item 3)
- [x] #32 box 3: an opt-in stop, `--until staffable` in the CLI (with its usage) and
      `quest-staffable` in the reducer's `fastForward` `until` and the page's stop sentence, when a
      Quest the watched Guild's free Heroes can staff appears, even with a Party out; the always-on
      decision unchanged; "can staff" is `dispatch`'s own verdict on the Party `partyFor` proposes —
      `engine/src/stops.test.ts` ('quest-staffable (M9-S1, DL-85 item 8)', six tests; 'staffableQuests:
      a Quest can be staffed exactly when dispatch would send some Party of the Roster (M9-S1)', two
      tests, one against every Party of a six-Hero Roster judged by `dispatchRefusal`);
      `engine/src/fast-forward.test.ts` ('fastForward: a Quest the free Heroes can staff (opt-in,
      M9-S1)', three tests); `cli/src/args.test.ts` ('reads --until staffable…', 'the usage names
      every --until word…'); `cli/src/main.test.ts` ('staffable stops, with a Party out, the morning a
      Quest the Heroes at home could take reaches the Board (M9-S1)'); `web/src/state/reducer.test.ts`
      ('until a Quest the Heroes at home can staff: with a Party out it stops where one call would,
      before the Party is home') (DL-101 items 4, 5). The page's control is M9-S7's.
- [x] #32 box 5: the harness counts both events, by controller, in its totals and its report; a
      50 × 20 sweep against the same seeds before the change finds every other counter, every
      History count by type and every game's World State unchanged —
      `harness/src/counters.test.ts` ("M9-S1's counters, from the History (DL-101)", two tests);
      `harness/src/sweep.test.ts` ("totals and renders M9-S1's counters…") (DL-101 item 6)
- [x] DL-101 records the choices the epic left open.

### M9-S2 · The Guildmaster's setup, the Trait budget and Succession (#30) · 2–3 sessions · opus

#30's acceptance boxes, with the values DL-100 item 3 sets.
- *Trait content.* Trait content gains `cost` and `excludes`, validated (the costs are whole
  numbers, and every exclusion is symmetric). The content version is raised.
- *The draw.* `guildmasterTraitBudget` is a new config field, and `configVersion` is raised. The
  draw spends the budget and skips excluded Traits.
- *Setup.* `WorldSetup` takes an optional sex, an optional age (from `guildmasterStartingAgeMin`
  to `guildmasterStartingAgeMax`), chosen Traits and the three descriptive Attributes. A choice
  that breaks a rule is rejected with a type of its own. The CLI's `new` takes them as flags.
- *Succession.* A Rival Guildmaster who retires is succeeded, with a Milestone.
- *Save and documents.* The save schema is raised if the Guildmaster's row changes, and loads an
  older save with defaults. `CONTEXT.md` and R8 are updated.
- *A sweep.* A harness sweep gives Rival folds by cause.
- *Scope.* This story touches `engine/`, `content/`, `cli/`, `harness/` and `web/src/state/`
  only. The new-game form is M9-S7's.

**Acceptance:** #30's boxes 2 to 7 (box 1 is DL-100 item 3), and its DL (DL-102).

- [x] Box 2: Trait content has a `cost` and an `excludes` list, DL-100 item 3's values; the
      validator refuses a cost that is not a whole number, an exclusion that does not hold both
      ways, names itself, names no Guildmaster Trait or is listed twice, and a Hero Trait with a
      cost or an exclusion; content version 15 — `content/src/content.test.ts` ('is the core
      content set, version 15 since M9-S2's Trait costs and exclusions (DL-102)', 'gives each
      Guildmaster Trait DL-100 item 3's cost, a buff costing and a penalty refunding, and its three
      exclusions both ways; Hero Traits cost 0 and exclude nothing (M9-S2)');
      `content/src/refusals.test.ts` ('with %s is refused, naming the Trait (M9-S2)', ten cases;
      'refuses a Trait cost that is not a whole number, which the parser cannot see in memory
      (M9-S2)') (DL-102 items 2 and 3)
- [x] Box 3: the draw spends `guildmasterTraitBudget` (1, `configVersion` 11) and skips excluded
      Traits, for Rivals, successors and whatever the player leaves unset; every seed's
      Guildmasters change once, measured over 1,000 worlds — `engine/src/generators/guilds.test.ts`
      ('a drawn Guildmaster's Traits on the budget (M9-S2, DL-100 item 3)': 'the budget is
      guildmasterTraitBudget, 1 by default, under configVersion 11', 'every drawn Guildmaster keeps
      within the budget and holds no excluded pair, and 0, 1 and 2 Traits are all drawn', 'each
      draw is among the Traits that keep the running cost within the budget, and a draw with none
      eligible stops short', 'the draw takes the draws DL-19's shuffle took, one for the count and
      one for each Guildmaster Trait but the last, so nothing after it moves', 'the draw takes a
      fixed number of draws: the costs and exclusions move no later draw');
      `engine/src/create.test.ts` ('draws what is left unset as a Rival Guildmaster is drawn; an
      empty list of Traits is none') (DL-102 items 4 and 5)
- [x] Box 4: `WorldSetup` takes an optional sex, an optional age (30 to 45), chosen Traits and the
      Birthplace, Appearance and Biography (trimmed; at most 60, 280 and 1,000 characters);
      `setupRefusal` gives each breach a reason of its own; the Guildmaster's row stores the texts,
      read by no rule, and both front ends show them; the CLI's `new` takes them as flags; the
      page's state takes them in `newGame`, refuses with the engine's reasons, and offers the Trait
      choices, the form being M9-S7's — `engine/src/create.test.ts` ('setupRefusal': 'accepts the
      bare setup, and one that sets everything within the rules', 'refuses %s with a reason of its
      own', 'counts characters, not UTF-16 units, once trimmed: sixty emblems fit a Birthplace',
      'reads its bounds from the config it is given'; 'createWorld with the Guildmaster's setup
      (M9-S2)': 'gives the player's Guildmaster the sex, age, Traits and descriptive Attributes
      chosen, trimmed; a Rival's are empty', 'the player's choices move no draw: the world is the
      one drawn without them, but for their Guildmaster', 'throws on a setup setupRefusal refuses,
      naming its reason, and on a sex that is not one'); `engine/src/serialise.test.ts` ('holds
      three steps, from version 1 (M2-S8), version 2 (DL-60) and version 3 (DL-102), with
      schemaVersion 4'; 'a version-3 save': '%s loads with every Guildmaster in office and no
      descriptive Attribute, their Traits as they were (DL-100 item 4)');
      `cli/src/args.test.ts` ('reads new's Guildmaster flags…'); `cli/src/main.test.ts` ('sets the
      Guildmaster's sex, age, Traits and descriptive Attributes from its flags, as the engine makes
      them (M9-S2)', 'refuses %s with its own sentence as a bad command line, writing nothing
      (M9-S2)', 'show guildmaster prints the descriptive Attributes written, after the sex and age,
      and none left empty (M9-S2)'); `web/src/state/reducer.test.ts` ('sets up the Guildmaster from
      the play's optional fields, as the engine's createWorld does (M9-S2)', 'refuses the
      Guildmaster's setup with %s, the engine's refusal as its own, creating nothing (M9-S2)',
      'newGameRefusal lets a form check a setup before the click…'); `rejections.test.ts` (a
      sentence for each new reason); `selectors.test.ts` ('the Guildmaster's setup, for the
      new-game form (M9-S2)', four tests); `world-views.test.ts` ('gives the descriptive Attributes
      written, after the sex and age, and none left empty (M9-S2)') (DL-102 items 6 to 10)
- [x] Box 5: a Rival Guildmaster's Retirement is met by Succession: the Guild, Roster, Wealth,
      Fame, Hall and Items carry on under a successor, `guildmaster.succeeded` (a Milestone)
      records it and is narrated in both front ends, the replacement path does not run, and the
      player's Guildmaster's Retirement still ends the game; `engine/src/controller-reads.test.ts`
      unchanged (`git diff 5cb0c46 -- engine/src/controller-reads.test.ts` is empty) —
      `engine/src/phases/endings.test.ts` ('a Rival's Guildmaster's Retirement is met by
      Succession': 'on the first night the Guildmaster is guildmasterRetirementAge, a successor
      takes over and the Guild carries on with its Roster, Wealth, Fame, Hall and Items', 'the
      replacement path does not run…', 'Regard others held for the retired Guildmaster stays with
      them, and the successor holds none', 'the successor is drawn from generation alone', 'the
      successor's name is none in use…', 'a Rival whose Guildmaster retires on the night it goes
      bankrupt is succeeded, then folds that night with its successor', 'the player's Guildmaster
      is never succeeded: their Retirement ends the game'); `engine/src/validate.test.ts` ('a
      retired Guildmaster (M9-S2, DL-102)', two tests); `cli/src/narrate.test.ts` ('names the
      Guild, the retired Guildmaster and the successor of a Succession (M9-S2)');
      `web/src/state/narrate.test.ts` (every event type's sentence, `guildmaster.succeeded`'s among
      them) (DL-102 items 11 to 15)
- [x] Box 6: R8 matches DL-88 and DL-100; `CONTEXT.md` gains Descriptive Attribute and Trait
      budget and amends Attribute, Trait, Ending, Retirement and Succession — commit `a55d724`, the
      first of the story (DL-102 item 1)
- [x] Box 7: a harness sweep gives Rival folds by cause, beside the Successions —
      `harness/src/counters.test.ts` ('Rival folds by cause, and the Successions that met a Rival
      Guildmaster's Retirement (guildmaster.succeeded), which fold nothing'), `sweep.test.ts`,
      `seeds.test.ts` ('yearCount (M9-S2)'). 50 × 20: 161 Rival folds, all by Bankruptcy
      (`v1.0.1`: 148), and no Succession, since no founder reaches 65 inside the slice. 50 × 35
      (`HEROESIM_YEARS=35`): 219 Rival folds, all by Bankruptcy, and 20 Successions. Succession is
      exercised by the endings tests and by the longer run (DL-102 item 16)
- [x] DL-102 records the story.

### M9-S3 · The shell and the style · 2–3 sessions · opus

**The shell.**
- *The status bar.* It stays in view on every view. It holds the Guild's name, Wealth, Fame, the
  Day and time of day (with a sun or moon glyph), the Rankings place and the Bankruptcy countdown
  as a warning pill. It also holds Advance a Turn, Fast forward, the fast forward's progress and
  its Stop.
- *The views,* one at a time:
  - **Guild**, the home view;
  - **Board**;
  - **Roster**, with the Unattached pool and the Transfer Offers;
  - **Hall**, with the Guildmaster, what the Guild holds and the Market;
  - **Rankings**, with the Guilds and the Patrons;
  - **History**.
- *By width.*
  - Under 600px, a bottom bar holds Guild, Board, Roster and History, and "More" holds Hall and
    Rankings.
  - From 600px, a side rail of all six.
  - From 1100px, the view sits beside a History rail of the latest entries, marked new since the
    last action.
- *Harvest.* v1's `feature/poc` `web/src/layout/Shell.tsx` and its pane CSS are a pattern to
  harvest, not code to copy: v1's game model differs.
- *Counts on the navigation.* Board shows the Quests on offer. Roster shows a dot when a Transfer
  Offer waits. History shows the entries new since the last action.
- *The home view.* It is a digest of what needs attention:
  - the stop, with each Quest a decision-needed stop names as a button that opens that Quest's
    Party builder on the Board;
  - the Parties out, with who went and the night they return;
  - the Transfer Offers awaiting an answer;
  - the Quests that leave the Board today;
  - the outcome of the Parties that came home in the last play: the Quest band, Wealth, Fame, XP
    and Injuries.
- *The game menu.* A "Game" menu or dialog holds export, the saves kept in the browser, loading
  a file, a new game, the rules notice when there is one, the seed and the content set's version.
  The rules notice also shows as a banner in the home view while it stands.
- *Help on request.* Each view's help sentence stays its accessible description, shown on request
  by an "About this view" disclosure (DL-73 item 9 as DL-99 amends it).
- *Hidden when empty.* Empty lists and empty sections are not drawn as blocks. For example, the
  Offers part of the Roster view says nothing when no offer stands, and the count on the
  navigation says it.
- *The refusal.* It becomes an alert docked under the status bar, with an icon and Dismiss, and
  no longer covers the view.
- *Remembered view.* The open view is remembered per browser in `localStorage`, with every read
  and write in try/catch. A new game or a load opens the home view.

**The style** (the review's D1 to D8; the owner's approval of the direction is DL-100 item 6).
- *Tokens.* Colour tokens on `:root`, with the dark scheme: parchment and ink surfaces, a walnut
  or oxblood accent, a brass highlight for key numbers, and semantic good, bad and warning
  colours. Text contrast is at least WCAG AA in both schemes.
- *Faces.* Headings, the Guild's name and Quest names in the system serif stack
  `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif`. Body text in
  `system-ui`. Every number in tabular figures. Labels in small, tracked capitals.
- *Surfaces.* One surface level per view, separated by space and hairlines, not nested frames.
- *Buttons.* Three tiers: primary filled, secondary outlined, and tertiary as quiet text. Labels
  are centred and short where the row names the object, with the full name kept in `aria-label`.
- *Icons.* A small inline SVG set in one stroke style:
  - Wealth, Fame, morning, afternoon and night;
  - combat, travel, stealth, arcane and social;
  - Morale, Injury, build, History, menu and close.
- *Controls.* Styled search fields, number steppers and a file picker behind a styled button.
  `h5` and `h6` get sizes.
- *Motion.* Short transitions for expanding, changing view and changing a value, all off under
  `prefers-reduced-motion`.

**Acceptance** (DL-103):
- [x] The shell at the three widths, with no sideways scroll of the page, and 44px targets — tested
  in `e2e/layout.spec.ts`: 'every view and the game menu, with no sideways scroll and every
  control a 44px target' and 'the page is never wider than the viewport, whatever is open', in
  the phone (360px), tablet (820px, added) and desktop (1280px) projects; the other specs open
  each view through the navigation, the phone's Hall and Rankings through "More" (DL-103 items 1
  to 3, 13)
- [x] Every view is reachable by keyboard, and the focus moves to its heading — tested in
  `app.test.tsx`: 'opens every view from the navigation, a button the keyboard reaches, and puts
  the keyboard on its heading', 'opens on the home view, with the six views in the navigation in
  order and the open one marked', and 'remembers the open view in this browser, and a new game
  or a load opens the home view' (DL-103 item 2)
- [x] The help sentence is held to every view, as before — tested in `app.test.tsx`: 'every view
  and every part of one says what it is for and what its controls do, before a game and with
  one', each through its "About this view"; 'the time controls say what time is…' (DL-103
  item 8)
- [x] The home view shows the stop and its Quest buttons, the Parties out, and the outcomes — tested
  in `app.test.tsx` ('after a fast forward, opens with the stop, and each Quest it names opens
  that Quest's Party on the Board'; 'shows the Parties out, with who went and the night they
  return'; 'shows how the Party that came home fared: its Quest band, Wealth, Fame, XP and
  Injuries…'; 'says when nothing waits, and names the Transfer Offers waiting…') and
  `views/stop.test.tsx`, with the data from `state/digest.test.ts` (`partiesOutView`,
  `leavingTodayView`, `outcomesView`, `navCounts`, `railView`) and `state/selectors.test.ts`
  ('names each Quest a decision-needed stop names that is still on the Board…'), each written
  test first; in the browser, `e2e/journey.spec.ts` reads the Party out and how it came home in
  the home view (DL-103 items 4, 5)
- [x] Nothing is fetched — the bundle gate passes: `npm run build -w web` ends "check-bundle: 2
  built files, no network or filesystem reference"; `styles.test.ts` holds the stylesheet to no
  `@font-face`, `@import` or `url()` (DL-103 items 11, 14)
- [x] Both schemes are screenshotted and read: the home view after a stop, the Board, a Hero's
  page on the Roster, the History and the game menu at 390 × 844, 820 × 1180 and 1440 × 900 in
  the light scheme, and the home view in the dark scheme at 390 and 1440; the contrast of every
  pairing in both schemes is `styles.test.ts`'s 'in the light scheme…' and 'in the dark
  scheme…' (DL-103 item 11)

### M9-S4 · The Board and the Party builder · 1.5–2 sessions · opus

**Quest cards.** Each is two lines:
- the name and the Patron;
- chips for the difficulty, the days away, the reward, the Fame, the Party size and the
  requirement;
- the Day it leaves the Board, marked when that is today.

Expanded, a card shows:
- the Demands as bars proportional to their weights, with the Stat names;
- the Skills that help;
- the Encounters as counted chips, such as "combat ×2 · stealth ×2";
- the difficulty on a meter placed against the Quests on the Board now, as display only and not
  called a band.

The Quests can be sorted by reward, difficulty or the Day they leave. The order is display only.

**The Party builder.** Each Hero on the Roster has a row showing:
- whether they can go, and when not, why and until when: the engine's `unavailability`, with the
  night the Party returns or the Injury heals;
- their Class and Level;
- Morale and its band;
- the effective values of the Stats the Quest demands;
- the Skills the Quest names that they have, with their ratings.

A button opens the Hero's page in place and comes back with the Party and the consumables as
chosen. The requirements are a checklist of met or missed marks, and the verdict is a banner. Send
stays in view at the foot of the form. After a send, the card becomes a "Party out" card naming
who went and the night they return. There is no fit score and no odds (DL-99 item 3).

**Acceptance** (DL-104, the number the orchestrator gave this story; §4's DL-104 for the close is
out of date):
- [x] Quest cards of two lines: the name and the Patron, then chips for the difficulty, the Days
      away, the reward, the Fame, the Party size, each requirement and the Day it leaves, marked
      "Leaves today" when that is today. A card unfolds to the Demands as bars of their weights, the
      Skills that help, the Encounters counted with their icons, and the difficulty on a meter
      against the Board, never called a band. The Board is ordered by reward, difficulty or the Day
      each leaves, display only — `web/src/state/selectors.test.ts` ("the Board's Quest cards
      (M9-S4, DL-104)", six tests, written test first); `web/src/views/board.test.tsx` ('is two
      lines…', 'unfolds from its name…', 'is ordered by reward, by difficulty or by the Day each
      leaves…') (DL-104 items 1 to 3)
- [x] Each row's values come from a selector written test first: whether the Hero can go, and why
      not and until when; Class and Level; Morale and its band; the effective values of the Stats
      demanded; the Skills the Quest names, with their ratings — `web/src/state/selectors.test.ts`
      ("the Party builder (M9-S4, DL-104)", four tests, the values held to `heroPage`'s and
      `rosterView`'s and the reason to the engine's `unavailability`); `web/src/views/board.test.tsx`
      ("gives each Hero on the Roster a row…", 'says who is away with a Party…') (DL-104 item 4)
- [x] The drill-down keeps the choice (Testing Library) — `web/src/views/board.test.tsx` ("opens a
      Hero's page in place, and comes back to the Party and the consumables as chosen"); in the
      browser, `e2e/journey.spec.ts` and `e2e/layout.spec.ts` (DL-104 item 5)
- [x] The requirements a checklist of met and missed marks, the verdict a banner, and Send in view
      at the foot of the form, on a phone too — `web/src/views/board.test.tsx` ('shows the
      requirements as a checklist of met and missed, and dispatch's verdict as a banner…');
      `e2e/layout.spec.ts` ('the Board and the Party builder: no sideways scroll, 44px targets, Send
      in view at the foot of the form…', at 360px and 390px, 820px and 1280px) (DL-104 item 6)
- [x] After a send, the card becomes a "Party out" card naming who went and the night they return —
      `web/src/state/selectors.test.ts` ("after a send (M9-S4, DL-104)", two tests);
      `web/src/views/board.test.tsx` ('once sent, the card becomes a Party out card where it
      stood…', 'the Party out card stays until the next play'); `web/src/app.test.tsx` ('previews a
      Party as it is chosen, and sends it when dispatch would') (DL-104 item 7)
- [x] The home view's Quest buttons open the builder on their Quest — `web/src/app.test.tsx` ('after
      a fast forward, opens with the stop, and each Quest it names opens that Quest's Party on the
      Board', now finding the builder's rows) (DL-104 item 8)
- [x] `e2e/journey.spec.ts` dispatches through the builder, at 360px, 820px and 1280px: a row's
      facts, a Hero's page and back with the choice kept, and the "Party out" card (DL-104 item 9)
- [x] No fit score and no odds (DL-99 item 3) — `web/src/views/board.test.tsx` ("gives each Hero on
      the Roster a row…", which finds no "fit", "odds" or "chance" in the form)

### M9-S5 · The History · 1–1.5 sessions · opus

"Since your last action" folds into the History. The entries the last play appended are the
newest, marked new.
- *Its opening scope.* It opens on the player's Guild. The whole History and any Guild are one
  choice away, and the choice holds while the game is in hand (DL-74 item 8).
- *Any entity.* Any entity the History names can be chosen: a Guild, a Hero, a Guildmaster or a
  Patron. It is found by name as DL-74 does. Each entity's page opens its own History: a Hero's,
  a Guild's, a Patron's and a Guildmaster's.
- *Names as links.* Names in an entry open that entity. The narration marks the participants'
  names from the event's own ids, never by parsing its sentence (principle 5).
- *Groups.* Entries are grouped by Day and time of day, newest first. Within a group they are in
  the order they happened.
- *Folding.* A Party's Encounter entries fold under its outcome entry, and expand. Each Rival's
  routine entries in a group (purchases, equipping, XP and Morale drift) fold into one line per
  Guild, and expand.
- *Paging.* History is paged as before, and "Newest" returns to the top.

**Acceptance** (DL-105):
- [x] Grouping and folding are `state/` selectors, written test first — `state/history.ts`'s
  `historyView`, tested in `state/history.test.ts`: 'groups newest first, each headed by its Day
  and time of day, and each holding the entries of its Turn as they happened', 'pages twenty
  entries at a time from the newest…', "pages a Hero's History too, as their page shows it",
  "a Party's Encounters, folded under its outcome" (every entry on one page and one only, and
  each outcome's steps its Party's), "a page that ends on an outcome takes its Party's steps with
  it…", 'are exactly these kinds, none of them a Milestone', 'fold, two or more in a group, into
  one line for their Guild, never the player's and never a Milestone', "marks each line the
  player's, a Rival's or neither, new when the last play appended it, and an outcome by how it
  went", and 'whose History' and 'the choices one step away' (DL-105 items 1, 2, 5 to 8)
- [x] Names are marked by the narration from the event's own ids, never by parsing — tested in
  `state/narrate.test.ts`, 'a line as segments…': every event type 'reads word for word as its
  sentence, and marks only names of whom the event names'; 'never finds a name by reading its own
  sentence: two of one name are told apart by their ids' (DL-105 item 4)
- [x] Names link to the right entity — tested with Testing Library in `views/history.test.tsx`:
  "a Hero's name opens their page in the History, and back goes to the History it came from",
  "a Guild's name opens its page in the Rankings, and it opens the Guild's History", "a Patron's
  and a Guildmaster's names open their History"; each one's page opens their History: "a Rival's
  page in the Rankings, a Patron and a Guildmaster", and the Hero's page's History in
  `views/hero-page.test.tsx` (DL-105 items 3, 4)
- [x] One view, opened on the player's Guild, the new marked, the choice holding, paging and
  "Newest" — tested in `views/history.test.tsx`: "opens on the player's Guild, grouped by Day and
  time of day, newest first, what the last play added marked new", 'gives the whole History and
  each Rival's in one choice, a choice that holds from view to view and play to play', 'pages
  twenty entries at a time; "Newest" returns to the top, the page and the keyboard', the folds
  and marks, and 'the rail and the stop open the History on the player's Guild, at its newest,
  whatever was chosen before'; the log's part and its checkbox are gone (DL-105 items 1, 2, 7, 8)
- [x] The journey reads the Party's return in the History — `e2e/journey.spec.ts` opens it from
  the stop's "Read what happened", reads the return, new, under its outcome's chip, opens its
  Encounters, and holds the page to no sideways scroll and its targets; `e2e/layout.spec.ts`
  reads the whole History, the search and a name opened at the three widths (DL-105 item 11)
- [x] The home view's outcomes open their line in the History (the optional link) — tested in
  `state/digest.test.ts` ("gives where each is read in the player's History…") and
  `views/history.test.tsx` ('on the page it stands on, with the keyboard on it') (DL-105 item 9)
- [x] Screenshotted and read: the History after a fast forward (groups, folds, the new marked, a
  Party's Encounters open, a Rival's routine open) and a Hero's History, at 390 × 844 and
  1440 × 900 in the light scheme
- [x] DL-105 records the choices the epic left open, and its departures.

### M9-S6 · The Roster, Hall and Rankings views · 2 sessions · opus

**The Roster.**
- *Hero cards.* Compact cards: name, Class, Level, age, Morale chip, and whereabouts.
- *A Hero's page.*
  - A header line and chips.
  - The Stats as four area blocks, with the effective value and a "+n" when gear lifts it, and
    the Outlook word as a chip.
  - Gear, and Skills.
  - Relationships as chips, with neutral ones folded.
  - Milestones, then the Hero's History (M9-S5).
  - A Transfer out behind a confirmation that states the fee and the Morale cost.
- *The Unattached pool.* Rows with sort by class and by fee, and Recruit. A Hero who will not
  sign is shown with the pool's own reason.
- *Transfer Offers.* Accept asks to confirm first.

**The Hall.**
- *Facilities.* One row each, with grade pips, what it does, and the Build button carrying its
  cost. The Upkeep sits beside them.
- *The Guildmaster.* Stats, Traits, descriptive Attributes (after M9-S2), and Regard as chips,
  with neutral folded.
- *What the Guild holds.* Shown in the Hall view.
- *The Market.* A table with filter chips by kind and a quantity stepper, and a table of what the
  Guild holds with Sell.

**The Rankings.**
- *One table.* It merges the Rankings and the Guilds: Place, Guild, Disposition, Fame, Wealth,
  Heroes and Upkeep. It sorts by a column, and Fame and Wealth keep their shared places. A row
  opens its Guild.
- *A Rival's page.* The Roster as a table with Transfer fees, and the Hall and Guildmaster
  folded.
- *The Patrons.* One table: Patron, Sphere, their Regard for the player's Guild, the player's
  Guildmaster's Regard for them, and their Quests on the Board now.

**Acceptance:** views are tested with Testing Library, and the journey's recruit and the History
search go through them.

### M9-S7 · The page's side of #30 and #32 · 1 session · opus

After M9-S1 and M9-S2 are merged:
- *The new-game form.* It gains the Guildmaster's setup:
  - an optional sex and age;
  - Traits chosen within the budget, with each Trait's cost, the budget left and the exclusions
    shown from selectors;
  - the three descriptive Attributes;
  - "drawn from the seed" for anything left unset.
- *Refusals.* Each refusal of the setup is a sentence.
- *Fast forward.* It offers "until a Quest I can staff appears".
- *The Bankruptcy stop.* It shows in the home view with its countdown.
- *The new events.* They are narrated in the History.

**Acceptance** (DL-107, the number the orchestrator gave this story; §4's numbers are out of date):
- [x] The new-game form's rules come from `state/` selectors, written test first: each Trait's cost,
      what it excludes and how it stands against those chosen, judged by the engine's own
      `setupRefusal` on the Traits with it added; the budget left; the sexes, the starting ages and
      the descriptive Attributes' bounds; the engine's refusal as a sentence —
      `web/src/state/setup.test.ts` ("the Traits the new-game form offers, as they stand against
      those chosen (M9-S7)", five tests; "what else the form offers for the Guildmaster, and the
      engine's refusal as a sentence (M9-S7)", eight tests) (DL-107 items 1 to 4)
- [x] The form: an optional sex and age, the Traits drawn from the seed or chosen within the budget
      (none a choice), and the Birthplace, Appearance and Biography with their bounds, behind "Your
      Guildmaster"; an excluded Trait or one past the most cannot be chosen and says why, one over
      the budget is marked and may be chosen; the budget left moves as the player picks —
      `web/src/views/new-game.test.tsx` ("the Guildmaster's setup in the new-game form (M9-S7)", seven
      tests); `e2e/layout.spec.ts` ("the new-game form with the Guildmaster's setup open…", no
      sideways scroll and 44px targets at 360px, 820px and 1280px) (DL-107 item 5)
- [x] Each refusal of the setup is a sentence, beside the form, and a setup the engine would refuse
      cannot be started — `web/src/views/new-game.test.tsx` ("a setup the engine would refuse cannot
      be started, and the engine's sentence stands beside the form", "a Trait over the budget is
      marked so…"); `e2e/layout.spec.ts` (a Birthplace too long) (DL-107 item 6)
- [x] Fast forward offers "until a Quest I can staff appears" beside "until new Heroes join the
      pool", its words name every stop, and its stop's Quests open their Parties —
      `web/src/views/stops.test.tsx` ("the ways to fast forward (M9-S7, #32)", three tests, one
      through a real fast forward with a Party out); `web/src/views/stop.test.tsx` ("a Quest to staff
      (M9-S7, #32)", two tests) (DL-107 items 7 to 9)
- [x] The Bankruptcy stop in the home view: a warning card with the Day Bankruptcy falls on, what can
      be done in words, and buttons to the Hall's Market and the Board, in the countdown banner's
      place — `web/src/views/stop.test.tsx` ("the Bankruptcy stop (M9-S7, #32)", two tests);
      `web/src/views/stops.test.tsx` ("the Bankruptcy stop in the home view (M9-S7, #32)", two
      tests through a real fast forward); `e2e/fast-forward.spec.ts` ("falling below the Bankruptcy
      floor stops a fast forward unasked…", at three widths) (DL-107 items 10, 11)
- [x] The new events read in the History: `guild.below-floor` seen in the History rail in the
      screenshots, and all three held to their sentences by `web/src/state/narrate.test.ts` (M9-S1's
      and M9-S2's, unchanged) (DL-107 item 12)
- [x] The journey starts a game with a chosen Guildmaster: an age and two Traits within the budget,
      read in the Hall; its later steps and the save round trip hold — `e2e/journey.spec.ts` at
      360px, 820px and 1280px (DL-107 item 5)
- [x] DL-107 records the story.

### M9-S8 · Verification and close · 1–2 sessions · opus

- The whole suite, lint, typecheck and the build pass.
- `npm run e2e -w web` passes at phone and desktop. A tablet project (820×1180) joins
  `playwright.config.ts`.
- The table in §3 is ticked.
- Screenshots at three widths and in both schemes are read.
- `/code-review` runs on the milestone's diff, and its findings are fixed or recorded.
- The harness sweep: 50 × 20 against `v1.0.1`'s fingerprint, with every difference explained.
- The epic's boxes are ticked, and the close's DL (DL-104) is written.

### M9-S9 · The release (#37) · 0.5–1 session · the owner, and an agent

This story runs only with the owner's go-ahead.
- `v1.1-dev` is merged into `v1.1-release`, tagged `m9-redesign` and `v1.1.0`.
- The deploy script's `--branch` and `deploy.test.ts` move to `v1.1-release`.
- The owner sets the Pages production branch and GitHub's default branch.
- The deploy runs from a clean checkout of the tag, then `e2e:live` on both addresses.
- The deploy is recorded.

## 2. Configuration, content and events introduced

- `guildmasterTraitBudget`, and `configVersion` raised (M9-S2).
- Trait content: `cost` and `excludes`; the content version raised (M9-S2).
- Events:
  - `guild.below-floor` and `guild.floor-recovered` (M9-S1);
  - the Succession Milestone, named in M9-S2's DL: `guildmaster.succeeded` (DL-102 item 14);
  - the stop reasons (M9-S1).
- The save schema is raised only if the Guildmaster's row or a new field needs it. #15, now on
  v1.2, then takes the next number.

## 3. Every CLI command in the browser

Ticked at M9-S8 against the shell. The rows are M7's table (DL-66 item 9, DL-73 item 14), plus
`new`'s Guildmaster flags (M9-S2) and `advance --until` staffable (M9-S1).

## 4. Decision numbers

- DL-100: this plan, #30's values, and the style's go-ahead.
- DL-101: M9-S1.
- DL-102: M9-S2.
- DL-103: M9-S3 to M9-S7, the page.
- DL-104: the close.

## 5. Risks

- *Wide changes to the browser specs.* Every journey finds sections as regions on one page, so
  M9-S3 rewrites the helpers in `e2e/support.ts` first, and the specs keep their journeys.
- *Engine changes beside the page.* M9-S1 and M9-S2 run in parallel with M9-S3 to M9-S6 on branches
  of their own. Their web edits stay in `web/src/state/` so the merges stay small.
- *Succession is rarely exercised.* Founding Guildmasters start at 30 to 45 and retire at 65, so
  few reach it inside twenty years. Tests make it happen, and M9-S2's DL says how the sweep
  shows it.
