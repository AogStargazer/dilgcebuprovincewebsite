"""Report asset references in index.html and news.html and flag missing paths."""

from __future__ import annotations

import html
import re
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import unquote, urlsplit

from repo_read import INDEX_HTML, NEWS_HTML, ROOT, read_text, relative


@dataclass(frozen=True)
class Reference:
    page: Path
    line: int
    kind: str
    value: str
    target: Path | None
    status: str


SKIP_SCHEMES = {"data", "http", "https", "mailto", "tel", "javascript"}


def line_number(source: str, offset: int) -> int:
    return source.count("\n", 0, offset) + 1


def local_target(page: Path, base_href: str, value: str) -> tuple[Path | None, str]:
    value = html.unescape(value.strip()).strip("\"'")
    if not value or value.startswith(("#", "//")):
        return None, "skip"
    parsed = urlsplit(value)
    if parsed.scheme.lower() in SKIP_SCHEMES:
        return None, "external"
    path_value = unquote(parsed.path).replace("\\", "/")
    if not path_value:
        return None, "skip"

    if path_value.startswith("/"):
        target = ROOT / path_value.lstrip("/")
    else:
        base = (page.parent / base_href).resolve() if base_href else page.parent
        target = base / path_value
    target = target.resolve()
    try:
        target.relative_to(ROOT)
    except ValueError:
        return target, "outside"
    return target, "ok" if target.exists() else "missing"


def scan_page(page: Path) -> list[Reference]:
    source = read_text(page)
    base_match = re.search(r'<base\b[^>]*href=["\']([^"\']+)["\']', source, re.IGNORECASE)
    base_href = base_match.group(1) if base_match else ""
    found: list[Reference] = []
    patterns = (
        ("src", re.compile(r'\bsrc=["\']([^"\']+)["\']', re.IGNORECASE)),
        ("href", re.compile(r'\bhref=["\']([^"\']+)["\']', re.IGNORECASE)),
    )
    seen: set[tuple[int, str, str]] = set()
    for kind, pattern in patterns:
        for match in pattern.finditer(source):
            value = match.group(2) if kind == "url" else match.group(1)
            line = line_number(source, match.start())
            key = (line, kind, value)
            if key in seen:
                continue
            seen.add(key)
            target, status = local_target(page, base_href, value)
            if status == "skip":
                continue
            found.append(Reference(page, line, kind, value, target, status))

    decoded_source = html.unescape(source)
    url_pattern = re.compile(r"(?<![\w.])url\(\s*([\"']?)([^)\"']+)\1\s*\)", re.IGNORECASE)
    for match in url_pattern.finditer(decoded_source):
        value = match.group(2)
        line = line_number(decoded_source, match.start())
        key = (line, "url", value)
        if key in seen:
            continue
        seen.add(key)
        target, status = local_target(page, base_href, value)
        if status == "skip":
            continue
        found.append(Reference(page, line, "url", value, target, status))
    return sorted(found, key=lambda item: (relative(item.page), item.line, item.kind, item.value))


def main() -> int:
    references = [*scan_page(INDEX_HTML), *scan_page(NEWS_HTML)]
    missing = 0
    for item in references:
        marker = "EXT" if item.status == "external" else "OK" if item.status == "ok" else item.status.upper()
        if item.status not in {"ok", "external"}:
            missing += 1
        print(f"{marker:8} {relative(item.page)}:{item.line:<5} {item.kind:<4} {item.value}")
    print(f"\n{len(references)} reference(s); {missing} missing/outside path(s).")
    return 1 if missing else 0


if __name__ == "__main__":
    raise SystemExit(main())
