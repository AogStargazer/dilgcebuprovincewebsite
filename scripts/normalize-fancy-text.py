from __future__ import annotations

import argparse
import unicodedata
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
TARGET_SUFFIXES = {".html", ".json"}
DEFAULT_EXCLUDED_DIR_PARTS = {
    ".git",
    ".agents",
    ".codex",
    "node_modules",
    "vendor",
    "assets/pdfjs",
    "wp-content",
    "wp-includes",
}


@dataclass
class Change:
    path: Path
    line: int
    before: str
    after: str


def normalized_char(char: str) -> str:
    normalized = unicodedata.normalize("NFKC", char)
    if normalized == char:
        return char

    codepoint = ord(char)
    category = unicodedata.category(char)
    is_fullwidth = 0xFF00 <= codepoint <= 0xFFEF
    is_text_letter_or_number = category[0] in {"L", "N"}
    is_spacing = category == "Zs"

    if is_text_letter_or_number or is_spacing or is_fullwidth:
        return normalized

    return char


def normalize_fancy_text(value: str) -> str:
    return "".join(normalized_char(char) for char in value)


def should_skip_path(path: Path, roots: list[Path]) -> bool:
    try:
        rel = path.relative_to(ROOT)
    except ValueError:
        rel = path

    normalized_parts = rel.as_posix().lower()
    if path.suffix.lower() not in TARGET_SUFFIXES:
        return True

    for root in roots:
        try:
            path.relative_to(root)
            break
        except ValueError:
            continue
    else:
        return True

    return any(part in normalized_parts for part in DEFAULT_EXCLUDED_DIR_PARTS)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def discover_files(roots: list[Path]) -> list[Path]:
    files: list[Path] = []
    for root in roots:
        if root.is_file():
            if not should_skip_path(root, roots):
                files.append(root)
            continue

        for suffix in TARGET_SUFFIXES:
            for path in root.rglob(f"*{suffix}"):
                if not should_skip_path(path, roots):
                    files.append(path)

    return sorted(set(files), key=lambda path: path.relative_to(ROOT).as_posix())


def collect_changes(path: Path) -> tuple[str, list[Change]]:
    original = read_text(path)
    normalized = normalize_fancy_text(original)
    if normalized == original:
        return original, []

    changes: list[Change] = []
    original_lines = original.splitlines()
    normalized_lines = normalized.splitlines()
    max_lines = max(len(original_lines), len(normalized_lines))
    for index in range(max_lines):
        before = original_lines[index] if index < len(original_lines) else ""
        after = normalized_lines[index] if index < len(normalized_lines) else ""
        if before != after:
            changes.append(Change(path=path, line=index + 1, before=before.strip(), after=after.strip()))

    return normalized, changes


def display_change(change: Change) -> str:
    rel = change.path.relative_to(ROOT).as_posix()
    before = safe_preview(change.before)
    after = safe_preview(change.after)
    return f"{rel}:{change.line}: {before} -> {after}"


def safe_preview(value: str) -> str:
    preview = value[:100]
    return preview.encode("ascii", "backslashreplace").decode("ascii")


def parse_roots(values: list[str]) -> list[Path]:
    roots = []
    for value in values:
        path = (ROOT / value).resolve()
        roots.append(path)
    return roots


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Normalize fancy Unicode text in HTML and JSON files without touching JS or CSS."
    )
    parser.add_argument(
        "paths",
        nargs="*",
        default=["."],
        help="files or folders to scan, relative to the repo root",
    )
    parser.add_argument("--write", action="store_true", help="rewrite files with normalized text")
    parser.add_argument("--quiet", action="store_true", help="only print the summary")
    args = parser.parse_args()

    roots = parse_roots(args.paths)
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

    return 1 if changed_files and not args.write else 0


if __name__ == "__main__":
    raise SystemExit(main())
