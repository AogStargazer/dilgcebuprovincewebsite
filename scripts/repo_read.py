"""Shared read-only repository inspection helpers."""

from __future__ import annotations

import html
import json
import re
import subprocess
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
NEWS_ROOT = ROOT / "NEWS"
INDEX_HTML = ROOT / "index.html"
NEWS_HTML = ROOT / "news.html"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
FOLDER_DATE_RE = re.compile(
    r"^news-([a-z]+)-(\d{2})-(\d{4})-(\d+)$",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class NewsItem:
    folder: Path
    date: datetime
    title: str
    kicker: str
    slider_count: int
    main_count: int
    in_index: bool
    in_news: bool


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def relative(path: Path) -> str:
    return path.resolve().relative_to(ROOT).as_posix()


def folder_date(name: str) -> datetime | None:
    match = FOLDER_DATE_RE.match(name)
    if not match:
        return None
    month_name, day, year, _sequence = match.groups()
    try:
        return datetime.strptime(f"{month_name} {day} {year}", "%B %d %Y")
    except ValueError:
        return None


def find_article_html(folder: Path) -> Path | None:
    preferred = folder / f"{folder.name}.html"
    if preferred.is_file():
        return preferred
    files = sorted(folder.glob("*.html"))
    return files[0] if len(files) == 1 else None


def clean_html(value: str) -> str:
    value = html.unescape(re.sub(r"<[^>]+>", " ", value))
    return re.sub(r"\s+", " ", value).strip()


def article_title(folder: Path) -> str:
    article = find_article_html(folder)
    if article is None:
        return folder.name
    source = read_text(article)
    patterns = (
        r'<h1\b[^>]*class=["\'][^"\']*news-article__title[^"\']*["\'][^>]*>(.*?)</h1>',
        r"<title\b[^>]*>(.*?)</title>",
    )
    for pattern in patterns:
        match = re.search(pattern, source, flags=re.IGNORECASE | re.DOTALL)
        if match:
            return clean_html(match.group(1))
    return folder.name


def card_kickers(source: str) -> dict[str, str]:
    values: dict[str, str] = {}
    pattern = re.compile(
        r'<a\b[^>]*class=["\'][^"\']*sugbo-balita-link[^"\']*["\'][^>]*'
        r'href=["\']NEWS/([^/"\']+)/[^"\']+["\'][^>]*>'
        r'.*?<p\b[^>]*class=["\'][^"\']*sugbo-balita-kicker[^"\']*["\'][^>]*>'
        r"(.*?)</p>",
        flags=re.IGNORECASE | re.DOTALL,
    )
    for match in pattern.finditer(source):
        values[match.group(1)] = clean_html(match.group(2))
    return values


def manifest_kicker(folder: Path) -> str:
    for name in ("news.json", "news-workflow.json"):
        path = folder / name
        if not path.is_file():
            continue
        try:
            value = json.loads(read_text(path)).get("kicker", "")
        except (json.JSONDecodeError, OSError):
            continue
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""


def discover_news() -> list[NewsItem]:
    index_source = read_text(INDEX_HTML)
    news_source = read_text(NEWS_HTML)
    known_kickers = {**card_kickers(index_source), **card_kickers(news_source)}
    items: list[NewsItem] = []

    for folder in NEWS_ROOT.iterdir():
        if not folder.is_dir():
            continue
        date = folder_date(folder.name)
        if date is None:
            continue
        title = article_title(folder)
        kicker = manifest_kicker(folder) or known_kickers.get(folder.name, "")
        if not kicker and "|" in title:
            kicker, title = (part.strip() for part in title.split("|", 1))
        kicker = kicker or "LGCDD"
        images = [
            path
            for path in folder.iterdir()
            if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
        ]
        items.append(
            NewsItem(
                folder=folder,
                date=date,
                title=title,
                kicker=kicker,
                slider_count=sum("FORSLIDERPREVIEW" in path.name.upper() for path in images),
                main_count=sum("FORMAINSLIDERPREVIEW" in path.name.upper() for path in images),
                in_index=f"NEWS/{folder.name}/" in index_source,
                in_news=f"NEWS/{folder.name}/" in news_source,
            )
        )

    return sorted(items, key=lambda item: (item.date, item.folder.name), reverse=True)


HOOK_PATTERNS = (
    ("index main slider", INDEX_HTML, r'<div class="main-slider-container full-width">'),
    ("index main begin", INDEX_HTML, r"NEWS_WORKFLOW_INDEX_MAIN_SLIDES_BEGIN"),
    ("index main end", INDEX_HTML, r"NEWS_WORKFLOW_INDEX_MAIN_SLIDES_END"),
    ("index cards begin", INDEX_HTML, r"NEWS_WORKFLOW_INDEX_CARDS_BEGIN"),
    ("index cards end", INDEX_HTML, r"NEWS_WORKFLOW_INDEX_CARDS_END"),
    ("news featured begin", NEWS_HTML, r"NEWS_WORKFLOW_FEATURED_SLIDES_BEGIN"),
    ("news featured end", NEWS_HTML, r"NEWS_WORKFLOW_FEATURED_SLIDES_END"),
    ("news cards begin", NEWS_HTML, r"NEWS_WORKFLOW_NEWS_CARDS_BEGIN"),
    ("news cards end", NEWS_HTML, r"NEWS_WORKFLOW_NEWS_CARDS_END"),
)


def hook_lines() -> list[tuple[str, str, int | None]]:
    results = []
    for label, path, pattern in HOOK_PATTERNS:
        line = next(
            (
                number
                for number, value in enumerate(read_text(path).splitlines(), start=1)
                if re.search(pattern, value)
            ),
            None,
        )
        results.append((label, relative(path), line))
    return results


def git_status_paths() -> list[tuple[str, str]]:
    result = subprocess.run(
        ["git", "status", "--porcelain=v1", "-z"],
        cwd=ROOT,
        capture_output=True,
        check=False,
    )
    if result.returncode:
        return []
    entries = result.stdout.decode("utf-8", errors="replace").split("\0")
    paths: list[tuple[str, str]] = []
    index = 0
    while index < len(entries):
        entry = entries[index]
        index += 1
        if not entry:
            continue
        status = entry[:2]
        path = entry[3:]
        if status[0] in {"R", "C"} and index < len(entries):
            path = entries[index]
            index += 1
        paths.append((status, path.replace("\\", "/")))
    return paths
