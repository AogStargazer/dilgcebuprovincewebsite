r"""Compare text files or directory trees with Python's difflib.

Examples:

    scripts\pdifflib index.html index-backup.html
    scripts\pdifflib scripts scripts\improved-alpha-fortesting-please-ignore
    scripts\pdifflib --brief --include "*.py" old-scripts new-scripts

Exit codes follow diff conventions: 0 for no differences, 1 for differences,
and 2 for invalid arguments or filesystem errors.
"""

from __future__ import annotations

import argparse
import difflib
import fnmatch
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


DEFAULT_EXCLUDED_DIRS = {
    ".git",
    ".agents",
    ".codex",
    "__pycache__",
    "node_modules",
    "vendor",
}


@dataclass
class DiffResult:
    label: str
    changed: bool
    binary: bool
    lines: list[str]


def console_print(value: str = "", end: str = "\n") -> None:
    encoding = sys.stdout.encoding or "utf-8"
    safe = value.encode(encoding, errors="replace").decode(encoding)
    print(safe, end=end)


def matches_globs(path: Path, includes: list[str], excludes: list[str]) -> bool:
    value = path.as_posix()
    name = path.name
    if includes and not any(fnmatch.fnmatch(value, item) or fnmatch.fnmatch(name, item) for item in includes):
        return False
    return not any(fnmatch.fnmatch(value, item) or fnmatch.fnmatch(name, item) for item in excludes)


def directory_files(root: Path, includes: list[str], excludes: list[str]) -> dict[str, Path]:
    files: dict[str, Path] = {}
    for current, dirnames, filenames in os.walk(root):
        dirnames[:] = [
            name
            for name in dirnames
            if name.lower() not in DEFAULT_EXCLUDED_DIRS and not name.startswith(".")
        ]
        current_path = Path(current)
        for name in filenames:
            path = current_path / name
            relative = path.relative_to(root)
            if matches_globs(relative, includes, excludes):
                files[relative.as_posix()] = path
    return files


def read_text(path: Path | None, encoding: str) -> tuple[list[str], bool]:
    if path is None:
        return [], False
    data = path.read_bytes()
    if b"\x00" in data[:8192]:
        return [], True
    text = data.decode(encoding, errors="replace")
    return text.splitlines(keepends=True), False


def make_diff(
    before: Path | None,
    after: Path | None,
    before_label: str,
    after_label: str,
    args: argparse.Namespace,
) -> DiffResult:
    before_lines, before_binary = read_text(before, args.encoding)
    after_lines, after_binary = read_text(after, args.encoding)
    label = after_label if before is None else before_label if after is None else before_label

    if before_binary or after_binary:
        before_bytes = before.read_bytes() if before else b""
        after_bytes = after.read_bytes() if after else b""
        return DiffResult(label, before_bytes != after_bytes, True, [])

    changed = before_lines != after_lines
    if not changed or args.brief:
        return DiffResult(label, changed, False, [])

    if args.format == "context":
        output = difflib.context_diff(
            before_lines,
            after_lines,
            fromfile=before_label,
            tofile=after_label,
            n=args.lines,
        )
    elif args.format == "ndiff":
        output = difflib.ndiff(before_lines, after_lines)
    else:
        output = difflib.unified_diff(
            before_lines,
            after_lines,
            fromfile=before_label,
            tofile=after_label,
            n=args.lines,
        )
    return DiffResult(label, True, False, list(output))


def compare_files(before: Path, after: Path, args: argparse.Namespace) -> list[DiffResult]:
    return [make_diff(before, after, str(before), str(after), args)]


def compare_directories(before: Path, after: Path, args: argparse.Namespace) -> list[DiffResult]:
    before_files = directory_files(before, args.include, args.exclude)
    after_files = directory_files(after, args.include, args.exclude)
    results: list[DiffResult] = []

    for relative in sorted(set(before_files) | set(after_files), key=str.lower):
        left = before_files.get(relative)
        right = after_files.get(relative)
        results.append(
            make_diff(
                left,
                right,
                f"{before.as_posix()}/{relative}" if left else "/dev/null",
                f"{after.as_posix()}/{relative}" if right else "/dev/null",
                args,
            )
        )
    return results


def print_results(results: Iterable[DiffResult], brief: bool, stat: bool) -> bool:
    changed_results = [result for result in results if result.changed]
    if stat:
        text_count = sum(not result.binary for result in changed_results)
        binary_count = sum(result.binary for result in changed_results)
        console_print(
            f"{len(changed_results)} changed path(s): "
            f"{text_count} text, {binary_count} binary"
        )
        return bool(changed_results)

    for result in changed_results:
        if brief:
            kind = "binary files differ" if result.binary else "files differ"
            console_print(f"{result.label}: {kind}")
            continue
        if result.binary:
            console_print(f"Binary files differ: {result.label}")
            continue
        for line in result.lines:
            console_print(line, end="" if line.endswith(("\n", "\r")) else "\n")
    return bool(changed_results)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Compare files or directories using Python's difflib.")
    parser.add_argument("before", help="original file or directory")
    parser.add_argument("after", help="new file or directory")
    parser.add_argument(
        "-f",
        "--format",
        choices=("unified", "context", "ndiff"),
        default="unified",
        help="diff format (default: unified)",
    )
    parser.add_argument("-U", "--lines", type=int, default=3, metavar="NUM", help="context lines (default: 3)")
    parser.add_argument("-q", "--brief", action="store_true", help="report only which paths differ")
    parser.add_argument("--stat", action="store_true", help="print only a changed-path summary")
    parser.add_argument("--include", action="append", default=[], help="include directory files matching a glob")
    parser.add_argument("--exclude", action="append", default=[], help="exclude directory files matching a glob")
    parser.add_argument("--encoding", default="utf-8-sig", help="text encoding (default: utf-8-sig)")
    return parser


def main() -> int:
    args = build_parser().parse_args()
    before = Path(args.before)
    after = Path(args.after)

    if args.lines < 0:
        print("pdifflib: --lines cannot be negative", file=sys.stderr)
        return 2
    if not before.exists() or not after.exists():
        missing = before if not before.exists() else after
        print(f"pdifflib: path not found: {missing}", file=sys.stderr)
        return 2
    if before.is_file() != after.is_file() or before.is_dir() != after.is_dir():
        print("pdifflib: both paths must be files or both paths must be directories", file=sys.stderr)
        return 2

    try:
        results = (
            compare_files(before, after, args)
            if before.is_file()
            else compare_directories(before, after, args)
        )
    except (OSError, LookupError) as error:
        print(f"pdifflib: {error}", file=sys.stderr)
        return 2

    changed = print_results(results, args.brief, args.stat)
    return 1 if changed else 0


if __name__ == "__main__":
    raise SystemExit(main())
