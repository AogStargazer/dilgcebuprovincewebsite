"""Read-only context generator for safely adding NEWS articles.

This script inspects a NEWS article folder and prints a ready-to-use context
block that shows exactly what to insert into ``index.html`` and ``news.html``,
including the correct line numbers to read first, image discovery results, and
copy-paste HTML snippets.

Usage (from repo root):

    python scripts/news-maintenance.py inspect NEWS/<folder>
    python scripts/news-maintenance.py inspect NEWS/<folder> --output context.md
    python scripts/news-maintenance.py hooks
"""

from __future__ import annotations

import argparse
import html
import re
import unicodedata
from dataclasses import dataclass, field
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / "index.html"
NEWS_HTML = ROOT / "news.html"
IMAGE_SUFFIXES = frozenset({".jpg", ".jpeg", ".png", ".webp", ".gif"})


# ---------------------------------------------------------------------------
# Data model
# ---------------------------------------------------------------------------


@dataclass
class ArticleContext:
    folder: Path
    html_path: Path
    url: str
    title: str
    card_title: str
    date: str
    kicker: str
    summary: str
    hero_image: str
    slider_images: list[str] = field(default_factory=list)
    main_slider_images: list[str] = field(default_factory=list)
    all_images: list[str] = field(default_factory=list)


# ---------------------------------------------------------------------------
# Text helpers
# ---------------------------------------------------------------------------


def normalize_space(value: str) -> str:
    """Collapse whitespace and strip HTML tags and entities from *value*."""
    import html as _html
    value = _html.unescape(value)
    value = unicodedata.normalize("NFKC", value)
    value = re.sub(r"<[^>]+>", " ", value)
    value = value.replace("\xa0", " ")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


# ---------------------------------------------------------------------------
# Path helpers
# ---------------------------------------------------------------------------


def rel(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return path.as_posix()


# ---------------------------------------------------------------------------
# Line-search helpers (used for hook reporting)
# ---------------------------------------------------------------------------


def line_of(path: Path, pattern: str) -> int | None:
    """Return the 1-based line number of the first line matching *pattern*."""
    regex = re.compile(pattern)
    for index, line in enumerate(read_text(path).splitlines(), start=1):
        if regex.search(line):
            return index
    return None


def all_lines(path: Path, pattern: str) -> list[int]:
    """Return all 1-based line numbers matching *pattern*."""
    regex = re.compile(pattern)
    return [
        index
        for index, line in enumerate(read_text(path).splitlines(), start=1)
        if regex.search(line)
    ]


# ---------------------------------------------------------------------------
# Article HTML discovery
# ---------------------------------------------------------------------------


def find_article_html(folder: Path) -> Path:
    """Locate the primary article HTML file inside *folder*.

    Preference order:
    1. A file named ``<folder-name>.html``
    2. The only ``.html`` file in the folder
    3. Raises if multiple candidates exist (caller must be explicit).
    """
    if not folder.exists() or not folder.is_dir():
        raise FileNotFoundError(f"NEWS folder not found: {folder}")

    html_files = sorted(folder.glob("*.html"))
    if not html_files:
        raise FileNotFoundError(f"No article HTML file found in {folder}")

    preferred = folder / f"{folder.name}.html"
    if preferred in html_files:
        return preferred

    if len(html_files) == 1:
        return html_files[0]

    names = ", ".join(path.name for path in html_files)
    raise RuntimeError(
        f"Multiple HTML files found in {folder}. Choose one explicitly: {names}"
    )


# ---------------------------------------------------------------------------
# Content extraction
# ---------------------------------------------------------------------------


def first_match(source: str, patterns: list[str]) -> str:
    """Return the first capture group of the first pattern that matches."""
    for pattern in patterns:
        match = re.search(pattern, source, flags=re.IGNORECASE | re.DOTALL)
        if match:
            value = normalize_space(match.group(1))
            if value:
                return value
    return ""


def extract_paragraphs(source: str) -> list[str]:
    """Extract article body paragraphs, filtering out boilerplate."""
    paragraphs = []
    for match in re.finditer(r"<p\b[^>]*>(.*?)</p>", source, flags=re.IGNORECASE | re.DOTALL):
        raw = match.group(0)
        if "news-article__date" in raw or "news-article__tags" in raw:
            continue
        text = normalize_space(match.group(1))
        if not text:
            continue
        lower = text.lower()
        if lower.startswith("republic of the philippines"):
            continue
        if lower in {"government links", "go back"}:
            continue
        paragraphs.append(text)
    return paragraphs


def sentence_summary(paragraphs: list[str], limit: int = 320) -> str:
    """Return a summary clipped at a word boundary near *limit* characters."""
    if not paragraphs:
        return ""

    summary = paragraphs[0]
    if len(summary) <= limit:
        return summary

    clipped = summary[:limit].rsplit(" ", 1)[0].rstrip(".,;:")
    clipped = re.sub(
        r"\b(the|and|or|of|in|at|to|for|with|by)$", "", clipped, flags=re.IGNORECASE
    ).strip()
    return f"{clipped}."


def split_kicker(title: str) -> tuple[str, str]:
    """Split ``"KICKER | Card Title"`` into ``(kicker, card_title)``.

    Returns ``("LGCDD", title)`` when no pipe separator is present.
    """
    if "|" not in title:
        return "LGCDD", title.strip()
    kicker, card_title = title.split("|", 1)
    return kicker.strip() or "LGCDD", card_title.strip()


def extract_srcs(source: str) -> list[str]:
    """Return all ``src`` attribute values from ``<img>`` tags."""
    return [
        html.unescape(match.group(1))
        for match in re.finditer(
            r"<img\b[^>]*\bsrc=[\"']([^\"']+)[\"']", source, flags=re.IGNORECASE
        )
    ]


def discover_images(folder: Path) -> list[Path]:
    """Return image files in *folder*, sorted by lowercase filename."""
    return sorted(
        (p for p in folder.iterdir() if p.is_file() and p.suffix.lower() in IMAGE_SUFFIXES),
        key=lambda p: p.name.lower(),
    )


# ---------------------------------------------------------------------------
# Context builder
# ---------------------------------------------------------------------------


def build_context(folder_value: str) -> ArticleContext:
    folder = (ROOT / folder_value).resolve()
    html_path = find_article_html(folder)
    source = read_text(html_path)
    images = discover_images(folder)
    image_rels = [rel(path) for path in images]

    title = first_match(
        source,
        [
            r"<h1\b[^>]*class=[\"'][^\"']*news-article__title[^\"']*[\"'][^>]*>(.*?)</h1>",
            r"<title\b[^>]*>(.*?)</title>",
        ],
    ) or html_path.stem.replace("-", " ").title()

    date = first_match(
        source,
        [r"<p\b[^>]*class=[\"'][^\"']*news-article__date[^\"']*[\"'][^>]*>(.*?)</p>"],
    )

    kicker, card_title = split_kicker(title)
    paragraphs = extract_paragraphs(source)
    summary = sentence_summary(paragraphs)

    srcs = extract_srcs(source)
    # Prefer the explicit hero-image class; fall back to FORSLIDERPREVIEW.
    hero_image = next(
        (
            src
            for src in srcs
            if "news-article__hero" in source[max(0, source.find(src) - 180) : source.find(src) + 180]
        ),
        "",
    )
    if not hero_image:
        hero_image = next((src for src in srcs if "FORSLIDERPREVIEW" in src), "")
    if not hero_image and image_rels:
        hero_image = image_rels[0]

    slider_images = [p for p in image_rels if "FORSLIDERPREVIEW" in p.upper()]
    main_slider_images = [p for p in image_rels if "FORMAINSLIDERPREVIEW" in p.upper()]

    return ArticleContext(
        folder=folder,
        html_path=html_path,
        url=rel(html_path),
        title=title,
        card_title=card_title,
        date=date,
        kicker=kicker,
        summary=summary,
        hero_image=hero_image,
        slider_images=slider_images,
        main_slider_images=main_slider_images,
        all_images=image_rels,
    )


# ---------------------------------------------------------------------------
# Hook report
# ---------------------------------------------------------------------------


def hook_report() -> str:
    """Print current hook line numbers for the two template pages."""
    index_main_slider = line_of(INDEX_HTML, r'<div class="main-slider-container full-width"')
    index_news_title = line_of(INDEX_HTML, r"dilg-sugbo-balita-title")
    index_news_list = line_of(INDEX_HTML, r'<div class="sugbo-balita-list">')
    news_featured = line_of(NEWS_HTML, r'<div class="news-slider-wrap">')
    news_list = line_of(NEWS_HTML, r'<div class="sugbo-balita-list">')

    existing_index = all_lines(INDEX_HTML, r'<a class="sugbo-balita-link" href="NEWS/')
    existing_news = all_lines(NEWS_HTML, r'<a class="sugbo-balita-link" href="NEWS/')

    def _fmt(line: int | None) -> str:
        return str(line) if line else "not found"

    lines = [
        "## Hook Lines To Read Before Editing",
        "",
        f"- `index.html` homepage main slider: line {_fmt(index_main_slider)}",
        f"- `index.html` DILG Sugbo Balita heading: line {_fmt(index_news_title)}",
        f"- `index.html` DILG Sugbo Balita list: line {_fmt(index_news_list)}",
        f"- `news.html` featured news slider: line {_fmt(news_featured)}",
        f"- `news.html` news list: line {_fmt(news_list)}",
        "",
        "Existing top news-card anchors:",
        f"- `index.html`: {', '.join(str(l) for l in existing_index[:5]) or 'none found'}",
        f"- `news.html`: {', '.join(str(l) for l in existing_news[:5]) or 'none found'}",
    ]
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# HTML snippet generators
# ---------------------------------------------------------------------------


def _img_tags(images: list[str], alt: str, indent: str, active_first: bool = True) -> str:
    if not images:
        return f"{indent}<!-- No FORSLIDERPREVIEW image detected. Choose an image before inserting. -->"
    tags = []
    for index, image in enumerate(images):
        class_attr = ' class="active"' if active_first and index == 0 else ""
        tags.append(
            f'{indent}<img{class_attr} src="{image}" alt="{html.escape(alt, quote=True)}" loading="lazy" decoding="async">'
        )
    return "\n".join(tags)


def news_card_snippet(ctx: ArticleContext, heading_tag: str = "h3", indent: str = "    ") -> str:
    if ctx.slider_images:
        image_block = _img_tags(ctx.slider_images, ctx.card_title, indent + "        ")
        media = (
            f'{indent}      <div class="sugbo-balita-photo-slider" data-news-photo-slider>\n'
            f"{image_block}\n"
            f"{indent}      </div>"
        )
    else:
        media = _img_tags([ctx.hero_image], ctx.card_title, indent + "      ", active_first=False)

    return "\n".join(
        [
            f'{indent}<a class="sugbo-balita-link" href="{ctx.url}">',
            f'{indent}  <article class="sugbo-balita-item">',
            f'{indent}    <div class="sugbo-balita-thumb">',
            media,
            f'{indent}    </div>',
            f'{indent}    <div>',
            f'{indent}      <p class="sugbo-balita-kicker">{html.escape(ctx.kicker)}</p>',
            f'{indent}      <{heading_tag} class="sugbo-balita-headline">{html.escape(ctx.card_title)}</{heading_tag}>',
            f'{indent}      <p class="sugbo-balita-date">{html.escape(ctx.date)}</p>',
            f'{indent}      <p class="sugbo-balita-summary">{html.escape(ctx.summary)}</p>',
            f'{indent}    </div>',
            f'{indent}  </article>',
            f'{indent}</a>',
        ]
    )


def news_featured_slide(ctx: ArticleContext) -> str:
    image = (ctx.slider_images or [ctx.hero_image])[0]
    return "\n".join(
        [
            '                                <div class="slide">',
            f'                                  <a href="{ctx.url}">',
            f'                                    <img src="{image}" alt="{html.escape(ctx.card_title, quote=True)}" loading="lazy" decoding="async">',
            "                                  </a>",
            "                                </div>",
        ]
    )


def index_main_slide(ctx: ArticleContext) -> str:
    if not ctx.main_slider_images:
        return (
            "<!-- No FORMAINSLIDERPREVIEW image detected. "
            "Do not add homepage main slider unless the user approves another image. -->"
        )
    image = ctx.main_slider_images[0]
    return "\n".join(
        [
            '                        <div class="slide">',
            f'                          <a href="{ctx.url}">',
            f'                            <img src="{image}" alt="{html.escape(ctx.card_title, quote=True)}" loading="lazy" decoding="async">',
            "                          </a>",
            "                        </div>",
        ]
    )


# ---------------------------------------------------------------------------
# Full context renderer
# ---------------------------------------------------------------------------


def render_context(ctx: ArticleContext) -> str:
    slider_list = "\n".join(f"- `{img}`" for img in ctx.slider_images) or "- none detected"
    main_slider_list = "\n".join(f"- `{img}`" for img in ctx.main_slider_images) or "- none detected"
    all_images = "\n".join(f"- `{img}`" for img in ctx.all_images) or "- none detected"

    sections = [
        "# News Update Context",
        "",
        "Use this context before editing `index.html` or `news.html`.",
        "",
        "## Article",
        "",
        f"- Folder: `{rel(ctx.folder)}`",
        f"- HTML:   `{rel(ctx.html_path)}`",
        f"- URL:    `{ctx.url}`",
        f"- Title:      {ctx.title}",
        f"- Card title: {ctx.card_title}",
        f"- Date:   {ctx.date or 'missing'}",
        f"- Kicker: {ctx.kicker}",
        f"- Summary: {ctx.summary or 'missing'}",
        f"- Hero image: `{ctx.hero_image or 'missing'}`",
        "",
        "## Preview Assets",
        "",
        "FORSLIDERPREVIEW images:",
        slider_list,
        "",
        "FORMAINSLIDERPREVIEW images:",
        main_slider_list,
        "",
        "All images in folder:",
        all_images,
        "",
        hook_report(),
        "",
        "## Safe Insert Plan",
        "",
        "1. Read the hook areas listed above.",
        "2. Insert the new card before the first existing card in `index.html` and `news.html`.",
        "3. Add a featured slide in `news.html` only when a `FORSLIDERPREVIEW` image exists.",
        "4. Add a homepage main slider slide in `index.html` only when a `FORMAINSLIDERPREVIEW` image exists.",
        "5. Run text normalization and search rebuild after edits.",
        "",
        "## Suggested `index.html` DILG Sugbo Balita Card",
        "",
        "```html",
        news_card_snippet(ctx, heading_tag="h3", indent="    "),
        "```",
        "",
        "## Suggested `news.html` News List Card",
        "",
        "```html",
        news_card_snippet(ctx, heading_tag="h3", indent="                              "),
        "```",
        "",
        "## Suggested `news.html` Featured Slide",
        "",
        "```html",
        news_featured_slide(ctx),
        "```",
        "",
        "## Suggested `index.html` Homepage Main Slider Slide",
        "",
        "```html",
        index_main_slide(ctx),
        "```",
        "",
        "## Post-Edit Commands",
        "",
        "```powershell",
        "python scripts/site-maintenance.py text fix NEWS index.html news.html",
        "python scripts/site-maintenance.py search rebuild",
        "python scripts/site-maintenance.py doctor",
        "```",
    ]
    return "\n".join(sections)


# ---------------------------------------------------------------------------
# CLI commands
# ---------------------------------------------------------------------------


def cmd_inspect(args: argparse.Namespace) -> int:
    ctx = build_context(args.folder)
    output = render_context(ctx)
    print(output)
    if args.output:
        output_path = (ROOT / args.output).resolve()
        output_path.write_text(output + "\n", encoding="utf-8")
        print(f"\nWrote context: {rel(output_path)}")
    return 0


def cmd_hooks(_args: argparse.Namespace) -> int:
    print(hook_report())
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Generate read-first context for safely adding NEWS articles "
            "to index.html and news.html."
        )
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    inspect = subparsers.add_parser(
        "inspect",
        help="inspect a NEWS article folder and print update context",
    )
    inspect.add_argument("folder", help="NEWS article folder, e.g. NEWS/news-june-09-2026-001")
    inspect.add_argument("--output", help="optional markdown file to write the generated context")
    inspect.set_defaults(func=cmd_inspect)

    hooks = subparsers.add_parser("hooks", help="print current news hook line numbers")
    hooks.set_defaults(func=cmd_hooks)

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
