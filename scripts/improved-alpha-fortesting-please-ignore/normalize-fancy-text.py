"""Normalize fancy Unicode characters in HTML and JSON files.

Converts fullwidth / letterlike / spacing Unicode variants to their plain ASCII
equivalents without touching symbols that are legitimately decorative (arrows,
bullets, currency signs, etc.).

Usage (from repo root):

    python scripts/normalize-fancy-text.py [paths...] [--write] [--quiet]

Only .html and .json files are touched. Binary-like paths (.git, node_modules,
assets/pdfjs, etc.) are always skipped.
"""

from __future__ import annotations

import argparse
import unicodedata
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TARGET_SUFFIXES = frozenset({".html", ".json"})
EXCLUDED_DIR_PARTS = frozenset(
    {
        ".git",
        ".agents",
        ".codex",
        "node_modules",
        "vendor",
        "assets/pdfjs",
        "wp-content",
        "wp-includes",
    }
)


# ---------------------------------------------------------------------------
# Core normalization
# ---------------------------------------------------------------------------


def _normalized_char(char: str) -> str:
    """Return the NFKC-normalized form of *char* only when safe to do so.

    "Safe" means the character is a fullwidth variant, a text letter/digit, or
    a space-like character — things a reader would expect to be the plain ASCII
    equivalent.  Symbols that carry independent meaning (arrows, bullets, math
    operators, currency signs) are left untouched.
    """
    normalized = unicodedata.normalize("NFKC", char)
    if normalized == char:
        return char

    codepoint = ord(char)
    category = unicodedata.category(char)
    is_fullwidth = 0xFF00 <= codepoint <= 0xFFEF
    is_text = category[0] in {"L", "N"}  # Letter or Number
    is_space = category == "Zs"           # Unicode space separator

    return normalized if (is_fullwidth or is_text or is_space) else char


def normalize_fancy_text(value: str) -> str:
    """Normalize every character in *value*, returning a new string."""
    return "".join(_normalized_char(c) for c in value)


# ---------------------------------------------------------------------------
# File discovery
# ---------------------------------------------------------------------------


def _is_excluded(path: Path) -> bool:
    """Return True when *path* lives under an excluded directory."""
    try:
        rel = path.relative_to(ROOT).as_posix().lower()
    except ValueError:
        rel = path.as_posix().lower()
    return any(part in rel for part in EXCLUDED_DIR_PARTS)


def _qualifies(path: Path, roots: list[Path]) -> bool:
    """Return True when *path* should be processed.

    A path qualifies when:
    - it has a target suffix, AND
    - it is not excluded by directory rules, AND
    - it falls under at least one of the requested roots (or IS a root itself).
    """
    if path.suffix.lower() not in TARGET_SUFFIXES:
        return False
    if _is_excluded(path):
        return False
    # When the path itself is one of the roots, accept it unconditionally.
    if path in roots:
        return True
    return any(_under_root(path, root) for root in roots)


def _under_root(path: Path, root: Path) -> bool:
    try:
        path.relative_to(root)
        return True
    except ValueError:
        return False


def discover_files(roots: list[Path]) -> list[Path]:
    """Discover all qualifying files under *roots*, deduped and sorted."""
    seen: set[Path] = set()
    for root in roots:
        candidates = [root] if root.is_file() else root.rglob("*") if root.is_dir() else []
        for path in candidates:
            if path.is_file() and path not in seen and _qualifies(path, roots):
                seen.add(path)
    return sorted(seen, key=lambda p: p.as_posix())


# ---------------------------------------------------------------------------
# Change detection
# ---------------------------------------------------------------------------


@dataclass(slots=True)
class Change:
    path: Path
    line: int
    before: str
    after: str


def collect_changes(path: Path) -> tuple[str, list[Change]]:
    """Read *path*, compute normalized content, and return differing lines."""
    original = path.read_text(encoding="utf-8-sig")
    normalized = normalize_fancy_text(original)
    if normalized == original:
        return original, []

    changes: list[Change] = []
    for index, (before, after) in enumerate(
        zip(original.splitlines(), normalized.splitlines()), start=1
    ):
        if before != after:
            changes.append(Change(path=path, line=index, before=before.strip(), after=after.strip()))

    # Edge case: normalization changed the number of lines (shouldn't happen,
    # but guard anyway).
    original_lines = original.splitlines()
    normalized_lines = normalized.splitlines()
    if len(original_lines) != len(normalized_lines):
        changes.append(
            Change(
                path=path,
                line=max(len(original_lines), len(normalized_lines)),
                before="<line count changed>",
                after="",
            )
        )

    return normalized, changes


# ---------------------------------------------------------------------------
# Display helpers
# ---------------------------------------------------------------------------


def _safe_preview(value: str, width: int = 100) -> str:
    """Truncate and ASCII-escape *value* so it prints safely on any terminal."""
    return value[:width].encode("ascii", "backslashreplace").decode("ascii")


def display_change(change: Change) -> str:
    try:
        rel = change.path.relative_to(ROOT).as_posix()
    except ValueError:
        rel = str(change.path)
    before = _safe_preview(change.before)
    after = _safe_preview(change.after)
    return f"{rel}:{change.line}: {before} -> {after}"


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def _parse_roots(values: list[str]) -> list[Path]:
    return [(ROOT / v).resolve() for v in values]


def main() -> int:
    parser = argparse.ArgumentParser(
        description=(
            "Normalize fancy Unicode text in HTML and JSON files "
            "without touching JS or CSS."
        )
    )
    parser.add_argument(
        "paths",
        nargs="*",
        default=["."],
        help="files or folders to scan, relative to the repo root (default: entire repo)",
    )
    parser.add_argument(
        "--write",
        action="store_true",
        help="rewrite files in-place with normalized text",
    )
    parser.add_argument(
        "--quiet",
        action="store_true",
        help="suppress per-line output; only print the summary",
    )
    args = parser.parse_args()

    roots = _parse_roots(args.paths)
    files = discover_files(roots)

    changed_files = 0
    changed_lines = 0

    for path in files:
        normalized, changes = collect_changes(path)
        if not changes:
            continue

        changed_files += 1
        changed_lines += len(changes)

        if not args.quiet:
            for change in changes:
                print(display_change(change))

        if args.write:
            path.write_text(normalized, encoding="utf-8", newline="")

    action = "Normalized" if args.write else "Found"
    print(f"{action} {changed_lines} line(s) in {changed_files} file(s).")
    if not args.write and changed_files:
        print("Run again with --write to apply changes.")

    return 1 if (changed_files and not args.write) else 0


if __name__ == "__main__":
    raise SystemExit(main())
