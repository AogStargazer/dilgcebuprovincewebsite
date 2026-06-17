# NEWS Update Playbook

This repository has a repeatable workflow for adding DILG Sugbo News articles. Follow this playbook before editing `index.html`, `news.html`, or any `NEWS/<folder>/` article page.

## Core Rules

- Read the live files first. Do not guess page structure from memory.
- Each news article folder belongs under `NEWS/<news-folder>/`.
- Each news folder should have one article HTML file. The preferred file name is `<news-folder>.html`.
- `FORSLIDERPREVIEW` is the first preview image for `news.html` featured slider and news cards.
- `index.html` and `news.html` DILG Sugbo Balita cards use the automatic no-arrow gallery slider and must include all regular photos from the article folder, with `FORSLIDERPREVIEW` first.
- The card badge/kicker must match the office or program label visible in the `FORSLIDERPREVIEW` artwork when one is present. Kickers can be arbitrary, so do not depend only on a fixed list.
- If the preview artwork shows a custom kicker that the workflow cannot infer from the article body, add `NEWS/<folder>/news.json` with `{ "kicker": "LABEL" }`, or run the workflow with `--kicker NEWS/<folder>=LABEL`.
- `FORMAINSLIDERPREVIEW` is the preview image for the homepage main slider in `index.html`.
- Add homepage main slider news only when a `FORMAINSLIDERPREVIEW` image exists.
- Insert homepage main slider news directly after the Provincial Director slide in `index.html`.
- The homepage DILG Sugbo Balita list in `index.html` must always contain exactly five news cards.
- The `news.html` news list is never capped. Do not delete old news cards from `news.html`; this page is the repo-wide access point for all news articles.
- Keep `news.html` ordered newest first while preserving every discoverable article card.
- After edits, normalize text and rebuild the generated search index.

## Recommended Commands

Use the workflow script for new work:

```powershell
python scripts/news-workflow.py plan NEWS/news-june-16-2026-001 NEWS/news-june-10-2026-001
python scripts/news-workflow.py apply NEWS/news-june-16-2026-001 NEWS/news-june-10-2026-001
python scripts/news-workflow.py doctor
```

For arbitrary or visual-only kickers:

```powershell
python scripts/news-workflow.py plan NEWS/<news-folder> --kicker NEWS/<news-folder>=CUSTOM
python scripts/news-workflow.py apply NEWS/<news-folder> --kicker NEWS/<news-folder>=CUSTOM
```

For a read-only inspection of one folder:

```powershell
python scripts/news-maintenance.py inspect NEWS/<news-folder>
```

For manual post-edit maintenance:

```powershell
python scripts/site-maintenance.py text fix NEWS index.html news.html
python scripts/site-maintenance.py search rebuild
python scripts/site-maintenance.py doctor
git diff --check
```

## Workflow Script Commands

### `plan`

Prints what the workflow would do without changing files:

```powershell
python scripts/news-workflow.py plan NEWS/<news-folder>
```

Use this first. It reports article title, date, preview assets, date mismatches, homepage card ordering, and homepage main slider additions.

### `apply`

Applies the full workflow:

```powershell
python scripts/news-workflow.py apply NEWS/<news-folder> [NEWS/<another-folder> ...]
```

This command:

- Updates each supplied article page title, visible title, date, hero image, and gallery image list.
- Updates `index.html` DILG Sugbo Balita to the five most recent article cards, each with the automatic no-arrow gallery slider using every regular photo in that article folder.
- Updates `news.html` DILG Sugbo Balita cards with the same automatic no-arrow gallery behavior, without capping or deleting news cards.
- Adds any supplied `FORMAINSLIDERPREVIEW` item to the homepage main slider after the Provincial Director slide.
- Updates `news.html` featured slider and news list by recency while preserving every discoverable article card.
- Runs text normalization and search rebuild.
- Removes accidental `scripts/__pycache__` tracked changes when possible.

### `doctor`

Checks the current repository state:

```powershell
python scripts/news-workflow.py doctor
```

It validates:

- `index.html` homepage news card count is exactly five.
- `news.html` contains every discoverable article card.
- `index.html` and `news.html` news cards include every expected folder photo in the automatic gallery slider.
- News cards are ordered newest first where dates are readable.
- New article folders have one article HTML page.
- Article `<title>` and visible `<h1 class="news-article__title">` match.
- Hero images and gallery images exist.
- `FORSLIDERPREVIEW` and `FORMAINSLIDERPREVIEW` assets are detected.
- Text normalization and search-index rebuild checks pass.
- `git diff --check` has no whitespace errors.

### `clean`

Removes predictable script side effects:

```powershell
python scripts/news-workflow.py clean
```

This restores tracked Python cache files under `scripts/__pycache__/` if they changed during maintenance.

## Common Mistakes To Avoid

- Do not use `FORSLIDERPREVIEW` in the homepage main slider unless the user explicitly approves it.
- Do not let `index.html` DILG Sugbo Balita grow past five cards.
- Do not delete old news cards from `news.html`; if a card disappears there, the article can become hard to access from the site.
- Do not blindly default a card badge to `LGCDD`; inspect the `FORSLIDERPREVIEW` image and article body for the correct office or program label.
- Do not assume the list of kickers is complete. New labels can appear at any time.
- Do not leave any DILG Sugbo Balita card slider with only one image when the article folder has more regular photos.
- Do not forget to rebuild `assets/search-index.json` and `assets/js/search-index.js`.
- Do not leave accidental `scripts/__pycache__` changes in the diff.
- Do not keep copied gallery images from an older article inside a new article page.
- Avoid fancy Unicode text in HTML/JSON content. Use plain searchable text such as `P5M` instead of styled or problematic symbols when needed.
- If the article date conflicts with the folder date, stop and decide intentionally. The workflow defaults to folder date because this site uses dated news folder names.
