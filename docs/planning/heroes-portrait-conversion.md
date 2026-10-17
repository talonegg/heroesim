# Hero portrait conversion

Summary of the `tools/portraits` tool update and the batch conversion performed for the Hero portraits (DL-135).

## 1. Background and purpose

The Hero portrait uploads, stored in `heroesim-inbox/heroes/`, required conversion into web-ready WebP portraits matching the specifications and quality ladder of the Guildmaster portraits in `media/portraits/guildmasters/`:

- **Full picture:** 480 × 640 WebP, at most 120,000 bytes (120 kB).
- **Thumbnail:** 160 × 213 WebP, at most 12,000 bytes (12 kB, about 10 kB).
- **Quality ladder:** 0.8 down to 0.5 in steps of 0.05, drawn in Chromium.
- **Hierarchy:** Mirrored in `media/portraits/heroes/{sex}/{class}/` matching the inbox structure (`female/healers`, `female/mages`, `female/rogues`, `female/warriors`, `male/healers`, `male/mages`, `male/rogues`, `male/warriors`).
- **Naming:** Retaining the source photo's base filename as `<name>.webp` and `<name>.thumb.webp`.

All 1,200 source photos were pre-verified at 768 × 1024 (exact 3:4 aspect ratio).

## 2. Tool extension: `convert-tree`

The existing `tools/portraits` tool was extended to support recursive directory conversion without adding external image libraries, strictly upholding the project invariant that Chromium draws every picture (DL-135 item 11):

### Command line syntax

```sh
npm run portraits -- convert-tree <sourceDir> --out <destDir> [--overwrite] [--concurrency <n>] [--json]
```

- **`<sourceDir>` and `--out <destDir>`:** Scans the source directory recursively, resolves all pictures, and writes `<name>.webp` and `<name>.thumb.webp` into the corresponding relative subdirectory under `<destDir>`.
- **`--overwrite`:** By default, pictures whose `.webp` and `.thumb.webp` already exist in `<destDir>` are skipped (allowing safe resumes). Supplying `--overwrite` forces re-rendering of all files.
- **`--concurrency <n>`:** Controls the size of the worker page pool (default: 4 concurrent worker pages in headless Chromium).
- **Resilience:** Errors on individual images (e.g. noise exceeding file bounds at quality 0.5) are logged and collected; the batch continues and reports all failures at the conclusion with exit code 1 if any failed.

### Code changes

1. **`tools/portraits/src/chromium.ts`:**
   - Enhanced `launchChromium(concurrency = 1)` and `withChromium(work, concurrency = 1)` to pool worker pages in the single headless Chromium browser instance.
   - Concurrent calls to `draw` and `drawEach` acquire and release worker pages asynchronously.
2. **`tools/portraits/src/cli.ts`:**
   - Added command `convert-tree`, parsing `--overwrite` and `--concurrency`.
   - Implemented `commandConvertTree` with recursive scanning, relative path resolution, progress logging, skip logic, and error aggregation.
3. **`tools/portraits/README.md`:**
   - Documented `convert-tree` command under the Commands section.
4. **`tools/portraits/src/chromium.test.ts`:**
   - Added unit and command-line integration tests covering tree hierarchy preservation, skip vs overwrite behavior, and refusal error handling.

## 3. Conversion execution and verification

The batch conversion was executed against all 1,200 Hero photos:

```sh
npm run portraits -- convert-tree C:/jhh/source/heroesim-inbox/heroes --out media/portraits/heroes --concurrency 6
```

### Results

- **Total source pictures:** 1,200 PNG files across 8 subdirectories (150 in each).
- **Execution time:** Approximately 55 seconds using 6 Chromium worker pages (~22 pictures/second).
- **Conversion count:** 1,200 converted, 0 skipped, 0 failed.
- **Files created:** 2,400 WebP files (1,200 full pictures + 1,200 thumbnails) in `media/portraits/heroes/`:
  - `female/healers/`: 150 `.webp` + 150 `.thumb.webp`
  - `female/mages/`: 150 `.webp` + 150 `.thumb.webp`
  - `female/rogues/`: 150 `.webp` + 150 `.thumb.webp`
  - `female/warriors/`: 150 `.webp` + 150 `.thumb.webp`
  - `male/healers/`: 150 `.webp` + 150 `.thumb.webp`
  - `male/mages/`: 150 `.webp` + 150 `.thumb.webp`
  - `male/rogues/`: 150 `.webp` + 150 `.thumb.webp`
  - `male/warriors/`: 150 `.webp` + 150 `.thumb.webp`

### Verification checks

1. **Dimensions:** Verified all 1,200 pictures are 480 × 640 and all 1,200 thumbnails are 160 × 213.
2. **File sizes:** Verified 0 pictures exceed 120,000 bytes, and 0 thumbnails exceed 12,000 bytes.
3. **Incremental skip:** Re-running `convert-tree` without `--overwrite` completed in under 2 seconds reporting 1,200 skipped and 0 converted.
4. **Tool suite health:** All 62 test cases in `tools/portraits` passed (`npm test -- tools/portraits`).
5. **Register check:** `npm run portraits -- check` passed.
