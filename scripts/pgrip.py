r"""Search text files with Python regular expressions.

Examples:

    scripts\pgrip "NEWS_WORKFLOW_.*_BEGIN" index.html news.html
    scripts\pgrip -i -g "*.html" "citizen.?s charter" .
    scripts\pgrip -F -l "assets/js/search-index.js" .

Exit codes follow grep conventions: 0 for a match, 1 for no match, and 2 for
an invalid pattern or filesystem error.
"""

from __future__ import annotations

import argparse
import fnmatch
import os
import re
import sys
from collections import deque
from pathlib import Path
from typing import Iterator


DEFAULT_EXCLUDED_DIRS = {
    ".git",
    ".agents",
    ".codex",
    "__pycache__",
    "node_modules",
    "vendor",
}
DEFAULT_EXCLUDED_PARTS = {
    "assets/pdfjs",
    "wp-content",
    "wp-includes",
}


def console_print(value: str = "") -> None:
    encoding = sys.stdout.encoding or "utf-8"
    print(value.encode(encoding, errors="replace").decode(encoding))


def display_path(path: Path) -> str:
    try:
        return path.resolve().relative_to(Path.cwd().resolve()).as_posix()
    except ValueError:
        return str(path)


def is_excluded_directory(path: Path, include_hidden: bool) -> bool:
    name = path.name.lower()
    if name in DEFAULT_EXCLUDED_DIRS:
        return True
    if not include_hidden and name.startswith("."):
        return True

    normalized = path.as_posix().lower()
    return any(
        normalized == part or normalized.endswith("/" + part) or f"/{part}/" in normalized
        for part in DEFAULT_EXCLUDED_PARTS
    )


def matches_globs(path: Path, includes: list[str], excludes: list[str]) -> bool:
    value = path.as_posix()
    name = path.name
    if includes and not any(fnmatch.fnmatch(value, pattern) or fnmatch.fnmatch(name, pattern) for pattern in includes):
        return False
    return not any(fnmatch.fnmatch(value, pattern) or fnmatch.fnmatch(name, pattern) for pattern in excludes)


def discover_files(
    values: list[str],
    includes: list[str],
    excludes: list[str],
    include_hidden: bool,
) -> tuple[list[Path], list[str]]:
    files: set[Path] = set()
    errors: list[str] = []

    for value in values:
        root = Path(value)
        if root.is_file():
            if matches_globs(root, includes, excludes):
                files.add(root)
            continue
        if not root.exists():
            errors.append(f"pgrip: path not found: {value}")
            continue
        if not root.is_dir():
            errors.append(f"pgrip: unsupported path: {value}")
            continue

        for current, dirnames, filenames in os.walk(root):
            current_path = Path(current)
            dirnames[:] = [
                name
                for name in dirnames
                if not is_excluded_directory(current_path / name, include_hidden)
            ]
            for name in filenames:
                path = current_path / name
                if matches_globs(path, includes, excludes):
                    files.add(path)

    return sorted(files, key=lambda path: display_path(path).lower()), errors


def read_lines(path: Path, encoding: str) -> list[str] | None:
    data = path.read_bytes()
    if b"\x00" in data[:8192]:
        return None
    return data.decode(encoding, errors="replace").splitlines()


def compile_pattern(args: argparse.Namespace) -> re.Pattern[str]:
    pattern = re.escape(args.pattern) if args.fixed_strings else args.pattern
    if args.word_regexp:
        pattern = rf"(?<!\w)(?:{pattern})(?!\w)"
    flags = re.IGNORECASE if args.ignore_case else 0
    return re.compile(pattern, flags)


def matching_line_indexes(lines: list[str], regex: re.Pattern[str], invert: bool) -> list[int]:
    return [
        index
        for index, line in enumerate(lines)
        if bool(regex.search(line)) != invert
    ]


def selected_indexes(matches: list[int], line_count: int, before: int, after: int) -> set[int]:
    selected: set[int] = set()
    for index in matches:
        selected.update(range(max(0, index - before), min(line_count, index + after + 1)))
    return selected


def render_matches(
    path: Path,
    lines: list[str],
    matches: list[int],
    args: argparse.Namespace,
) -> Iterator[str]:
    shown = selected_indexes(matches, len(lines), args.before_context, args.after_context)
    match_set = set(matches)
    previous = -2
    label = display_path(path)

    for index in sorted(shown):
        if previous >= 0 and index > previous + 1:
            yield "--"
        separator = ":" if index in match_set else "-"
        prefix = "" if args.no_filename else f"{label}{separator}"
        number = f"{index + 1}{separator}" if args.line_number else ""
        yield f"{prefix}{number}{lines[index]}"
        previous = index


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Search text files using Python's re module.")
    parser.add_argument("pattern", help="regular expression to search for")
    parser.add_argument("paths", nargs="*", default=["."], help="files or directories (default: current directory)")
    parser.add_argument("-i", "--ignore-case", action="store_true", help="case-insensitive matching")
    parser.add_argument("-F", "--fixed-strings", action="store_true", help="treat the pattern as literal text")
    parser.add_argument("-w", "--word-regexp", action="store_true", help="match complete words")
    parser.add_argument("-v", "--invert-match", action="store_true", help="select non-matching lines")
    parser.add_argument("-n", "--line-number", action=argparse.BooleanOptionalAction, default=True)
    parser.add_argument("-l", "--files-with-matches", action="store_true", help="print matching file names only")
    parser.add_argument("-L", "--files-without-match", action="store_true", help="print non-matching file names only")
    parser.add_argument("-c", "--count", action="store_true", help="print matching-line counts")
    parser.add_argument("--no-filename", action="store_true", help="omit file names from matching lines")
    parser.add_argument("-m", "--max-count", type=int, help="stop after this many matching lines per file")
    parser.add_argument("-A", "--after-context", type=int, default=0, metavar="NUM")
    parser.add_argument("-B", "--before-context", type=int, default=0, metavar="NUM")
    parser.add_argument("-C", "--context", type=int, metavar="NUM", help="show NUM lines before and after")
    parser.add_argument("-g", "--glob", action="append", default=[], help="include files matching a glob")
    parser.add_argument("--exclude", action="append", default=[], help="exclude files matching a glob")
    parser.add_argument("--hidden", action="store_true", help="include hidden directories except repository metadata")
    parser.add_argument("--encoding", default="utf-8-sig", help="text encoding (default: utf-8-sig)")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    if args.context is not None:
        args.before_context = args.context
        args.after_context = args.context
    if args.max_count is not None and args.max_count < 1:
        print("pgrip: --max-count must be at least 1", file=sys.stderr)
        return 2
    if args.files_with_matches and args.files_without_match:
        print("pgrip: -l and -L cannot be used together", file=sys.stderr)
        return 2

    try:
        regex = compile_pattern(args)
    except re.error as error:
        print(f"pgrip: invalid regular expression: {error}", file=sys.stderr)
        return 2

    files, errors = discover_files(args.paths, args.glob, args.exclude, args.hidden)
    for error in errors:
        print(error, file=sys.stderr)

    found = False
    had_error = bool(errors)
    for path in files:
        try:
            lines = read_lines(path, args.encoding)
        except (OSError, LookupError) as error:
            print(f"pgrip: {display_path(path)}: {error}", file=sys.stderr)
            had_error = True
            continue
        if lines is None:
            continue

        matches = matching_line_indexes(lines, regex, args.invert_match)
        if args.max_count is not None:
            matches = matches[: args.max_count]
        has_matches = bool(matches)
        if args.files_with_matches:
            if has_matches:
                console_print(display_path(path))
                found = True
        elif args.files_without_match:
            if not has_matches:
                console_print(display_path(path))
                found = True
        elif args.count:
            prefix = "" if args.no_filename else f"{display_path(path)}:"
            console_print(f"{prefix}{len(matches)}")
            found |= has_matches
        elif has_matches:
            found = True
            for output in render_matches(path, lines, matches, args):
                console_print(output)

    if had_error:
        return 2
    return 0 if found else 1


if __name__ == "__main__":
    raise SystemExit(main())
