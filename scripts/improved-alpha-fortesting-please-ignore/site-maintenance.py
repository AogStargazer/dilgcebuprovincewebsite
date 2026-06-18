"""Small maintenance utilities for the DILG Cebu Province static site.

Usage (from repo root):

    python scripts/site-maintenance.py <command> [options]

Commands
--------
  search rebuild          rebuild search indexes
  search find <query>     test a query against the local search index
  text check [paths]      find fancy Unicode characters in HTML/JSON files
  text fix [paths]        normalize fancy Unicode characters in-place
  whitespace check [paths]  find trailing spaces and tabs
  whitespace fix [paths]    remove trailing spaces and tabs
  cache clean             restore tracked pycache files, delete untracked ones
  git diff-check          run git diff --check
  hygiene [paths]         run all cleanup steps after site edits (text + whitespace + search + cache)
  doctor [paths]          quick health check without writing anything
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import subprocess
import sys
from pathlib import Path
from types import ModuleType


ROOT = Path(__file__).resolve().parents[1]
SEARCH_JSON = ROOT / "assets" / "search-index.json"

DEFAULT_MAINTENANCE_SUFFIXES = frozenset(
    {".html", ".css", ".js", ".json", ".md", ".py", ".txt"}
)
DEFAULT_EXCLUDED_DIR_PARTS = frozenset(
    {
        ".git",
        ".agents",
        ".codex",
        "__pycache__",
        "node_modules",
        "vendor",
        "assets/pdfjs",
        "wp-content",
        "wp-includes",
    }
)


# ---------------------------------------------------------------------------
# Module loader
# ---------------------------------------------------------------------------


def load_script(name: str, filename: str) -> ModuleType:
    """Load a sibling script from scripts/ as a module."""
    path = ROOT / "scripts" / filename
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------


def rel(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def console_print(value: str = "") -> None:
    """Print *value* safely on terminals that don't support full Unicode."""
    encoding = sys.stdout.encoding or "utf-8"
    print(value.encode(encoding, errors="replace").decode(encoding))


def run_command(args: list[str], *, check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=ROOT, text=True, capture_output=True, check=check)


def path_is_excluded(path: Path) -> bool:
    try:
        relative = path.relative_to(ROOT)
    except ValueError:
        relative = path
    parts = relative.as_posix().lower()
    return any(part in parts for part in DEFAULT_EXCLUDED_DIR_PARTS)


def text_roots(paths: list[str] | None) -> list[Path]:
    values = paths or ["."]
    return [(ROOT / v).resolve() for v in values]


def discover_maintenance_files(paths: list[str] | None = None) -> list[Path]:
    roots = text_roots(paths or ["."])
    files: list[Path] = []
    for root in roots:
        if root.is_file():
            if root.suffix.lower() in DEFAULT_MAINTENANCE_SUFFIXES and not path_is_excluded(root):
                files.append(root)
            continue
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if (
                path.is_file()
                and path.suffix.lower() in DEFAULT_MAINTENANCE_SUFFIXES
                and not path_is_excluded(path)
            ):
                files.append(path)

    return sorted(set(files), key=rel)


# ---------------------------------------------------------------------------
# Trailing-whitespace utilities
# ---------------------------------------------------------------------------


def normalize_trailing_whitespace(value: str) -> str:
    value = re.sub(r"[ \t]+(?=\r?\n)", "", value)
    value = re.sub(r"[ \t]+\Z", "", value)
    return value


def collect_whitespace_changes(path: Path) -> tuple[str, list[int]]:
    original = path.read_text(encoding="utf-8-sig")
    normalized = normalize_trailing_whitespace(original)
    if normalized == original:
        return original, []

    changed_lines: list[int] = []
    original_lines = original.splitlines(keepends=True)
    normalized_lines = normalized.splitlines(keepends=True)
    for index, (before, after) in enumerate(zip(original_lines, normalized_lines), start=1):
        if before != after:
            changed_lines.append(index)
    if len(original_lines) != len(normalized_lines):
        changed_lines.append(max(len(original_lines), len(normalized_lines)))
    return normalized, changed_lines


# ---------------------------------------------------------------------------
# Pycache utilities
# ---------------------------------------------------------------------------


def clean_pycache_files() -> tuple[int, int]:
    """Restore tracked pycache files; remove untracked ones.  Returns (restored, removed)."""
    restored = 0
    removed = 0
    for pycache in ROOT.rglob("__pycache__"):
        if not pycache.is_dir() or path_is_excluded(pycache.parent):
            continue
        for path in pycache.glob("*.pyc"):
            relative = rel(path)
            tracked = run_command(["git", "ls-files", "--error-unmatch", relative])
            if tracked.returncode == 0:
                if run_command(["git", "restore", "--", relative]).returncode == 0:
                    restored += 1
            else:
                path.unlink(missing_ok=True)
                removed += 1
    return restored, removed


# ---------------------------------------------------------------------------
# Search commands
# ---------------------------------------------------------------------------


def cmd_search_rebuild(args: argparse.Namespace) -> int:
    builder = load_script("build_search_index", "build-search-index.py")
    records = builder.build_index()
    if not args.check:
        builder.write_index(records)

    print(f"Indexed {len(records)} HTML pages.")
    if not args.check:
        print(f"Output: {rel(builder.OUTPUT)}")
        print(f"JSON:   {rel(builder.JSON_OUTPUT)}")
    return 0


def read_search_records() -> list[dict[str, str]]:
    if not SEARCH_JSON.exists():
        raise FileNotFoundError(
            "assets/search-index.json not found. Run: python scripts/site-maintenance.py search rebuild"
        )
    return json.loads(SEARCH_JSON.read_text(encoding="utf-8"))


def _score_record(record: dict[str, str], terms: list[str]) -> int:
    title = record.get("title", "").lower()
    text = record.get("text", "").lower()
    score = 0
    for term in terms:
        if term in title:
            score += 10
        if term in text:
            score += 1
    return score


def _snippet(text: str, terms: list[str], width: int = 160) -> str:
    lowered = text.lower()
    first = min((lowered.find(t) for t in terms if t in lowered), default=0)
    start = max(first - 50, 0)
    return re.sub(r"\s+", " ", text[start : start + width]).strip()


def cmd_search_find(args: argparse.Namespace) -> int:
    query = " ".join(args.query).strip()
    if not query:
        print("Please provide a search query.")
        return 1

    terms = query.lower().split()
    matches = [
        (score, record)
        for record in read_search_records()
        if (score := _score_record(record, terms))
    ]
    matches.sort(key=lambda item: (-item[0], item[1].get("title", "")))

    for score, record in matches[: args.limit]:
        console_print(f"{score:>3}  {record.get('title', '')}")
        console_print(f"     {record.get('url', '')}")
        console_print(f"     {_snippet(record.get('text', ''), terms)}")

    console_print(f"Found {len(matches)} result(s).")
    return 0 if matches else 1


# ---------------------------------------------------------------------------
# Text-normalization commands (shared implementation)
# ---------------------------------------------------------------------------


def _run_text_command(args: argparse.Namespace, *, write: bool) -> int:
    normalizer = load_script("normalize_fancy_text", "normalize-fancy-text.py")
    roots = text_roots(getattr(args, "paths", None))
    files = normalizer.discover_files(roots)
    changed_files = 0
    changed_lines = 0

    for path in files:
        normalized, changes = normalizer.collect_changes(path)
        if not changes:
            continue
        changed_files += 1
        changed_lines += len(changes)
        if not getattr(args, "quiet", False):
            for change in changes:
                print(normalizer.display_change(change))
        if write:
            path.write_text(normalized, encoding="utf-8", newline="")

    action = "Normalized" if write else "Found"
    print(f"{action} {changed_lines} line(s) in {changed_files} file(s).")
    return 1 if (changed_files and not write) else 0


def cmd_text_check(args: argparse.Namespace) -> int:
    return _run_text_command(args, write=False)


def cmd_text_fix(args: argparse.Namespace) -> int:
    return _run_text_command(args, write=True)


# ---------------------------------------------------------------------------
# Whitespace commands
# ---------------------------------------------------------------------------


def cmd_whitespace_check(args: argparse.Namespace) -> int:
    files = discover_maintenance_files(args.paths)
    changed_files = 0
    changed_lines = 0
    for path in files:
        _normalized, lines = collect_whitespace_changes(path)
        if not lines:
            continue
        changed_files += 1
        changed_lines += len(lines)
        if not args.quiet:
            for line in lines[: args.limit]:
                print(f"{rel(path)}:{line}: trailing whitespace")
            if len(lines) > args.limit:
                print(f"{rel(path)}: … {len(lines) - args.limit} more line(s)")

    print(f"Found {changed_lines} whitespace issue(s) in {changed_files} file(s).")
    return 1 if changed_files else 0


def cmd_whitespace_fix(args: argparse.Namespace) -> int:
    files = discover_maintenance_files(args.paths)
    changed_files = 0
    changed_lines = 0
    for path in files:
        normalized, lines = collect_whitespace_changes(path)
        if not lines:
            continue
        changed_files += 1
        changed_lines += len(lines)
        if not args.quiet:
            print(f"{rel(path)}: removed trailing whitespace on {len(lines)} line(s)")
        path.write_text(normalized, encoding="utf-8", newline="\n")

    print(f"Fixed {changed_lines} whitespace issue(s) in {changed_files} file(s).")
    return 0


# ---------------------------------------------------------------------------
# Cache / git commands
# ---------------------------------------------------------------------------


def cmd_cache_clean(_args: argparse.Namespace) -> int:
    restored, removed = clean_pycache_files()
    print(f"Cache clean: restored {restored} tracked .pyc file(s), removed {removed} untracked.")
    return 0


def cmd_git_diff_check(_args: argparse.Namespace) -> int:
    result = run_command(["git", "diff", "--check"])
    if result.stdout:
        print(result.stdout.rstrip())
    if result.stderr:
        print(result.stderr.rstrip())
    if result.returncode == 0:
        print("Git diff check passed.")
    return result.returncode


# ---------------------------------------------------------------------------
# Composite commands
# ---------------------------------------------------------------------------


def cmd_hygiene(args: argparse.Namespace) -> int:
    """Run all cleanup steps: text fix → whitespace fix → search rebuild → cache clean → doctor."""
    status = 0

    print("Hygiene: fixing fancy text…")
    status |= cmd_text_fix(argparse.Namespace(paths=args.paths, quiet=args.quiet))

    print("Hygiene: fixing trailing whitespace…")
    status |= cmd_whitespace_fix(argparse.Namespace(paths=args.paths, quiet=args.quiet))

    print("Hygiene: rebuilding search index…")
    status |= cmd_search_rebuild(argparse.Namespace(check=False))

    print("Hygiene: cleaning Python cache side effects…")
    status |= cmd_cache_clean(argparse.Namespace())

    print("Hygiene: running doctor…")
    status |= cmd_doctor(argparse.Namespace(paths=args.paths, include_git=False))

    if args.git:
        print("Hygiene: running git diff --check…")
        status |= cmd_git_diff_check(argparse.Namespace())

    return 1 if status else 0


def cmd_doctor(args: argparse.Namespace) -> int:
    """Report on text normalization, whitespace, and search index health."""
    text_status = cmd_text_check(argparse.Namespace(paths=getattr(args, "paths", None), quiet=True))
    whitespace_status = cmd_whitespace_check(
        argparse.Namespace(paths=getattr(args, "paths", None), quiet=True, limit=20)
    )
    # --check rebuilds in memory to confirm the index *can* be built; we treat
    # a non-zero exit as a search problem.
    search_status = cmd_search_rebuild(argparse.Namespace(check=True))
    git_status = (
        cmd_git_diff_check(argparse.Namespace()) if getattr(args, "include_git", False) else 0
    )

    if text_status:
        print("Doctor: fancy text found.        Run: python scripts/site-maintenance.py text fix")
    else:
        print("Doctor: text normalization check passed.")

    if whitespace_status:
        print("Doctor: trailing whitespace found. Run: python scripts/site-maintenance.py whitespace fix")
    else:
        print("Doctor: whitespace check passed.")

    if search_status:
        print("Doctor: search index rebuild failed.")
    else:
        print("Doctor: search index is buildable.")

    return 1 if (text_status or whitespace_status or search_status or git_status) else 0


# ---------------------------------------------------------------------------
# Argument parser
# ---------------------------------------------------------------------------


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Maintenance utilities for the DILG Cebu Province static site.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    # -- search --------------------------------------------------------------
    search = subparsers.add_parser("search", help="search index utilities")
    search_sub = search.add_subparsers(dest="search_command", required=True)

    search_rebuild = search_sub.add_parser("rebuild", help="rebuild search indexes from HTML pages")
    search_rebuild.add_argument("--check", action="store_true", help="scan pages without writing index files")
    search_rebuild.set_defaults(func=cmd_search_rebuild)

    search_find = search_sub.add_parser("find", help="test a query against assets/search-index.json")
    search_find.add_argument("query", nargs="+", help="search words to test")
    search_find.add_argument("--limit", type=int, default=10, help="maximum results to print (default 10)")
    search_find.set_defaults(func=cmd_search_find)

    # -- text ----------------------------------------------------------------
    text = subparsers.add_parser("text", help="HTML/JSON Unicode normalization utilities")
    text_sub = text.add_subparsers(dest="text_command", required=True)

    text_check = text_sub.add_parser("check", help="find fancy Unicode characters in HTML/JSON files")
    text_check.add_argument("paths", nargs="*", help="files or folders to scan (default: entire repo)")
    text_check.add_argument("--quiet", action="store_true", help="print summary only")
    text_check.set_defaults(func=cmd_text_check)

    text_fix = text_sub.add_parser("fix", help="normalize fancy Unicode characters in-place")
    text_fix.add_argument("paths", nargs="*", help="files or folders to fix (default: entire repo)")
    text_fix.add_argument("--quiet", action="store_true", help="print summary only")
    text_fix.set_defaults(func=cmd_text_fix)

    # -- whitespace ----------------------------------------------------------
    whitespace = subparsers.add_parser("whitespace", help="trailing whitespace utilities")
    ws_sub = whitespace.add_subparsers(dest="whitespace_command", required=True)

    ws_check = ws_sub.add_parser("check", help="find trailing spaces and tabs")
    ws_check.add_argument("paths", nargs="*", help="files or folders to scan")
    ws_check.add_argument("--quiet", action="store_true")
    ws_check.add_argument("--limit", type=int, default=20, help="max findings per file (default 20)")
    ws_check.set_defaults(func=cmd_whitespace_check)

    ws_fix = ws_sub.add_parser("fix", help="remove trailing spaces and tabs")
    ws_fix.add_argument("paths", nargs="*", help="files or folders to fix")
    ws_fix.add_argument("--quiet", action="store_true")
    ws_fix.set_defaults(func=cmd_whitespace_fix)

    # -- cache ---------------------------------------------------------------
    cache = subparsers.add_parser("cache", help="Python cache file utilities")
    cache_sub = cache.add_subparsers(dest="cache_command", required=True)
    cache_clean = cache_sub.add_parser("clean", help="restore tracked .pyc files; remove untracked ones")
    cache_clean.set_defaults(func=cmd_cache_clean)

    # -- git -----------------------------------------------------------------
    git = subparsers.add_parser("git", help="git hygiene utilities")
    git_sub = git.add_subparsers(dest="git_command", required=True)
    git_diff = git_sub.add_parser("diff-check", help="run git diff --check")
    git_diff.set_defaults(func=cmd_git_diff_check)

    # -- hygiene -------------------------------------------------------------
    hygiene = subparsers.add_parser("hygiene", help="run all cleanup steps after site edits")
    hygiene.add_argument("paths", nargs="*", help="files or folders for text and whitespace checks")
    hygiene.add_argument("--quiet", action="store_true", help="print summaries only")
    hygiene.add_argument("--git", action="store_true", help="also run git diff --check")
    hygiene.set_defaults(func=cmd_hygiene)

    # -- doctor --------------------------------------------------------------
    doctor = subparsers.add_parser("doctor", help="run quick health checks (read-only)")
    doctor.add_argument("paths", nargs="*", help="files or folders to check")
    doctor.add_argument("--git", action="store_true", dest="include_git", help="also run git diff --check")
    doctor.set_defaults(func=cmd_doctor)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
