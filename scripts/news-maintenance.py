from __future__ import annotations

import argparse
import html
import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / "index.html"
NEWS_HTML = ROOT / "news.html"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif"}


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
    slider_images: list[str]
    main_slider_images: list[str]
    all_images: list[str]


def normalize_space(value: str) -> str:
    value = html.unescape(value)
    value = unicodedata.normalize("NFKC", value)
    value = re.sub(r"<[^>]+>", " ", value)
    value = value.replace("\xa0", " ")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def rel(path: Path) -> str:
    return path.relative_to(ROOT).as_posix()


def line_of(path: Path, pattern: str) -> int | None:
    regex = re.compile(pattern)
    for index, line in enumerate(read_text(path).splitlines(), start=1):
        if regex.search(line):
            return index
    return None


def all_lines(path: Path, pattern: str) -> list[int]:
    regex = re.compile(pattern)
    return [
        index
        for index, line in enumerate(read_text(path).splitlines(), start=1)
        if regex.search(line)
    ]


def find_article_html(folder: Path) -> Path:
    if not folder.exists() or not folder.is_dir():
        raise FileNotFoundError(f"News folder not found: {folder}")

    html_files = sorted(folder.glob("*.html"))
    if not html_files:
        raise FileNotFoundError(f"No article HTML file found in {folder}")

    preferred = folder / f"{folder.name}.html"
    if preferred in html_files:
        return preferred

    if len(html_files) == 1:
        return html_files[0]

    names = ", ".join(path.name for path in html_files)
    raise RuntimeError(f"Multiple HTML files found. Choose one explicitly: {names}")


def first_match(source: str, patterns: list[str]) -> str:
    for pattern in patterns:
        match = re.search(pattern, source, flags=re.IGNORECASE | re.DOTALL)
        if match:
            value = normalize_space(match.group(1))
            if value:
                return value
    return ""


def extract_paragraphs(source: str) -> list[str]:
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
    if not paragraphs:
        return ""

    summary = paragraphs[0]
    if len(summary) <= limit:
        return summary

    clipped = summary[:limit].rsplit(" ", 1)[0].rstrip(".,;:")
    clipped = re.sub(r"\b(the|and|or|of|in|at|to|for|with|by)$", "", clipped, flags=re.IGNORECASE).strip()
    return f"{clipped}."


def split_kicker(title: str) -> tuple[str, str]:
    if "|" not in title:
        return "LGCDD", title.strip()

    kicker, card_title = title.split("|", 1)
    return kicker.strip() or "LGCDD", card_title.strip()


def discover_images(folder: Path) -> list[Path]:
    return sorted(
        [
            path
            for path in folder.iterdir()
            if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES
        ],
        key=lambda path: path.name.lower(),
    )


def extract_srcs(source: str) -> list[str]:
    return [
        html.unescape(match.group(1))
        for match in re.finditer(r"<img\b[^>]*\bsrc=[\"']([^\"']+)[\"']", source, flags=re.IGNORECASE)
    ]


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
    )
    if not title:
        title = html_path.stem.replace("-", " ").title()

    date = first_match(
        source,
        [r"<p\b[^>]*class=[\"'][^\"']*news-article__date[^\"']*[\"'][^>]*>(.*?)</p>"],
    )

    kicker, card_title = split_kicker(title)
    paragraphs = extract_paragraphs(source)
    summary = sentence_summary(paragraphs)
    srcs = extract_srcs(source)
    hero_image = next((src for src in srcs if "news-article__hero" in source[source.find(src) - 180 : source.find(src) + 180]), "")
    if not hero_image:
        hero_image = next((src for src in srcs if "FORSLIDERPREVIEW" in src), "")
    if not hero_image and image_rels:
        hero_image = image_rels[0]

    slider_images = [path for path in image_rels if "FORSLIDERPREVIEW" in path.upper()]
    main_slider_images = [path for path in image_rels if "FORMAINSLIDERPREVIEW" in path.upper()]

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


def hook_report() -> str:
    index_main_slider = line_of(INDEX_HTML, r'<div class="main-slider-container full-width"')
    index_news_title = line_of(INDEX_HTML, r'dilg-sugbo-balita-title')
    index_news_list = line_of(INDEX_HTML, r'<div class="sugbo-balita-list">')
    news_featured = line_of(NEWS_HTML, r'<div class="news-slider-wrap">')
    news_list = line_of(NEWS_HTML, r'<div class="sugbo-balita-list">')

    existing_index = all_lines(INDEX_HTML, r'<a class="sugbo-balita-link" href="NEWS/')
    existing_news = all_lines(NEWS_HTML, r'<a class="sugbo-balita-link" href="NEWS/')

    lines = [
        "## Hook Lines To Read Before Editing",
        "",
        f"- `index.html` homepage main slider: line {index_main_slider or 'not found'}",
        f"- `index.html` DILG Sugbo Balita heading: line {index_news_title or 'not found'}",
        f"- `index.html` DILG Sugbo Balita list: line {index_news_list or 'not found'}",
        f"- `news.html` featured news slider: line {news_featured or 'not found'}",
        f"- `news.html` news list: line {news_list or 'not found'}",
        "",
        "Existing top news-card anchors:",
        f"- `index.html`: {', '.join(str(line) for line in existing_index[:5]) or 'none found'}",
        f"- `news.html`: {', '.join(str(line) for line in existing_news[:5]) or 'none found'}",
    ]
    return "\n".join(lines)


def image_tags(images: list[str], alt: str, indent: str = "            ", active_first: bool = True) -> str:
    if not images:
        return f'{indent}<!-- No FORSLIDERPREVIEW image detected. Choose an image before inserting. -->'

    tags = []
    for index, image in enumerate(images):
        class_attr = ' class="active"' if active_first and index == 0 else ""
        tags.append(
            f'{indent}<img{class_attr} src="{image}" alt="{alt}" loading="lazy" decoding="async">'
        )
    return "\n".join(tags)


def news_card_snippet(ctx: ArticleContext, heading_tag: str = "h3", indent: str = "    ") -> str:
    if ctx.slider_images:
        image_block = image_tags(ctx.slider_images, ctx.card_title, indent + "        ")
        media = (
            f'{indent}      <div class="sugbo-balita-photo-slider" data-news-photo-slider>\n'
            f"{image_block}\n"
            f"{indent}      </div>"
        )
    else:
        media = image_tags([ctx.hero_image], ctx.card_title, indent + "      ", active_first=False)

    return "\n".join(
        [
            f'{indent}<a class="sugbo-balita-link" href="{ctx.url}">',
            f'{indent}  <article class="sugbo-balita-item">',
            f'{indent}    <div class="sugbo-balita-thumb">',
            media,
            f'{indent}    </div>',
            f'{indent}    <div>',
            f'{indent}      <p class="sugbo-balita-kicker">{ctx.kicker}</p>',
            f'{indent}      <{heading_tag} class="sugbo-balita-headline">{ctx.card_title}</{heading_tag}>',
            f'{indent}      <p class="sugbo-balita-date">{ctx.date}</p>',
            f'{indent}      <p class="sugbo-balita-summary">{ctx.summary}</p>',
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
            f'                                    <img src="{image}" alt="{ctx.card_title}" loading="lazy" decoding="async">',
            "                                  </a>",
            "                                </div>",
        ]
    )


def index_main_slide(ctx: ArticleContext) -> str:
    if not ctx.main_slider_images:
        return "<!-- No FORMAINSLIDERPREVIEW image detected. Do not add homepage main slider unless the user approves another image. -->"

    image = ctx.main_slider_images[0]
    return "\n".join(
        [
            "                        <div class=\"slide\">",
            f"                          <a href=\"{ctx.url}\">",
            f"                            <img src=\"{image}\" alt=\"{ctx.card_title}\" loading=\"lazy\" decoding=\"async\">",
            "                          </a>",
            "                        </div>",
        ]
    )


def render_context(ctx: ArticleContext) -> str:
    slider_list = "\n".join(f"- `{image}`" for image in ctx.slider_images) or "- none detected"
    main_slider_list = "\n".join(f"- `{image}`" for image in ctx.main_slider_images) or "- none detected"
    all_images = "\n".join(f"- `{image}`" for image in ctx.all_images) or "- none detected"

    return "\n".join(
        [
            "# News Update Context",
            "",
            "Use this context before editing `index.html` or `news.html`. The script is read-only unless a future command explicitly says otherwise.",
            "",
            "## Article",
            "",
            f"- Folder: `{rel(ctx.folder)}`",
            f"- HTML: `{rel(ctx.html_path)}`",
            f"- URL: `{ctx.url}`",
            f"- Title: {ctx.title}",
            f"- Card title: {ctx.card_title}",
            f"- Date: {ctx.date or 'missing'}",
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
            "2. Insert the new card before the first existing news card in `index.html` and `news.html` if the user wants the article at the top.",
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
    )


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
        description="Generate read-first context for safely adding NEWS articles to index.html and news.html."
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    inspect = subparsers.add_parser("inspect", help="inspect a NEWS article folder and print update context")
    inspect.add_argument("folder", help="NEWS article folder, for example NEWS/news-june-09-2026-001")
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
