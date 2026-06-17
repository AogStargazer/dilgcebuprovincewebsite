# Maintenance Tools

Use `scripts/site-maintenance.py` as the central maintenance entry point for routine static-site cleanup.

## Common Commands

Run this after normal page edits:

```powershell
python scripts/site-maintenance.py hygiene contact-info.html --git
```

Run this after broad page or NEWS edits:

```powershell
python scripts/site-maintenance.py hygiene NEWS index.html news.html --git
```

Run quick checks only:

```powershell
python scripts/site-maintenance.py doctor --git
```

## Available Tools

### Fancy Text

Checks and normalizes fancy Unicode text in `.html` and `.json` content.

```powershell
python scripts/site-maintenance.py text check NEWS index.html news.html
python scripts/site-maintenance.py text fix NEWS index.html news.html
```

### Trailing Whitespace

Finds or removes trailing spaces and tabs in maintainable text files.

```powershell
python scripts/site-maintenance.py whitespace check contact-info.html
python scripts/site-maintenance.py whitespace fix contact-info.html
```

### Search Index

Rebuilds the generated static search files.

```powershell
python scripts/site-maintenance.py search rebuild
python scripts/site-maintenance.py search find "important search term"
```

Generated files:

- `assets/search-index.json`
- `assets/js/search-index.js`

### Python Cache Cleanup

Restores tracked Python cache files and removes untracked cache files created by maintenance runs.

```powershell
python scripts/site-maintenance.py cache clean
```

### Git Diff Hygiene

Runs the same whitespace validation as `git diff --check`.

```powershell
python scripts/site-maintenance.py git diff-check
```

### One-Shot Hygiene

Runs fancy text fix, trailing whitespace fix, search rebuild, cache cleanup, and doctor. Add `--git` when you also want `git diff --check`.

```powershell
python scripts/site-maintenance.py hygiene --git
```

## Notes

- Search index files are generated; rebuild them instead of hand-editing them.
- `wp-content`, `wp-includes`, `assets/pdfjs`, `.git`, `.codex`, `.agents`, `vendor`, and `node_modules` are skipped by cleanup scans.
- The whitespace fixer writes UTF-8 text with LF endings. On Windows, Git may still warn that LF will be replaced by CRLF later depending on local Git settings.
