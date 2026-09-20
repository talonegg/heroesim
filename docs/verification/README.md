# Verification evidence

Screenshots written by the browser suite, one folder per Playwright project. They are
**evidence, not assertions**: nothing fails on a pixel diff (E8 §5). What actually gets
asserted is in `web/e2e/` — no horizontal overflow, every tap target at least 40×40 CSS
pixels, a playable journey, and zero requests leaving the origin.

Regenerate them with, from the repository root:

```
npm run build
npm run e2e
```

## Non-browser verification

Two layers prove the game works without a browser at all, and are evidence in their own right:

- **API testing** — `engine/tests/api.test.ts`: determinism from a seed, input immutability, the
  save round-trip, typed rejection of bad calls, and a 200-seed full-Career smoke run.
- **CLI end-to-end** — `cli/tests/e2e.test.ts`: spawns the real process (via `--script`/`--quiet`)
  and plays a scripted Career to a save, then resumes it to Retirement or Insolvency.

## Projects

All three run on Chromium (DL-10 — the tablet is an iPad-class viewport, not WebKit).

| Folder | Device | Viewport |
| --- | --- | --- |
| `mobile/` | Pixel 7 | 412×915, `deviceScaleFactor` 2.625 |
| `tablet/` | iPad-class on Chromium | 820×1180, `deviceScaleFactor` 2 |
| `desktop/` | Desktop Chrome | 1280×800, screenshots full-page |

## Views

| File | What it shows |
| --- | --- |
| `start.png` | the New Career screen: seed, optional years, loading a save |
| `board.png` | the Board pane, with a Party already in the field |
| `roster.png` | the Roster: the Guildmaster, then each Hero with Stats and Traits |
| `report.png` | the Report: Beats and a return, as `narrate` worded them |
| `party.png` | the Party picker over the Board |
| `slots.png` | the slot picker: Save, Load and Clear per slot |
| `reckoning.png` | a Career that has ended, offering only a new one |
| `refusal.png` | the Party picker naming a Hero who will not go, and the price of insisting (E2) |
| `party-unavailable.png` | the Party picker naming a Hero who cannot be sent at all, and why (E3) |
| `injured-roster.png` | the Roster with an Injury, the Day it lifts, and a Scar (E3) |
| `hall.png` | the Hall with coin enough for all three improvements (E3) |
| `hall-mixed.png` | the Hall part-built: one improvement built, one affordable, one the Guild is short for — the state that carries the longest strings (E3) |
| `applicants.png` | the Applicants sheet with all three states at once: somebody fresh the Guild can pay for, somebody coming back, and somebody too dear — the Background and Traits above the Stats, and no calibre anywhere (E4) |
| `applicants-full.png` | the same sheet with the Roster at its cap: every Accept disabled, with the reason written out on each card (E4) |
| `rivals.png` | the other Guilds: each one's Standing, its Regard for yours and the reason it stands there, and everybody it employs — Background and Traits above the Stats, both fees on the controls, and the reason a move is refused written out beside a disabled one. Four states at once: somebody who can be brought over, somebody who can be taken without asking, somebody who is neither, and a Guild that has been wronged (E5) |
| `league.png` | the League: every Guild ordered by Standing as stacked rows rather than a table, your own marked in words, and a footer saying what Standing is and is not (E5) |
| `roster-at-risk.png` | the Roster with every Hero exactly on `poachRegardThreshold` and two other Guilds wronged enough to try: each row marked **in words** with the fact that another Guild could take them, and the Guilds minded to named on it (E5, DL-22 §2) |
| `word.png` | two Parties waiting on word at once, which is where every string the pane has is on screen together: the prompt with its tokens filled, each option on its own control with its cost, the one the Party will take on its own judgement marked **in words**, the countdown in words, and — on the second Party — a paid option the Guild cannot meet, disabled with its cost still shown and the reason written out beside it. Advance is disabled, and the header says why (E6) |
| `word-leave-it.png` | the same pane with the quiet control armed: what letting the Days run will actually do, each waiting Party named with the Day it decides for itself and the option it will take, and a second tap to go through with it (E6, DL-24 §A1) |
| `word-badge.png` | the same Career at 360px: the bottom bar's Report button reading `Word (2)`, a count and a word rather than a dot, because a badge nobody can see the colour of must still say what it means (E6, E8-S3) |
| `more.png` | the More sheet: the three secondary views E8-S6 added, each a labelled control with a line saying what it holds, never an icon and never a row of initials (E8-S6, DL-27 §8) |
| `patrons.png` | the Patrons by Sphere: each one's Regard with the reason it last moved beside it, what they have on the Board, and one at the posting floor saying in `narrate`'s own words that they are posting nothing at all and will until their Regard comes back up (E7-S3, E8-S6) |
| `former.png` | the Heroes who are no longer on the Roster, one of each way the engine records an exit: somebody who walked out, somebody who did not come back, and somebody who reached the end of a working life — with the Day, the reason, their Stats, their Traits and their Regard still readable (E7-S3, E8-S6) |
| `history.png` | the rolling five: the last five things the player did and what came of them, each in `narrate`'s own words under its own Day stamp, and each shown **whole** because the browser wraps and scrolls (E7-S2, E8-S6) |
| `history-empty.png` | the same sheet before anything has been decided: a sentence saying so rather than an empty box |
| `ended.png` | a Career that has ended, loaded and read: the reckoning with its harm line and the Heroes another Guild took, and a header offering only the League, More and a new Career — no Advance, no Send, no Applicants, no Hall, no deal, no Saves, and **neither clock**, because nothing falls due on a Guild that has finished and the Board will never refresh again (E8-S6, DL-27 §9, and E8 §6.1) |

Each of the five `layout.spec.ts` pane and sheet views has a `-dark.png` beside it, and so do
the five views E8-S6 added — `patrons`, `former`, `history`, `more` and `ended` — which were
light-only until independent verification added them, E8 §3 saying both themes are tested for
contrast. The rest are light only.

`desktop/zoom-200.png` is the one shot no other project has: a 1280×800 window at **200% browser
zoom**, emulated as the 640×400 CSS viewport at `deviceScaleFactor: 2` that Chromium actually
produces, falling back to the two-column tablet arrangement rather than overflowing (E8-S3's last
acceptance box; DL-27 §12).

The mobile and tablet shots are the viewport; the desktop shots are the full page.
