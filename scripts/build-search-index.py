#!/usr/bin/env python3
"""Build the static site search index for DILG Cebu Province.

Run from the repository root:

    python scripts/build-search-index.py

The script scans public HTML pages, extracts visible/accessibility text, and
rewrites assets/js/search-index.js for the existing client-side search UI.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import unicodedata
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "js" / "search-index.js"
JSON_OUTPUT = ROOT / "assets" / "search-index.json"

EXCLUDED_DIR_PARTS = {
    ".git",
    ".agents",
    ".codex",
    "assets/interactivemap",
    "assets/pdfjs",
    "wp-content",
    "wp-includes",
}

EXCLUDED_FILES = {
    "citizenscharterencodedold.html",
    "citizenschartermodern.html",
    "citizenscharterpdfold.html",
    "maintenanceindex.html",
    "test.html",
    "template.html",
}

SKIP_TAGS = {
    "script",
    "style",
    "noscript",
    "template",
    "svg",
    "canvas",
    "iframe",
    "object",
    "embed",
    "nav",
    "header",
    "footer",
}

SKIP_CLASS_OR_ID_PARTS = {
    "main-header",
    "main-navigation",
    "nav-logo",
    "nav-menu",
    "mobile-menu-toggle",
    "site-search",
    "overlay-widget",
    "header-datetime",
    "jupiterx-footer",
    "footer-navigation",
    "footer-menu",
    "footer-credit",
    "goatcounter",
    "pagination-dot",
    "slider-nav",
}

ATTRIBUTE_TEXT = ("alt", "title", "aria-label")

PAGE_SEARCH_METADATA = {
    "dilgcebuprovinceofficesmap.html": {
        "title": "DILG Cebu Province Field Offices Map",
        "text": (
            "DILG Cebu Province Field Offices Map dilgcebuprovinceofficesmap "
            "Cebu Province offices map field offices interactive map MLGOO CLGOO "
            "local government operations officers municipal city field officers"
        ),
    },
    "organizationalchartchief.html": {
        "title": "DILG Sugbo Family Organizational Chart",
        "text": (
            "DILG Sugbo Family Organizational Chart organizationalchartchief "
            "chief provincial director cluster heads section chiefs LGMES LGCDS "
            "FAS PDMU DILG Cebu Province personnel leadership"
        ),
    },
    "organizationaldilgpersonnel.html": {
        "title": "DILG Cebu Province Personnel Directory",
        "text": (
            "DILG Cebu Province Personnel Directory organizationaldilgpersonnel "
            "DILG personnel staff directory MLGOO CLGOO provincial director "
            "cluster heads LGMES LGCDS FAS PDMU"
        ),
    },
}


def normalize_space(value: str) -> str:
    value = html.unescape(value)
    value = unicodedata.normalize("NFKC", value)
    value = value.replace("\xa0", " ")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def strip_repeated_phrases(value: str) -> str:
    words = normalize_space(value).split(" ")
    collapsed: list[str] = []
    previous = ""
    for word in words:
        if word == previous and len(word) > 2:
            continue
        collapsed.append(word)
        previous = word
    return " ".join(collapsed)


def should_skip_path(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    lowered = rel.lower()

    if path.name.lower() in EXCLUDED_FILES:
        return True

    for part in EXCLUDED_DIR_PARTS:
        if lowered == part or lowered.startswith(part + "/"):
            return True

    return False


def read_text(path: Path) -> str:
    data = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


class VisibleTextParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.text_parts: list[str] = []
        self.tag_stack: list[str] = []
        self.skip_stack: list[str] = []
        self.in_head = False
        self.in_body = False
        self.in_main = False
        self.saw_main = False
        self.in_title = False

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        self.tag_stack.append(tag)

        attr_map = {name.lower(): value or "" for name, value in attrs}

        if tag == "head":
            self.in_head = True
        elif tag == "body":
            self.in_body = True
        elif tag == "main":
            self.in_main = True
            self.saw_main = True
            self.skip_stack.clear()

        skip = tag in SKIP_TAGS or self._has_hidden_attr(attr_map)
        if skip:
            self.skip_stack.append(tag)

        if tag == "title":
            self.in_title = True

        if self._can_collect_text():
            for attr_name in ATTRIBUTE_TEXT:
                value = attr_map.get(attr_name)
                if value:
                    self._add_text(value)

            if tag in {"br", "p", "div", "li", "tr", "section", "article", "h1", "h2", "h3"}:
                self.text_parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()

        if tag == "title":
            self.in_title = False
        elif tag == "head":
            self.in_head = False
        elif tag == "body":
            self.in_body = False
        elif tag == "main":
            self.in_main = False

        if self.skip_stack and self.skip_stack[-1] == tag:
            self.skip_stack.pop()

        if self.tag_stack:
            self.tag_stack.pop()

        if not self.skip_stack and tag in {"p", "div", "li", "tr", "section", "article", "h1", "h2", "h3"}:
            self.text_parts.append(" ")

    def handle_data(self, data: str) -> None:
        if self.in_title:
            self.title_parts.append(data)
            return

        if self._can_collect_text():
            self._add_text(data)

    def _has_hidden_attr(self, attrs: dict[str, str]) -> bool:
        if "hidden" in attrs:
            return True

        aria_hidden = attrs.get("aria-hidden", "").lower()
        if aria_hidden == "true":
            return True

        style = attrs.get("style", "").lower().replace(" ", "")
        if "display:none" in style or "visibility:hidden" in style:
            return True

        class_and_id = " ".join((attrs.get("class", ""), attrs.get("id", ""))).lower()
        return any(part in class_and_id for part in SKIP_CLASS_OR_ID_PARTS)

    def _add_text(self, value: str) -> None:
        value = normalize_space(value)
        if value:
            self.text_parts.append(value)

    def _can_collect_text(self) -> bool:
        if self.in_head or self.skip_stack:
            return False

        if self.in_main:
            return True

        return self.in_body and not self.saw_main

    @property
    def title(self) -> str:
        return normalize_space(" ".join(self.title_parts))

    @property
    def text(self) -> str:
        return strip_repeated_phrases(" ".join(self.text_parts))


class SearchRecordParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.records: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {name.lower(): value or "" for name, value in attrs}
        if "data-search-record" not in attr_map:
            return

        href = normalize_space(attr_map.get("href", ""))
        title = normalize_space(attr_map.get("data-search-title", "") or attr_map.get("title", ""))
        text = normalize_space(attr_map.get("data-search-text", "") or title)
        if href and title and text:
            self.records.append({"url": href, "title": title, "text": text})


def parse_page(path: Path) -> list[dict[str, str]]:
    parser = VisibleTextParser()
    source = read_text(path)
    parser.feed(source)

    text = parser.text
    if len(text) < 20:
        return []

    rel = path.relative_to(ROOT).as_posix()
    metadata = PAGE_SEARCH_METADATA.get(rel)
    title = metadata.get("title") if metadata else ""
    if not title:
        title = parser.title or infer_title_from_text(text) or rel
    if metadata:
        text = normalize_space(f"{metadata['text']} {text}")

    page_record = {
        "url": rel,
        "title": title,
        "text": text,
    }

    search_record_parser = SearchRecordParser()
    search_record_parser.feed(source)
    shortcut_records = []
    for record in search_record_parser.records:
        shortcut_records.append(
            {
                "url": rel + record["url"],
                "title": record["title"],
                "text": record["text"],
            }
        )

    return [page_record, *shortcut_records]


def infer_title_from_text(text: str) -> str:
    words = text.split(" ")
    return " ".join(words[:12]).strip()


def discover_pages() -> list[Path]:
    pages = [
        path
        for path in ROOT.rglob("*.html")
        if path.is_file() and not should_skip_path(path)
    ]
    return sorted(pages, key=lambda path: path.relative_to(ROOT).as_posix().lower())


def build_index() -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    for page in discover_pages():
        records.extend(parse_page(page))
    return records


def write_index(records: list[dict[str, str]], output: Path = OUTPUT, json_output: Path = JSON_OUTPUT) -> None:
    json_output.parent.mkdir(parents=True, exist_ok=True)
    json_output.write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(records, ensure_ascii=False, separators=(",", ":"))
    output.write_text("window.DILG_SEARCH_INDEX = " + payload + ";\n", encoding="utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Build assets/js/search-index.js")
    parser.add_argument("--check", action="store_true", help="report what would be indexed without writing")
    args = parser.parse_args()

    records = build_index()
    if not args.check:
        write_index(records)

    print(f"Indexed {len(records)} HTML pages.")
    print(f"Output: {OUTPUT.relative_to(ROOT).as_posix()}")
    print(f"JSON: {JSON_OUTPUT.relative_to(ROOT).as_posix()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
