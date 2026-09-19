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

Each of the five pane and sheet views also has a `-dark.png` beside it: the same view
under `prefers-color-scheme: dark`. `start.png` and `reckoning.png` are light only.

The mobile and tablet shots are the viewport; the desktop shots are the full page.
