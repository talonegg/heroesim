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

**Acceptance:**
- The shell at the three widths, with no sideways scroll of the page, and 44px targets — tested
  in `e2e/layout.spec.ts`.
- Every view is reachable by keyboard, and the focus moves to its heading — tested in
  `app.test.tsx`.
- The help sentence is held to every view, as before — tested in `app.test.tsx`.
- The home view shows the stop and its Quest buttons, the Parties out, and the outcomes — tested
  in `app.test.tsx` and `state/` selectors test first.
- Nothing is fetched — the bundle gate passes.
- Both schemes are screenshotted and read.

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

**Acceptance:** each row's values come from a selector written test first, and the drill-down
keeps the choice (Testing Library). `e2e/journey.spec.ts` dispatches through the builder.

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

**Acceptance:** grouping and folding are `state/` selectors, written test first. Names link to
the right entity (Testing Library). The journey reads the Party's return in the History.

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

**Acceptance:** the new-game form's rules come from `state/` selectors, written test first. The
journey starts a game with a chosen Guildmaster.

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
  - the Succession Milestone, named in M9-S2's DL;
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
