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
DEFAULT_MAINTENANCE_SUFFIXES = {
    ".html",
    ".css",
    ".js",
    ".json",
    ".md",
    ".py",
    ".txt",
}
DEFAULT_EXCLUDED_DIR_PARTS = {
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
NAV_LAYER_RULES = [
    ("styles.css", ".main-menu > li.has-dropdown:hover", "z-index", 2147483604),
    ("styles.css", ".main-header .main-navigation .dropdown-menu", "z-index", 2147483604),
    ("styles.css", ".main-header .main-navigation .dropdown-menu .dropdown-menu", "z-index", 2147483604),
    ("menu.css", ".dropdown-menu", "z-index", 2147483604),
    ("menu.css", ".drop-right-menu", "z-index", 2147483604),
]
NAV_LAYER_FORBIDDEN_SELECTORS = [
    ".main-navigation:hover",
    ".main-navigation:focus-within",
]


def load_script(name: str, filename: str) -> ModuleType:
    path = ROOT / "scripts" / filename
    spec = importlib.util.spec_from_file_location(name, path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Could not load {path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def console_print(value: str = "") -> None:
    encoding = sys.stdout.encoding or "utf-8"
    print(value.encode(encoding, errors="replace").decode(encoding))


def run_command(args: list[str], check: bool = False) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=ROOT, text=True, capture_output=True, check=check)


def path_is_excluded(path: Path) -> bool:
    try:
        relative = path.relative_to(ROOT)
    except ValueError:
        relative = path
    parts = relative.as_posix().lower()
    return any(part in parts for part in DEFAULT_EXCLUDED_DIR_PARTS)


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
            if path.is_file() and path.suffix.lower() in DEFAULT_MAINTENANCE_SUFFIXES and not path_is_excluded(path):
                files.append(path)

    return sorted(set(files), key=lambda path: rel(path))


def normalize_trailing_whitespace(value: str) -> str:
    value = re.sub(r"[ \t]+(?=\r?\n)", "", value)
    value = re.sub(r"[ \t]+\Z", "", value)
    return value


def collect_whitespace_changes(path: Path) -> tuple[str, list[int]]:
    original = path.read_text(encoding="utf-8-sig")
    normalized = normalize_trailing_whitespace(original)
    changed_lines: list[int] = []
    original_lines = original.splitlines(keepends=True)
    normalized_lines = normalized.splitlines(keepends=True)
    for index, (before, after) in enumerate(zip(original_lines, normalized_lines), start=1):
        if before != after:
            changed_lines.append(index)
    if len(original_lines) != len(normalized_lines):
        changed_lines.append(max(len(original_lines), len(normalized_lines)))
    return normalized, changed_lines


def clean_pycache_files() -> tuple[int, int]:
    restored = 0
    removed = 0
    for pycache in ROOT.rglob("__pycache__"):
        if not pycache.is_dir() or path_is_excluded(pycache.parent):
            continue
        for path in pycache.glob("*.pyc"):
            relative = rel(path)
            tracked = run_command(["git", "ls-files", "--error-unmatch", relative])
            if tracked.returncode == 0:
                restored_result = run_command(["git", "restore", "--", relative])
                if restored_result.returncode == 0:
                    restored += 1
            else:
                path.unlink(missing_ok=True)
                removed += 1
    return restored, removed


def cmd_search_rebuild(args: argparse.Namespace) -> int:
    builder = load_script("build_search_index", "build-search-index.py")
    records = builder.build_index()
    if not args.check:
        builder.write_index(records)

    print(f"Indexed {len(records)} HTML pages.")
    print(f"Output: {rel(builder.OUTPUT)}")
    print(f"JSON: {rel(builder.JSON_OUTPUT)}")
    return 0


def read_search_records() -> list[dict[str, str]]:
    if not SEARCH_JSON.exists():
        raise FileNotFoundError("assets/search-index.json does not exist. Run search rebuild first.")

    return json.loads(SEARCH_JSON.read_text(encoding="utf-8"))


def score_record(record: dict[str, str], terms: list[str]) -> int:
    title = record.get("title", "").lower()
    text = record.get("text", "").lower()
    score = 0
    for term in terms:
        if term in title:
            score += 10
        if term in text:
            score += 1
    return score


def snippet(text: str, terms: list[str], width: int = 160) -> str:
    lowered = text.lower()
    first_match = min((lowered.find(term) for term in terms if term in lowered), default=0)
    start = max(first_match - 50, 0)
    clean = re.sub(r"\s+", " ", text[start : start + width]).strip()
    return clean


def cmd_search_find(args: argparse.Namespace) -> int:
    query = " ".join(args.query).strip()
    if not query:
        print("Please provide a search query.")
        return 1

    terms = query.lower().split()
    matches = []
    for record in read_search_records():
        score = score_record(record, terms)
        if score:
            matches.append((score, record))

    matches.sort(key=lambda item: (-item[0], item[1].get("title", "")))
    for score, record in matches[: args.limit]:
        console_print(f"{score:>3}  {record.get('title', '')}")
        console_print(f"     {record.get('url', '')}")
        console_print(f"     {snippet(record.get('text', ''), terms)}")

    console_print(f"Found {len(matches)} result(s).")
    return 0 if matches else 1


def text_roots(paths: list[str]) -> list[Path]:
    values = paths or ["."]
    return [(ROOT / value).resolve() for value in values]


def cmd_text_check(args: argparse.Namespace) -> int:
    normalizer = load_script("normalize_fancy_text", "normalize-fancy-text.py")
    roots = text_roots(args.paths)
    files = normalizer.discover_files(roots)
    changed_files = 0
    changed_lines = 0

    for path in files:
        _normalized, changes = normalizer.collect_changes(path)
        if not changes:
            continue

        changed_files += 1
        changed_lines += len(changes)
        if not args.quiet:
            for change in changes:
                print(normalizer.display_change(change))

    print(f"Found {changed_lines} line(s) in {changed_files} file(s).")
    return 1 if changed_files else 0


def cmd_text_fix(args: argparse.Namespace) -> int:
    normalizer = load_script("normalize_fancy_text", "normalize-fancy-text.py")
    roots = text_roots(args.paths)
    files = normalizer.discover_files(roots)
    changed_files = 0
    changed_lines = 0

    for path in files:
        normalized, changes = normalizer.collect_changes(path)
        if not changes:
            continue

        changed_files += 1
        changed_lines += len(changes)
        if not args.quiet:
            for change in changes:
                print(normalizer.display_change(change))
        path.write_text(normalized, encoding="utf-8", newline="")

    print(f"Normalized {changed_lines} line(s) in {changed_files} file(s).")
    return 0


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
                print(f"{rel(path)}: ... {len(lines) - args.limit} more line(s)")

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


def cmd_cache_clean(_args: argparse.Namespace) -> int:
    restored, removed = clean_pycache_files()
    print(f"Cache clean: restored {restored} tracked pycache file(s), removed {removed} untracked pycache file(s).")
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


def css_block(source: str, selector: str) -> str | None:
    for match in re.finditer(r"(?P<selectors>[^{}]+)\{(?P<body>[^{}]*)\}", source, re.MULTILINE):
        selector_source = re.sub(r"/\*.*?\*/", "", match.group("selectors"), flags=re.DOTALL)
        selectors = [value.strip() for value in selector_source.split(",")]
        if selector in selectors:
            return match.group("body")
    return None


def css_property_value(block: str, property_name: str) -> str | None:
    pattern = re.compile(rf"{re.escape(property_name)}\s*:\s*([^;]+);")
    match = pattern.search(block)
    return match.group(1).strip() if match else None


def css_int_value(block: str, property_name: str) -> int | None:
    value = css_property_value(block, property_name)
    if value is None:
        return None
    match = re.search(r"-?\d+", value)
    return int(match.group(0)) if match else None


def selector_sets_z_index(source: str, selector: str) -> bool:
    block = css_block(source, selector)
    return block is not None and css_property_value(block, "z-index") is not None


def cmd_nav_layer_check(_args: argparse.Namespace) -> int:
    issues: list[str] = []
    styles_source = (ROOT / "styles.css").read_text(encoding="utf-8-sig")

    for selector in NAV_LAYER_FORBIDDEN_SELECTORS:
        if selector_sets_z_index(styles_source, selector):
            issues.append(
                f"styles.css: do not put z-index on {selector}; it lifts the whole nav over header icons."
            )

    for file_name, selector, property_name, minimum in NAV_LAYER_RULES:
        path = ROOT / file_name
        source = path.read_text(encoding="utf-8-sig")
        block = css_block(source, selector)
        if block is None:
            issues.append(f"{file_name}: missing navigation layer guard selector: {selector}")
            continue
        value = css_int_value(block, property_name)
        if value is None:
            issues.append(f"{file_name}: {selector} must define {property_name}.")
            continue
        if value <= minimum:
            issues.append(
                f"{file_name}: {selector} {property_name} must stay above header icons/widgets."
            )

    if issues:
        print("Navigation layer guard found issues:")
        for issue in issues:
            print(f"- {issue}")
        return 1

    print("Navigation layer guard passed.")
    return 0


def cmd_hygiene(args: argparse.Namespace) -> int:
    status = 0
    print("Hygiene: fixing fancy text...")
    status |= cmd_text_fix(argparse.Namespace(paths=args.paths, quiet=args.quiet))

    print("Hygiene: fixing trailing whitespace...")
    status |= cmd_whitespace_fix(argparse.Namespace(paths=args.paths, quiet=args.quiet))

    print("Hygiene: rebuilding search index...")
    status |= cmd_search_rebuild(argparse.Namespace(check=False))

    print("Hygiene: cleaning Python cache side effects...")
    status |= cmd_cache_clean(argparse.Namespace())

    print("Hygiene: running doctor...")
    status |= cmd_doctor(argparse.Namespace(paths=args.paths, include_git=False))

    if args.git:
        print("Hygiene: running git diff --check...")
        status |= cmd_git_diff_check(argparse.Namespace())

    return 1 if status else 0


def cmd_doctor(args: argparse.Namespace) -> int:
    text_status = cmd_text_check(argparse.Namespace(paths=args.paths, quiet=True))
    whitespace_status = cmd_whitespace_check(argparse.Namespace(paths=args.paths, quiet=True, limit=20))
    search_status = cmd_search_rebuild(argparse.Namespace(check=True))
    nav_layer_status = cmd_nav_layer_check(argparse.Namespace())
    git_status = cmd_git_diff_check(argparse.Namespace()) if getattr(args, "include_git", False) else 0

    if text_status:
        print("Doctor: fancy text was found. Run: python scripts/site-maintenance.py text fix")
    else:
        print("Doctor: text normalization check passed.")

    if whitespace_status:
        print("Doctor: trailing whitespace was found. Run: python scripts/site-maintenance.py whitespace fix")
    else:
        print("Doctor: whitespace check passed.")

    print("Doctor: search index can be rebuilt.")
    return 1 if text_status or whitespace_status or search_status or nav_layer_status or git_status else 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Small maintenance utilities for the DILG Cebu Province static site."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    search = subparsers.add_parser("search", help="search index utilities")
    search_sub = search.add_subparsers(dest="search_command", required=True)

    search_rebuild = search_sub.add_parser("rebuild", help="rebuild assets search indexes")
    search_rebuild.add_argument("--check", action="store_true", help="scan pages without writing index files")
    search_rebuild.set_defaults(func=cmd_search_rebuild)

    search_find = search_sub.add_parser("find", help="test a query against assets/search-index.json")
    search_find.add_argument("query", nargs="+", help="search words to test")
    search_find.add_argument("--limit", type=int, default=10, help="maximum results to print")
    search_find.set_defaults(func=cmd_search_find)

    text = subparsers.add_parser("text", help="HTML/JSON text normalization utilities")
    text_sub = text.add_subparsers(dest="text_command", required=True)

    text_check = text_sub.add_parser("check", help="find fancy text in HTML/JSON files")
    text_check.add_argument("paths", nargs="*", help="optional files or folders to scan")
    text_check.add_argument("--quiet", action="store_true", help="only print summary")
    text_check.set_defaults(func=cmd_text_check)

    text_fix = text_sub.add_parser("fix", help="normalize fancy text in HTML/JSON files")
    text_fix.add_argument("paths", nargs="*", help="optional files or folders to scan")
    text_fix.add_argument("--quiet", action="store_true", help="only print summary")
    text_fix.set_defaults(func=cmd_text_fix)

    whitespace = subparsers.add_parser("whitespace", help="trailing whitespace utilities")
    whitespace_sub = whitespace.add_subparsers(dest="whitespace_command", required=True)

    whitespace_check = whitespace_sub.add_parser("check", help="find trailing spaces and tabs")
    whitespace_check.add_argument("paths", nargs="*", help="optional files or folders to scan")
    whitespace_check.add_argument("--quiet", action="store_true", help="only print summary")
    whitespace_check.add_argument("--limit", type=int, default=20, help="maximum line findings per file")
    whitespace_check.set_defaults(func=cmd_whitespace_check)

    whitespace_fix = whitespace_sub.add_parser("fix", help="remove trailing spaces and tabs")
    whitespace_fix.add_argument("paths", nargs="*", help="optional files or folders to scan")
    whitespace_fix.add_argument("--quiet", action="store_true", help="only print summary")
    whitespace_fix.set_defaults(func=cmd_whitespace_fix)

    cache = subparsers.add_parser("cache", help="maintenance cache utilities")
    cache_sub = cache.add_subparsers(dest="cache_command", required=True)

    cache_clean = cache_sub.add_parser("clean", help="restore tracked pycache files and remove untracked pycache files")
    cache_clean.set_defaults(func=cmd_cache_clean)

    git = subparsers.add_parser("git", help="git hygiene utilities")
    git_sub = git.add_subparsers(dest="git_command", required=True)

    git_diff_check = git_sub.add_parser("diff-check", help="run git diff --check")
    git_diff_check.set_defaults(func=cmd_git_diff_check)

    hygiene = subparsers.add_parser("hygiene", help="run common cleanup after site edits")
    hygiene.add_argument("paths", nargs="*", help="optional files or folders for text and whitespace checks")
    hygiene.add_argument("--quiet", action="store_true", help="only print summaries where supported")
    hygiene.add_argument("--git", action="store_true", help="also run git diff --check")
    hygiene.set_defaults(func=cmd_hygiene)

    doctor = subparsers.add_parser("doctor", help="run the quick maintenance checks")
    doctor.add_argument("paths", nargs="*", help="optional files or folders for text checks")
    doctor.add_argument("--git", action="store_true", dest="include_git", help="also run git diff --check")
    doctor.set_defaults(func=cmd_doctor)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
