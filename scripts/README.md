# Scripts Guide For LLM Agents

This folder contains repo-local tools for reading, updating, and validating the
DILG Cebu Province static website. Prefer these scripts over ad hoc commands.
They encode local assumptions, reduce token-heavy file reading, and keep broad
HTML changes safer.

## Fast Start

Run these first when entering a new task:

```powershell
python scripts/context.py
git status --short
```

Use `context.py` for a compact briefing. It reports the repository root, doctor
status, newest NEWS folders, key hook lines, and changed HTML/CSS/JS files.

If PowerShell fails with a process startup error, run the same Python command
through `cmd.exe` or retry with a smaller command. Do not abandon the helper
workflow.

## Decision Map

Use this map before reading large files:

| Task | Use |
| --- | --- |
| Quick repo briefing | `python scripts/context.py` |
| List important site inventory | `python scripts/inventory.py` |
| Find changed files with suggested next steps | `python scripts/changed.py` |
| Print NEWS hook line numbers | `python scripts/news-maintenance.py hooks` or `python scripts/hooks.py` |
| Inspect one NEWS folder before placement | `python scripts/news-maintenance.py inspect NEWS/<folder>` |
| Plan guarded NEWS placement | `python scripts/news-workflow.py plan NEWS/<folder>` |
| Apply guarded NEWS placement | `python scripts/news-workflow.py apply NEWS/<folder>` |
| Validate NEWS workflow state | `python scripts/news-workflow.py doctor` |
| Run NEWS guardrail regression tests | `python scripts/news-workflow.py self-test` |
| Rebuild static search | `python scripts/site-maintenance.py search rebuild` |
| Test search results | `python scripts/site-maintenance.py search find "<query>"` |
| Check or fix fancy Unicode | `python scripts/site-maintenance.py text check` / `fix` |
| Check or fix trailing whitespace | `python scripts/site-maintenance.py whitespace check` / `fix` |
| Clean Python cache side effects | `python scripts/site-maintenance.py cache clean` |
| Full quick site health check | `python scripts/site-maintenance.py doctor --git` |
| Grep from terminal with Python fallback | `scripts\pgrip.cmd` or `python scripts/pgrip.py` |
| Diff from terminal with Python fallback | `scripts\pdifflib.cmd` or `python scripts/pdifflib.py` |
| Detect local asset reference issues | `python scripts/refs.py` |

## Standard Workflows

### Orientation Before Any Site Edit

```powershell
python scripts/context.py
python scripts/changed.py
git status --short
```

Use this when the user says to read first, inspect the repo, or avoid guessing.
`context.py` is the shortest useful snapshot. `changed.py` helps separate the
current task from existing dirty worktree changes.

### NEWS Article Placement

Always prefer the guarded NEWS workflow.

```powershell
python scripts/news-maintenance.py inspect NEWS/<news-folder>
python scripts/news-workflow.py plan NEWS/<news-folder>
python scripts/news-workflow.py apply NEWS/<news-folder>
python scripts/news-workflow.py doctor NEWS/<news-folder>
python scripts/site-maintenance.py search find "<important term>"
```

Rules:

- Read the `inspect` output before editing.
- Do not hand-edit generated NEWS sections in `index.html` or `news.html`
  unless the workflow cannot handle the task.
- The workflow owns regions marked by `NEWS_WORKFLOW_*_BEGIN` and
  `NEWS_WORKFLOW_*_END`.
- `apply` must abort and roll back if protected regions outside approved NEWS
  blocks change.
- Custom kickers are supported with:

```powershell
python scripts/news-workflow.py apply NEWS/<folder> --kicker NEWS/<folder>=LABEL
```

### Non-NEWS HTML Menu Or Content Edits

Use targeted search first:

```powershell
rg -n "Text or hook to change" -g "*.html"
python scripts/context.py
```

After editing many pages:

```powershell
python scripts/site-maintenance.py whitespace fix
python scripts/site-maintenance.py search rebuild
python scripts/site-maintenance.py cache clean
python scripts/site-maintenance.py doctor --git
```

If generated search files changed, that is expected after `search rebuild`.
If `scripts/__pycache__/*.pyc` changed, run `cache clean`.

### Search Index Maintenance

Search is generated. Do not hand-edit these files except for debugging:

- `assets/search-index.json`
- `assets/js/search-index.js`

Use:

```powershell
python scripts/site-maintenance.py search rebuild
python scripts/site-maintenance.py search find "Citizen's Charter"
```

`search find` is useful for checking whether changed text is discoverable in the
site search.

### Text And Whitespace Hygiene

Fancy Unicode text is discouraged in HTML/JSON content because normal search can
miss it. Emojis are allowed when intentionally used.

```powershell
python scripts/site-maintenance.py text check
python scripts/site-maintenance.py text fix
python scripts/site-maintenance.py whitespace check
python scripts/site-maintenance.py whitespace fix
```

`text fix` only targets `.html` and `.json` through the normalizer. It does not
rewrite `.js` or `.css`.

### Final Verification

Use this before reporting completion:

```powershell
python scripts/site-maintenance.py doctor --git
python scripts/site-maintenance.py cache clean
git status --short
```

`doctor --git` runs text checks, whitespace checks, search index scan, and
`git diff --check`. Git may print LF/CRLF warnings on Windows. Treat them as
line-ending warnings unless the command exits nonzero.

## Script Reference

### `context.py`

Read-only session briefing. Prints:

- repo root
- current date
- site doctor status
- newest NEWS folders
- NEWS hook line numbers
- uncommitted HTML/CSS/JS files

Use before making broad changes.

### `inventory.py`

Read-only inventory helper. Use when you need a higher-level site or NEWS list
without opening many files.

### `changed.py`

Read-only dirty-worktree helper. Use to see changed files and likely follow-up
commands. Helpful when the worktree already contains unrelated changes.

### `hooks.py`

Read-only hook-line helper for important edit points, especially `index.html`
and `news.html`.

### `repo_read.py`

Shared library for read-only helpers. It centralizes NEWS discovery, git status
parsing, and hook lookup. LLM agents usually should not call it directly.

### `refs.py`

Reference scanner for local asset paths. Use it to spot missing local images,
scripts, styles, and related references.

Important: `refs.py` can be noisy in this legacy static site because some
external URLs, WordPress-style paths, CSS URLs, and generated references may not
be real local files. Treat it as an investigation tool, not a proof of a clean
site.

### `news-maintenance.py`

Read-first NEWS helper.

Commands:

```powershell
python scripts/news-maintenance.py inspect NEWS/<folder>
python scripts/news-maintenance.py hooks
```

`inspect` reports:

- article title
- date
- kicker and summary
- hero and preview assets
- hook lines to read before editing
- suggested snippets for `index.html` and `news.html`

It is intentionally read-only unless an output file is explicitly requested.

### `news-workflow.py`

Guarded NEWS mutation workflow.

Commands:

```powershell
python scripts/news-workflow.py plan NEWS/<folder>
python scripts/news-workflow.py apply NEWS/<folder>
python scripts/news-workflow.py doctor [NEWS/<folder>]
python scripts/news-workflow.py self-test
python scripts/news-workflow.py clean
```

Options:

```powershell
--date-source folder
--date-source article
--kicker NEWS/<folder>=LABEL
```

Behavior:

- discovers NEWS folders
- updates article hero/gallery/title where applicable
- keeps homepage NEWS cards at the expected top entries
- keeps `news.html` article list complete
- caps featured NEWS slider at 50 newest eligible slides
- rebuilds search index during normal apply
- restores snapshots if guardrails fail

Use `self-test` after changing this script.

### `site-maintenance.py`

Central site maintenance command.

Search:

```powershell
python scripts/site-maintenance.py search rebuild
python scripts/site-maintenance.py search rebuild --check
python scripts/site-maintenance.py search find "<query>" --limit 10
```

Text:

```powershell
python scripts/site-maintenance.py text check [paths...]
python scripts/site-maintenance.py text fix [paths...]
```

Whitespace:

```powershell
python scripts/site-maintenance.py whitespace check [paths...]
python scripts/site-maintenance.py whitespace fix [paths...]
```

Cache:

```powershell
python scripts/site-maintenance.py cache clean
```

Git hygiene:

```powershell
python scripts/site-maintenance.py git diff-check
```

Combined:

```powershell
python scripts/site-maintenance.py doctor --git
python scripts/site-maintenance.py hygiene --git
```

Prefer `doctor --git` for verification. Use `hygiene --git` only when you want
the script to actively fix text, whitespace, rebuild search, clean cache, and
then run checks.

### `build-search-index.py`

Lower-level generator used by `site-maintenance.py search rebuild`.

Prefer:

```powershell
python scripts/site-maintenance.py search rebuild
```

Call `build-search-index.py` directly only when debugging the generator.

### `normalize-fancy-text.py`

Lower-level text normalizer used by `site-maintenance.py text check|fix`.

Prefer:

```powershell
python scripts/site-maintenance.py text check
python scripts/site-maintenance.py text fix
```

### `pgrip.py` and `pgrip.cmd`

Python grep helper for environments where native tools are inconsistent.

Use cases:

- regex or fixed-string search
- grep-style exit codes
- include globs
- context lines
- count or file-only output

Prefer `rg` when available. Use `pgrip` when Windows shell quoting or tool
availability causes problems.

### `pdifflib.py` and `pdifflib.cmd`

Python diff helper.

Use cases:

- compare files or directories
- unified, context, or ndiff output
- brief/stat output
- include globs
- binary detection
- diff-style exit codes

Use it when shell diff tools are unavailable or inconsistent.

### `improved-alpha-fortesting-please-ignore/`

Experimental or archived script variants. Do not use for normal work unless the
user explicitly asks to inspect or compare them. Prefer the scripts in the main
`scripts/` directory.

### `__pycache__/`

Python bytecode cache. It may appear after running helpers.

Use:

```powershell
python scripts/site-maintenance.py cache clean
```

Do not manually edit `.pyc` files.

## Guardrails For LLM Agents

- Read live files before editing. Do not guess from memory.
- Prefer `rg` and repo helpers before opening whole HTML pages.
- Keep edits scoped to requested sections.
- Do not rewrite whole pages for menu, footer, search, or NEWS changes.
- Do not hand-edit generated search indexes unless debugging.
- Do not bypass NEWS workflow markers.
- Preserve existing classes, indentation style, lazy-loading attributes, and
  `data-news-photo-slider` behavior when touching NEWS cards.
- After broad HTML edits, rebuild search and run doctor.
- After running Python helpers, clean cache side effects.
- Never revert unrelated user changes in a dirty worktree.

## Common Command Recipes

Find old menu labels:

```powershell
rg -n "Old Label" -g "*.html"
```

Check current hooks:

```powershell
python scripts/news-maintenance.py hooks
```

Inspect a new NEWS folder:

```powershell
python scripts/news-maintenance.py inspect NEWS/news-june-23-2026-001
```

Apply a NEWS item with a custom office label:

```powershell
python scripts/news-workflow.py plan NEWS/news-june-23-2026-001 --kicker NEWS/news-june-23-2026-001=LGMES
python scripts/news-workflow.py apply NEWS/news-june-23-2026-001 --kicker NEWS/news-june-23-2026-001=LGMES
```

Rebuild search after normal content edits:

```powershell
python scripts/site-maintenance.py search rebuild
```

Run final checks:

```powershell
python scripts/site-maintenance.py doctor --git
python scripts/site-maintenance.py cache clean
git status --short
```
