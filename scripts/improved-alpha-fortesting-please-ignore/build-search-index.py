"""Build the static site search index for DILG Cebu Province.

Run from the repository root:

    python scripts/build-search-index.py [--check]

The script scans public HTML pages, extracts visible/accessibility text, and
rewrites assets/js/search-index.js for the existing client-side search UI.
Pass --check to scan and report without writing any files.
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

EXCLUDED_DIR_PARTS = frozenset(
    {
        ".git",
        ".agents",
        ".codex",
        "assets/interactivemap",
        "assets/pdfjs",
        "wp-content",
        "wp-includes",
    }
)

EXCLUDED_FILES = frozenset(
    {
        "citizenscharterencodedold.html",
        "citizenschartermodern.html",
        "citizenscharterpdfold.html",
        "maintenanceindex.html",
        "test.html",
        "template.html",
    }
)

# Tags whose subtree we never want to index.
SKIP_TAGS = frozenset(
    {
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
)

# Any element whose class or id contains one of these substrings is skipped.
SKIP_CLASS_OR_ID_PARTS = frozenset(
    {
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
)

# HTML attributes whose values carry useful accessible text.
ATTRIBUTE_TEXT = ("alt", "title", "aria-label")

# Per-page metadata overrides for pages that are image-heavy or interactive
# and yield too little extractable text on their own.
PAGE_SEARCH_METADATA: dict[str, dict[str, str]] = {
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

# Block-level tags that introduce a natural word boundary in the text stream.
_BLOCK_TAGS = frozenset(
    {"br", "p", "div", "li", "tr", "section", "article", "h1", "h2", "h3"}
)


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------


def normalize_space(value: str) -> str:
    value = html.unescape(value)
    value = unicodedata.normalize("NFKC", value)
    value = value.replace("\xa0", " ")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def strip_repeated_phrases(value: str) -> str:
    """Collapse consecutive identical words (> 2 chars) from the text stream."""
    words = normalize_space(value).split(" ")
    collapsed: list[str] = []
    previous = ""
    for word in words:
        if word == previous and len(word) > 2:
            continue
        collapsed.append(word)
        previous = word
    return " ".join(collapsed)


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------


def should_skip_path(path: Path) -> bool:
    try:
        rel = path.relative_to(ROOT).as_posix()
    except ValueError:
        rel = path.as_posix()
    lowered = rel.lower()

    if path.name.lower() in EXCLUDED_FILES:
        return True
    return any(
        lowered == part or lowered.startswith(part + "/")
        for part in EXCLUDED_DIR_PARTS
    )


def read_text(path: Path) -> str:
    data = path.read_bytes()
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


# ---------------------------------------------------------------------------
# HTML parsers
# ---------------------------------------------------------------------------


class VisibleTextParser(HTMLParser):
    """Extract visible and accessibility text from an HTML document.

    Strategy
    --------
    - Prefer ``<main>`` content when present; fall back to ``<body>``.
    - Skip tags in ``SKIP_TAGS`` and any element that is visually hidden.
    - Skip elements whose class or id hints at navigation / chrome.
    - Collect ``alt``, ``title``, and ``aria-label`` attribute text.

    The skip stack tracks *depth* correctly for nested same-name tags so that
    ``</nav>`` inside a ``<nav>`` does not prematurely re-enable collection.
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.title_parts: list[str] = []
        self.text_parts: list[str] = []
        # Each entry is the tag name that opened this skip level.
        self._skip_stack: list[str] = []
        self._in_head = False
        self._in_body = False
        self._in_main = False
        self._saw_main = False
        self._in_title = False

    # ------------------------------------------------------------------
    # HTMLParser callbacks
    # ------------------------------------------------------------------

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        tag = tag.lower()
        attr_map = {name.lower(): (value or "") for name, value in attrs}

        if tag == "head":
            self._in_head = True
        elif tag == "body":
            self._in_body = True
        elif tag == "main":
            self._in_main = True
            self._saw_main = True
            # Entering <main> resets any skip context from outside it.
            self._skip_stack.clear()
        elif tag == "title":
            self._in_title = True

        if tag in SKIP_TAGS or self._is_hidden(attr_map):
            self._skip_stack.append(tag)
            return  # No attribute text from skipped elements.

        if self._collecting:
            for attr_name in ATTRIBUTE_TEXT:
                value = attr_map.get(attr_name)
                if value:
                    self._add(value)
            if tag in _BLOCK_TAGS:
                self.text_parts.append(" ")

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()

        if tag == "title":
            self._in_title = False
        elif tag == "head":
            self._in_head = False
        elif tag == "body":
            self._in_body = False
        elif tag == "main":
            self._in_main = False

        # Pop the skip stack only when this closing tag matches the *most
        # recent* open skip tag.  This keeps depth correct for nested same-
        # name skip tags (e.g. <nav> inside <nav>).
        if self._skip_stack and self._skip_stack[-1] == tag:
            self._skip_stack.pop()

        if self._collecting and tag in _BLOCK_TAGS:
            self.text_parts.append(" ")

    def handle_data(self, data: str) -> None:
        if self._in_title:
            self.title_parts.append(data)
            return
        if self._collecting:
            self._add(data)

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _is_hidden(self, attrs: dict[str, str]) -> bool:
        if "hidden" in attrs:
            return True
        if attrs.get("aria-hidden", "").lower() == "true":
            return True
        style = attrs.get("style", "").lower().replace(" ", "")
        if "display:none" in style or "visibility:hidden" in style:
            return True
        class_and_id = " ".join((attrs.get("class", ""), attrs.get("id", ""))).lower()
        return any(part in class_and_id for part in SKIP_CLASS_OR_ID_PARTS)

    def _add(self, value: str) -> None:
        value = normalize_space(value)
        if value:
            self.text_parts.append(value)

    @property
    def _collecting(self) -> bool:
        if self._in_head or self._skip_stack:
            return False
        if self._in_main:
            return True
        return self._in_body and not self._saw_main

    # ------------------------------------------------------------------
    # Results
    # ------------------------------------------------------------------

    @property
    def title(self) -> str:
        return normalize_space(" ".join(self.title_parts))

    @property
    def text(self) -> str:
        return strip_repeated_phrases(" ".join(self.text_parts))


class SearchRecordParser(HTMLParser):
    """Collect explicit ``data-search-record`` shortcut anchors.

    Pages can embed lightweight search records directly in their markup:

        <a href="#section"
           data-search-record
           data-search-title="Section Name"
           data-search-text="keywords…">…</a>
    """

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.records: list[dict[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attr_map = {name.lower(): (value or "") for name, value in attrs}
        if "data-search-record" not in attr_map:
            return
        href = normalize_space(attr_map.get("href", ""))
        title = normalize_space(attr_map.get("data-search-title", "") or attr_map.get("title", ""))
        text = normalize_space(attr_map.get("data-search-text", "") or title)
        if href and title and text:
            self.records.append({"url": href, "title": title, "text": text})


# ---------------------------------------------------------------------------
# Index building
# ---------------------------------------------------------------------------


def _infer_title_from_text(text: str) -> str:
    """Derive a rough title from the first 12 words of extracted text."""
    return " ".join(text.split()[:12])


def parse_page(path: Path) -> list[dict[str, str]]:
    """Return search records for *path* (one page record + any shortcut records)."""
    source = read_text(path)

    page_parser = VisibleTextParser()
    page_parser.feed(source)
    text = page_parser.text

    if len(text) < 20:
        return []

    try:
        rel = path.relative_to(ROOT).as_posix()
    except ValueError:
        rel = path.as_posix()

    metadata = PAGE_SEARCH_METADATA.get(rel)
    title = (metadata.get("title") if metadata else "") or page_parser.title or _infer_title_from_text(text) or rel
    if metadata:
        text = normalize_space(f"{metadata['text']} {text}")

    page_record: dict[str, str] = {"url": rel, "title": title, "text": text}

    shortcut_parser = SearchRecordParser()
    shortcut_parser.feed(source)
    shortcut_records = [
        {"url": rel + record["url"], "title": record["title"], "text": record["text"]}
        for record in shortcut_parser.records
    ]

    return [page_record, *shortcut_records]


def discover_pages() -> list[Path]:
    return sorted(
        (
            path
            for path in ROOT.rglob("*.html")
            if path.is_file() and not should_skip_path(path)
        ),
        key=lambda path: path.relative_to(ROOT).as_posix().lower(),
    )


def build_index() -> list[dict[str, str]]:
    records: list[dict[str, str]] = []
    for page in discover_pages():
        records.extend(parse_page(page))
    return records


def write_index(
    records: list[dict[str, str]],
    output: Path = OUTPUT,
    json_output: Path = JSON_OUTPUT,
) -> None:
    json_output.parent.mkdir(parents=True, exist_ok=True)
    json_output.write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    output.parent.mkdir(parents=True, exist_ok=True)
    payload = json.dumps(records, ensure_ascii=False, separators=(",", ":"))
    output.write_text("window.DILG_SEARCH_INDEX = " + payload + ";\n", encoding="utf-8")


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def main() -> int:
    parser = argparse.ArgumentParser(description="Build assets/js/search-index.js")
    parser.add_argument(
        "--check",
        action="store_true",
        help="scan pages and report record count without writing any files",
    )
    args = parser.parse_args()

    records = build_index()
    if not args.check:
        write_index(records)

    try:
        output_rel = OUTPUT.relative_to(ROOT).as_posix()
        json_rel = JSON_OUTPUT.relative_to(ROOT).as_posix()
    except ValueError:
        output_rel = str(OUTPUT)
        json_rel = str(JSON_OUTPUT)

    print(f"Indexed {len(records)} HTML pages.")
    if args.check:
        print("(--check mode: no files written)")
    else:
        print(f"Output: {output_rel}")
        print(f"JSON:   {json_rel}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
