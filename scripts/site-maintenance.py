from __future__ import annotations

import argparse
import importlib.util
import json
import re
import sys
from pathlib import Path
from types import ModuleType


ROOT = Path(__file__).resolve().parents[1]
SEARCH_JSON = ROOT / "assets" / "search-index.json"


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
        print(f"{score:>3}  {record.get('title', '')}")
        print(f"     {record.get('url', '')}")
        print(f"     {snippet(record.get('text', ''), terms)}")

    print(f"Found {len(matches)} result(s).")
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


def cmd_doctor(args: argparse.Namespace) -> int:
    text_status = cmd_text_check(argparse.Namespace(paths=args.paths, quiet=True))
    search_status = cmd_search_rebuild(argparse.Namespace(check=True))

    if text_status:
        print("Doctor: fancy text was found. Run: python scripts/site-maintenance.py text fix")
    else:
        print("Doctor: text normalization check passed.")

    print("Doctor: search index can be rebuilt.")
    return 1 if text_status or search_status else 0


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

    doctor = subparsers.add_parser("doctor", help="run the quick maintenance checks")
    doctor.add_argument("paths", nargs="*", help="optional files or folders for text checks")
    doctor.set_defaults(func=cmd_doctor)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
