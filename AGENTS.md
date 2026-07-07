# Codex Instructions For This Repo

This is a static HTML website for DILG Cebu Province. Read the live files before editing. Do not guess page structure from memory.

## Safe Workflow

1. Run the context helper before changing news placements:
   ```powershell
   python scripts/news-maintenance.py inspect NEWS/<news-folder>
   ```
2. Read the hook lines reported by the helper in `index.html` and `news.html`.
3. Make focused edits only in the reported sections.
4. Use the guarded workflow for news placement:
   ```powershell
   python scripts/news-workflow.py plan NEWS/<news-folder>
   python scripts/news-workflow.py apply NEWS/<news-folder>
   ```
5. Verify:
   ```powershell
   python scripts/news-workflow.py self-test
   python scripts/news-workflow.py doctor NEWS/<news-folder>
   python scripts/site-maintenance.py search find "<important search term>"
   ```

The workflow must abort and roll back if anything outside the approved news regions in `index.html` or `news.html` changes. Do not bypass this guardrail with manual whole-page rewrites.

The approved regions are explicitly enclosed by `NEWS_WORKFLOW_*_BEGIN` and `NEWS_WORKFLOW_*_END` HTML comments. Treat those markers as part of the repository contract. Custom `apply --kicker NEWS/<folder>=LABEL` values are persisted to `NEWS/<folder>/news.json`.

## News Update Rules

News article folders live under `NEWS/<news-folder>/`. Each news folder should contain one article HTML file and image assets.

For supplied folders, the workflow keeps the browser `<title>` equal to the visible article title, uses the folder's `FORSLIDERPREVIEW` as the article hero, replaces gallery entries with regular photos from that same folder, and clears stale gallery entries when no regular photos exist.

The `news.html` featured image slider is limited to 50 newest eligible articles. New slides replace oldest slides. The news-card list remains uncapped.

Use `scripts/news-maintenance.py` to inspect the new folder. The helper is intentionally read-only by default. It prints the article title, date, suggested summary, available preview images, existing insertion hooks, and snippets that can be copied into `index.html` and `news.html`.

Asset naming conventions:

- `*FORSLIDERPREVIEW*` is used for news cards and news-page sliders.
- `*FORMAINSLIDERPREVIEW*` is used for the homepage main slider in `index.html`.
- If `FORMAINSLIDERPREVIEW` is absent, do not invent one. Use the reported `FORSLIDERPREVIEW` image for news cards only, unless the user explicitly approves another image.

Current hook areas:

- `index.html`
  - Homepage main slider: look for `<div class="main-slider-container full-width">`.
  - DILG Sugbo Balita list: look for `<div class="sugbo-balita-list">` under the `dilg-sugbo-balita-title` section.
- `news.html`
  - Featured news image slider: look for `<div class="news-slider-wrap">`.
  - News page list: look for `<div class="sugbo-balita-list">`.

When adding a new article to the top, insert it before the first existing `<a class="sugbo-balita-link"...>` inside the target list. Preserve the existing card structure, classes, indentation style, lazy-loading attributes, and `data-news-photo-slider` behavior.

## Search And Text Maintenance

Static search is generated. Do not hand-edit generated search files unless debugging.

Use:

```powershell
python scripts/site-maintenance.py search rebuild
```

The generated files are:

- `assets/search-index.json`
- `assets/js/search-index.js`

Fancy Unicode text is not allowed in HTML/JSON content because it breaks normal search. Emojis are allowed. Use:

```powershell
python scripts/site-maintenance.py text check
python scripts/site-maintenance.py text fix
```

The text normalizer touches only `.html` and `.json`. It intentionally does not touch `.js` or `.css`.

## Editing Discipline

- Read first, then edit.
- Keep changes scoped to the requested page sections.
- Do not rewrite whole HTML pages.
- Do not touch JS/CSS for a news placement unless the user explicitly asks.
- Do not change old news entries except as needed to keep ordering or valid HTML.
- Do not update historical `NEWS/` article pages for current personnel position
  or cluster-assignment changes. Article text is history; update current org
  chart/personnel pages and generated search only.
- For personnel or position removals, read every current surface before
  reporting done: `organizationalchart*.html`, `organizationaldilgpersonnel.html`,
  `cebuprovincemapLGU.html`, `dilgcebuprovinceofficesmap.html`, then rebuild
  generated search. Also scan standalone tooltip data in `MapTooltipinsideHTML.js`
  and `svgmaptooltipengine.js`. Map pages can keep stale secondary entries such
  as `lgoo2Name`, `lgoo2Designation`, and `lgoo2Image`.
- Never assume a person, LGU, cluster, office, or position is already clean
  because one updated entry exists. Treat every related subject as checkable:
  search by person name, LGU/office/cluster name, old position text, new
  position text, image filename, and secondary map fields before editing or
  reporting complete.
- After broad or generated changes, run the maintenance checks listed above.
