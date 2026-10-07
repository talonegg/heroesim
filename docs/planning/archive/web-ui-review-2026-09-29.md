# Web UI review — 2026-09-29

An assessment of the browser page as released in v1.0.1, with recommendations to improve the player's
experience, declutter and organise the page, improve readability, bring key information forward and
give it a more refined look. This is a review, not a decision: anything adopted needs its entry in the
decision log first, and several items below are marked as the owner's call.

> **Decided in DL-99 (2026-09-29).** The owner answered §7's six questions and put the redesign
> first, as v1.1 with #30 and #32, with Random Events moved to v1.2. The layout, the
> History, the Party builder and the style are decided there. The other recommendations remain
> proposals for the redesign's epic (DL-99 item 7).

## 1. Scope and method

- **Code read.** Every file under `web/src/views/`, `web/src/app.tsx` and `web/src/styles.css`, at
  `v1.0-dev` 80987fd. `v1.1-dev` has the same page code.
- **Played in Chromium.** The built bundle, with seed `heroesim-e2e-01`. The game went from a new
  Guild through a dispatch, a refused build, an Advance and eleven fast forwards, to Day 15. It was
  seen at a phone's size (390×844) and a desktop's (1440×900), in the light and dark schemes.
- **Measured and screenshotted.** At each stage the page height, the buttons, the words and the
  height of each section were measured. Every section and every in-place page (a Hero, a Rival Guild,
  the dispatch form) was screenshotted.

## 2. The short version

The page is the CLI laid out as one long document. It is correct, accessible and consistent. However,
it makes the player do the organising: fourteen sections are always open, at one weight, in one
column. The core loop is spread across the page. Nothing marks what matters this Turn.

| Measure (a new game) | Phone 390×844 | Desktop 1440×900 |
| --- | --- | --- |
| Page height | 21,937 px — **26 screens** | 17,991 px — **20 screens** |
| Buttons on the page | 55, rising to 65 | same |
| Words on the page | ≈3,050 | same |
| …of which section help text | **632** | same |
| Board section alone | 3,501 px (4 screens) | 2,958 px (3.3 screens) |
| Width used | full | **44rem of 90rem, under half** |

These are the five findings that matter most:

1. **The core loop is scattered across the page.** The loop runs from reading why time stopped, to
   choosing a Quest and a Party, to sending it, advancing, and reading what happened. Time is at the
   top. The Board fills the next four screens. "Since your last action" is the twelfth section, about
   fifteen screens down on a phone. After "Send the Party", nothing near the button confirms it.
2. **Nothing is prioritised.** Wealth, the seed and "Days away" all have the same size and weight. A
   success and a failure look alike in the log. So do your own events and a Rival's, and a Quest that
   expires today and one with a week left.
3. **Help text crowds out content.** Each section opens with a grey paragraph of 25–75 words. Those
   paragraphs come to about a fifth of the page's words. On a phone, the first screen of a game shows
   the Time section's help but not one Quest.
4. **Key–value lists are used where tables or chips belong.** A Quest card stacks ten label/value rows.
   So does every Guild card, and the Hero page's attributes. The Market repeats a form ten times.
5. **The desktop is not used.** A 44rem column leaves more than half of a 1440px window empty. A desk
   player scrolls just as far as a phone player.

## 3. Constraints the recommendations respect

These come from the project's own decisions, so every recommendation below is written to fit them:

- **Nothing in `web/` computes a rule** (ADR-0007, principle 12, DL-66). Any new judgement must come
  from an engine selector, as the dispatch preview already does (DL-66 item 2). That covers "can
  afford", "would sign", "would build", and a Hero's fit to a Quest.
- **The page requests nothing** (principle 12 and the bundle gate). That rules out web fonts and CDN
  icon sets. Fonts come from system stacks, and icons are inline SVG in the bundle.
- **The single-script `file://` page is binding** (DL-88 item 5). Views are switched as state, as Hero
  pages already are, not by a router that needs a server.
- **Potential is never shown** (M3-S3). Only the Outlook hint words are.
- **M7 deferred layouts beyond one column, and a router** (M7 §0, DL-66 item 1). Deferred is not
  rejected, but leaving one column should be recorded as a decision that supersedes DL-66 item 1.
- **The browser specs find sections by region name** (`region(page, 'Board')`). If sections stop being
  on the page all at once, `journey.spec.ts` and `layout.spec.ts` change with them.
- **CONTEXT.md's vocabulary is binding.** Note that "Quest band" means how a Quest *went*, so it must
  not be reused for difficulty.

## 4. What is already good — keep it

- A coherent, warm parchment palette with a considered dark scheme, and tokens on `:root`.
- Controls at least 44px, no horizontal scroll at any width, and wide tables scrolling in their own box.
- Proper landmarks. Every section is a labelled region, and `goTo` moves focus to its heading.
  `aria-busy` and `role="status"` are used where they belong.
- The dispatch preview. It shows requirements met or missed, Synergies, the reward agreed and the
  verdict, live as the Party changes. This is the best interaction on the page.
- Stop reasons are sentences with a button to the next step.
- Plain-English narration, and a History that is paged and searchable by name.

## 5. Recommendations

Each has an ID, the change, and the evidence behind it. **Effort:** S is under half a session, M is
one or two sessions, and L is more. **Owner** marks a game-design or product call rather than a UI one.

### A. Structure and navigation — the largest gains

**A1. Replace the fourteen stacked sections with an app shell of views** (L, Owner: it supersedes
DL-66 item 1). Group the sections into six views and show one at a time. View names are `CONTEXT.md`
terms (principle 13); this table was revised on 2026-09-29, when DL-99 replaced the first draft's
"Quests", "Heroes", "World" and "Chronicle".

| View | Contains today's | Why together |
| --- | --- | --- |
| **Guild** (home) | stop reason, countdown, Offers, a new "Parties out" strip, latest results | what needs attention this Turn |
| **Board** | Board and dispatch | the main decision |
| **Roster** | Roster, Hero pages, Unattached pool (a "Recruit" sub-view), Transfer Offers | people management |
| **Hall** | Hall, Guildmaster, What the Guild holds, Market | the Guild's own assets and spending |
| **Rankings** | Rankings merged with Guilds, Patrons | the competition and the clients |
| **History** | Since your last action, History | reading what happened |

On a phone, show a bottom tab bar with Guild, Board, Roster and History, plus "More" for Hall and
Rankings. On a tablet, use two columns. On a desktop, show the view in the main column and History as
a right-hand rail, so results sit next to the decisions that caused them. v1's `web/src/layout/Shell.tsx`
and the pane CSS on `feature/poc` already do bottom bar / two columns / three panes by CSS alone
(E8-S3). The mechanism can be harvested even though v1's game model cannot.

```
Phone                              Desktop (≥1024px)
┌───────────────────────────┐     ┌───────────────────────────────────────────────────────────────────┐
│ The Lantern   402 ◉  6 ★  │     │ The Lantern  ◉ 402  ★ 6  ☀ Day 7 morning  1st  [Advance] [FF ▾] ⋯ │
│ ☀ Day 7 · 1st   [Advance] │     ├──────────┬────────────────────────────────────┬───────────────────┤
├───────────────────────────┤     │ Guild    │ BOARD · 6 Quests on offer          │ HISTORY           │
│ ⚑ A decision is needed    │     │ Board 6  │ ┌ Break the sealed vault ────────┐ │ Day 6 · night     │
│ No Party out. Could send: │     │ Roster 4 │ │ 69 · 6 days · 276 ◉ · +5 ★     │ │ ✓ Hold the border…│
│ [Sealed vault] [Barrow]   │     │ Hall     │ │ 3–5 Heroes · Mage · to Day 7   │ │   +302 ◉  +6 ★    │
│ …                         │     │ Rankings │ └────────────────────────────────┘ │ Rivals: 3 home    │
├───────────────────────────┤     │ History  │ …                                  │ …                 │
│ Guild Board Roster Hist ⋯ │     └──────────┴────────────────────────────────────┴───────────────────┘
└───────────────────────────┘
```

**A2. A compact, sticky status bar** (S–M). Pin the Guild name, Wealth, Fame, Day and time of day, and
the Rankings place to the top, with Advance and Fast forward beside them. The time controls are then
reachable from any view. Today the Time section scrolls away and the player scrolls back for every
Turn. Show the Bankruptcy countdown as a red pill in the bar, and fast-forward progress and Stop in it
too. Move the seed out of the header and into the game menu, since it is reference data, not status.

**A3. Make the home view an "attention" digest** (M). Turn the stop sentence into a card with direct
actions:

- **Decision needed.** Each Quest the sentence names becomes a button that opens that Quest's Party
  builder. Today the sentence names three Quests, and "Choose a Party on the Board" only scrolls.
- **Party returned.** Show the outcome inline: the Quest band, the Wealth and Fame gained, XP, and
  injuries. This replaces "Read what happened" jumping fifteen screens.
- **Standing items.** Transfer Offers awaiting an answer, Quests on offer that expire today, Heroes
  healing and when, Upkeep due and when, and the Parties out with their return night.

**A4. Put counts and badges on the navigation** (S). For example, Board 6, Roster with a dot when an
Offer waits, and History with the number of new events. While all fourteen links remain, fold the
index on a phone: it is 140px and three lines tall, and it is not sticky.

**A5. Hide empty states** (S). Stop showing these as blocks that take space:

- the Transfer Offers section when none stands;
- "What the Guild holds: Nothing";
- the empty "Consumables" fieldset in the Party form;
- "Milestones: None yet".

Say it in a word where the player looks for it instead, such as the badge in A4.

**A6. Move game management into a menu** (S). Export, save and load, "Start a new game", "Adopt the
new rules", the seed and the content version (now in the footer) belong behind a "⋯ Game" menu or
dialog. Keep a one-tap "Save" in the status bar. Autosaving to a reserved slot would prevent the
commonest loss, a closed tab (**Owner**: it is a behaviour change).

### B. Decluttering and density

**B1. Collapse the help paragraphs** (S). Put each section's help behind an "ⓘ About this" disclosure
(`<details>`), open on the first visit and closed after. DL-73's test that holds every section to its
help sentence still passes, because the text stays in the DOM, and `aria-describedby` still resolves.
This saves 632 words and 60–130px on every section.

**B2. Compact Quest cards** (M). Today each card is about 300px of ten label/value rows (2,958px for six
Quests on a desktop). Use a two-line summary instead:

> **Break the sealed vault** · Geoffrey Brand
> ⚔ 69 · 6 days · 276 ◉ · +5 ★ · 3–5 Heroes · needs a Mage · until Day 7

Put Demands, Skills that help and Encounters behind the card's expand, which the Party builder already
opens. Show Encounters as counted chips ("combat ×2 · stealth ×2") rather than
"combat, combat, stealth, stealth". Allow sorting by reward, difficulty or days left, which is display
only. Mark a Quest that expires today.

**B3. The Market as a table** (M). Replace ten forms of about 140px each with rows of about 48px:
Item | Kind | Effect | Price | Stock | quantity stepper | Buy. Add chips to filter by kind (weapon,
armour, trinket, consumable). Show "What the Guild holds" as a second table with Sell. Dim a row the
Guild cannot afford only if an engine selector says so (see C9). "The Lantern has 402 Wealth" then
goes, because the status bar says it.

**B4. Merge Rankings and Guilds into one table** (M). Columns: Place | Guild | Disposition | Fame |
Wealth | Heroes | Upkeep. Clicking a column header sorts it, which replaces the By Fame / By Wealth
toggle while keeping both orders (DL-91). A click on a row opens the Guild. This removes five cards of
six terms each (1,547px) and a table that repeats half their data.

**B5. Merge the two Patron lists** (S–M). The Patrons section shows each Patron's Regard for your Guild.
The Guildmaster section shows your Guildmaster's Regard for each Patron. Both are twelve-line lists
reading "neutral". Make one Patrons table: Patron | Sphere | Their Regard | Your Guildmaster's Regard |
Quests on the Board now. Show bands as coloured chips, and fold the neutral rows by default
("9 neutral").

**B6. Group and filter the log** (M; the default filter is the **Owner**'s call).

- **Group by time.** Put one heading per Day and time of day instead of a timestamp on every line.
  The 36 lines of one fast forward carried 36 timestamps across only three times of day.
- **Default to your own Guild.** Today Rival activity is most of what the player reads. Keep "Show
  Rivals" as the toggle. DL-74 keeps the choice for the rest of the game.
- **Fold detail.** A Party's Encounter-by-Encounter lines fold into its result line, which expands.
  Each Rival's turn folds into one line, for example "Harrow Cross: 1 Party out, bought 2 Short swords".
- Grouping is presentation, so it can live in `state/narrate.ts` and its selectors.

**B7. Redesign the Hero page** (M). It is 2,600px on a desktop today.

- **Header.** "Rogue · Level 1 · age 18 · Poacher's child" as one line, then status chips: Morale 62
  steady · at the Hall · uninjured. This replaces eleven label/value rows.
- **Stats.** Four area blocks in a 2×2 grid on wide screens. Show one value per Stat and "+2" in the
  accent when gear lifts it; Base and Effective are equal on almost every row. Show the Outlook word as
  a subtle chip. Where content defines a Stat range, a thin bar per Stat reads faster than a number.
- **Relationships.** Chips, with neutral folded, as in B5.
- **Transfer out.** Move it under a "Transfer…" button that opens a confirmation (see E4). It is
  destructive, and today it sits open on every Hero's page.

**B8. The Unattached pool as rows** (S–M). Name | Class | Level | Age | Background | Fee | Signs? |
Recruit. This is 8 × 196px today. Sort by class or fee. Grey a Hero who will not sign, and give the
reason as the pool already words it. Shorten "Recruit Cwen Ledger" to "Recruit", keeping the full
name in `aria-label` so the specs and screen readers still find it.

**B9. Compact Hall facilities** (S). One row each: name, grade pips (●○○○), what it does, and the
cost on the button ("Build Dormitory · 200 ◉"). Upkeep sits beside the grades, since building raises it.

**B10. Restructure the Rival Guild page** (M). It is 3,800px on a phone. Show the Roster as a table
with Transfer fees, and fold the Hall and Guildmaster sections. Fix the headings: Hall facility names
render as `h5`, and `styles.css` never sizes `h5`, so they come out smaller than body text.

**B11. Lighter History controls** (S). The Guild choice becomes chips, and the search box sits in the
section header. Group by Day as in B6.

**B12. Remove developer-facing text from play** (S). "Content set core, version 14, loaded", the seed,
and the rules notice's configVersion numbers belong in the game menu or an About dialog.

### C. Highlighting key information and readability

**C1. A real type hierarchy** (S). Today headings step 1.5 / 1.25 / 1.1 / 1rem, all in the body face,
and h5 and h6 are unstyled. The proposal:

- Headings in a display face (D2), with clearer steps between them.
- Labels (`dt`, table headers) in small caps or tracked uppercase at 0.75rem.
- Key values in semi-bold tabular figures.
- Prose capped near 68ch.

**C2. Semantic colour, never alone** (S–M). Add a warning (amber) token beside `--good` and `--bad`,
and use them consistently:

- success, strong success and failure in the log and results;
- injured, low Morale, a Quest expiring today, a Transfer Offer waiting.

Every coloured cue also has an icon or word, for accessibility.

**C3. Show changes, not just totals** (S–M). After an action or a fast forward, show the change in
Wealth and Fame beside the totals for a moment, for example "402 ▼98". The difference between two
documents is display arithmetic, not a rule.

**C4. A Party builder that informs the choice** (M; the **Owner** decides how much to reveal).

- **Hero rows.** Show each Hero with their values for the Stats the Quest demands, for example
  "Str 8 · Wea 6 · End 3 · Lea 8". Highlight their Skills that match "Skills that help". Show Morale
  and injury as chips. Today the checkbox shows only "Finn Grimshaw, Rogue, Level 1", so choosing well
  means leaving the form for the Roster.
- **Requirements.** Show them as a ✓/✗ checklist, with the verdict as a banner rather than a line of
  green text.
- **Send.** Keep "Send the Party" in view at the foot of the form while it scrolls.
- **Odds.** Any fit or odds indicator is an engine selector and a game-design decision. It is not
  proposed here.

**C5. Readable Demands** (S). "Strength 0.3, Weaponry 0.3, Endurance 0.2, Leadership 0.2" shows weights
with no unit. Render them as proportional bars, or as the Stat names ordered by weight with the heavier
ones emphasised. This displays the value as it is and invents no rule.

**C6. Difficulty in context** (S). "Difficulty 89" means nothing on its own. A small meter placed
against the Quests on the Board now helps the player compare, as display only. Do not call it a band
(see §3).

**C7. The player's own events stand out** (S). In the log and History, give your Guild's lines an
accent rule on the left and a normal weight, and mute Rival lines. Mark results with ✓ or ✗ and
Milestones with a star. Milestones are already bold.

**C8. Relationship and Regard as chips** (S). Use a colour ramp from hostile through neutral to warm,
applied the same way on the Hero page, the Guildmaster and Patrons.

**C9. Prevent refusals rather than report them** (M; it needs engine selectors). The refused build
("costs 200 Wealth; The Lantern has 100") could have been a disabled button saying why. Give buy,
build, recruit and transfer the pattern DL-66 item 2 gave dispatch: an engine `…Refusal` function that
the view reads before the click. Keep the sticky refusal alert for what gets through. Also restyle it:
it now covers the top of whatever section is beneath it. Make it a toast with an icon and a close
button, docked under the status bar.

### D. Visual design — elegant and stylish, and still requesting nothing

**D1. Fewer boxes, more space** (M). A Quest in dispatch is a bordered panel, around a bordered card,
around bordered fieldsets, around a tinted preview: four nested frames. Keep one surface level per
view. Separate within it by spacing and hairline rules, and keep borders for things that are
interactive or selected.

**D2. A display face from the system** (S). Set headings, the Guild name and Quest names in a serif
stack that ships with the operating systems:
`"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif`. Palatino Linotype
and Book Antiqua ship with Windows, Iowan Old Style and Palatino with macOS and iOS, and Android falls
back to its serif. Body text stays `system-ui`. Add `font-variant-numeric: tabular-nums` to every
number, not only the `.number` cells. Nothing is fetched, so the bundle gate is unaffected. Together
with the existing parchment and walnut palette, this gives the "guild ledger" character the palette
hints at.

**D3. A small inline icon set** (M). About a dozen SVG glyphs as React components, drawn in one stroke
style: Wealth (coin), Fame (star or laurel), morning / afternoon / night, combat, travel, stealth,
arcane, social, Morale, Injury, build and History. `styles.css` says "no icon set" to mean nothing
external. Inline SVG requests nothing and passes the bundle gate.

**D4. Three button tiers** (S). Today almost every button is the same outlined box with left-aligned
text: "Open The Guild at Ravensgill", "Recruit Wace Wray", "Buy", "Dismiss". The tiers:

- **Primary.** Filled: Advance, Send the Party, Accept.
- **Secondary.** Outlined: Buy, Build, Recruit.
- **Tertiary.** A quiet text button: Close, Back, Show more, Dismiss.

Centre the label text, and shorten labels where the row already names the object (with the full
`aria-label` kept, as in B8).

**D5. Fix the visible styling defects** (S).

- **History search box.** `input[type='search']` is missing from the form-control selector, so it
  renders as a thin, unstyled box.
- **File picker.** "Load a save file" is the browser's native control. Wrap it in a styled button.
- **Headings.** `h5` and `h6` are unsized (B10).
- **Hero-name links.** `.link` buttons have `min-height: 44px`, which leaves a band of empty space above
  every Roster and pool card's text. Give the hit area padding instead, or make the whole card the target.
- **Quantity fields.** Number inputs for quantities would be clearer as − / + steppers.

**D6. Use the desktop's width** (with A1, M). Widen the frame to about 80rem with a navigation rail
and a History rail (see the wireframe in A1). Wide screens should show more at once, not the same
column with larger margins.

**D7. Quiet motion** (S). Short transitions when a card expands, a view changes or a value changes,
all turned off under `prefers-reduced-motion`.

**D8. Flavour in small doses** (S). A sun or moon glyph for the time of day in the status bar. An
ornamental rule under the Guild name. Parchment tints for Hall and Market surfaces. These are cheap and
characterful, as long as C1 and D1 have removed the clutter first.

### E. Interaction details

**E1. Confirm after sending** (S). Once a Party is sent, the Quest card becomes a "Party out" card:
who went and the night they return, for example "Finn, Vigdis and Arne · back on the night of Day 5".
It then appears in the home view's "Parties out" strip. Today the form closes and nothing nearby
confirms the send.

**E2. Keep stops actionable** (S). With no Party out, a fast forward stops on "a decision is needed"
nearly every time. In the play-through, eight fast forwards moved only from Day 7 to Day 15. With A2
and A3 the player stays on one screen: a Quest button, a Party, Send, then Fast forward again.

**E3. Keyboard shortcuts** (S, Owner). A to advance, F to fast forward, Esc to close a page or dialog,
and 1–6 to change view. Show them in the buttons' tooltips.

**E4. Consistent confirmations for irreversible acts** (S). Deleting a save asks first. Accepting a
Transfer Offer and transferring a Hero out do not, though both lose a Hero and cost Morale. Give all
three the same confirmation, stating the fee and the Morale consequence already worded in the help.

**E5. Remember the view** (S). Keep the open view and the log filter per game in `localStorage`, as a
per-browser convenience only, never game state.

## 6. Suggested sequence

1. **Quick wins, with no structural change** (about two sessions).
   - Design fixes: D5, D2, C1, D4 and C7.
   - Decluttering: B1, B12 and A5.
   - The sticky status bar (A2), compact Quest cards (B2) and log grouping (B6).
   - The browser specs barely change at this stage. On its own, this should roughly halve the
     page's height.
2. **Reorganise** (three to four sessions, after a DL entry that supersedes DL-66 item 1).
   - The shell and views (A1, D6), harvesting v1's CSS, and the home digest (A3, E1, E2).
   - The tables: B3, B4, B5 and B8.
   - `journey.spec.ts` and `layout.spec.ts` gain view switching.
3. **Richer information** (it needs engine selectors).
   - Refusal-before-click (C9) and the informed Party builder (C4).
   - The Hero page redesign (B7), icons (D3) and motion (D7).

## 7. Decisions for the owner

1. Leave the single column for views and a shell, superseding DL-66 item 1 and M7 §0's deferral?
2. Should the log default to your own Guild's events (B6)?
3. How much should the Party builder reveal: Stats against Demands, and any fit or odds (C4)?
4. Autosave to a reserved slot (A6)?
5. Keyboard shortcuts (E3)?
6. The aesthetic direction: a "guild ledger" look with serif headings and an inline icon set
   (D2, D3), or keep the neutral system look and only declutter?

**The owner's answers (2026-09-29), recorded in DL-99:**

1. "Revisit DL based on UX design review and principles." DL-99 item 1 revisits DL-66 item 1
   and adopts views in a shell.
2. "Yes, and have log be a history feature for different entities e.g. guild, hero, etc." This is
   DL-99 item 2: the log folds into the History, which opens on your Guild and can be scoped to any
   Guild, Hero, Guildmaster or Patron.
3. "Key availability and attributes, and have ability to drill down to hero details." This is
   DL-99 item 3, with no fit score or odds.
4. "Yes, but in future" (DL-99 item 4).
5. "Yes, but in future" (DL-99 item 5).
6. "Open to redesign of style." DL-99 item 6: an agent proposes the direction as a prototype for
   the owner's approval.

## Appendix — the measurements

Section heights in pixels for a new game, phone / desktop:

| header | index | time | board | roster | offers | pool | market | hall | guildmaster | patrons | rankings | guilds | log | history | game |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 159 / 108 | 140 / 92 | 390 / 232 | 3501 / 2958 | 774 / 732 | 228 / 162 | 2216 / 1766 | 1858 / 1624 | 942 / 825 | 1358 / 1128 | 735 / 405 | 494 / 353 | 1613 / 1547 | 4840 / 3763 | 1838 / 1487 | 576 / 534 |

In-place pages at the desktop's width: a Hero's page, about 2,600px; a Rival Guild's page, about 3,800px
on the phone. The screenshots came from a scratch Playwright script against `npm run preview -w web`.
They are not kept in the repository.
