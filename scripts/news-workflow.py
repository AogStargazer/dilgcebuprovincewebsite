from __future__ import annotations

import argparse
import html
import importlib.util
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from types import ModuleType


ROOT = Path(__file__).resolve().parents[1]
INDEX_HTML = ROOT / "index.html"
NEWS_HTML = ROOT / "news.html"
NEWS_ROOT = ROOT / "NEWS"
IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
ARTICLE_DATE_RE = re.compile(r"news-([a-z]+)-(\d{2})-(\d{4})-(\d+)", re.IGNORECASE)
MONTHS = {
    "january": 1,
    "february": 2,
    "march": 3,
    "april": 4,
    "may": 5,
    "june": 6,
    "july": 7,
    "august": 8,
    "september": 9,
    "october": 10,
    "november": 11,
    "december": 12,
}
KNOWN_KICKERS = (
    "PDMS",
    "PDMU",
    "LGCDD",
    "EODB",
    "LGMED",
    "LGCDS",
    "FAD",
)


@dataclass
class Article:
    folder: Path
    html_path: Path
    url: str
    folder_date: str
    page_date: str
    effective_date: str
    title: str
    card_title: str
    kicker: str
    kicker_source: str
    summary: str
    hero_image: str
    slider_images: list[str]
    main_slider_images: list[str]
    gallery_images: list[str]
    all_images: list[str]


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
    return path.resolve().relative_to(ROOT).as_posix()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def write_text(path: Path, value: str) -> None:
    path.write_text(value, encoding="utf-8", newline="\n")


def normalize_space(value: str) -> str:
    normalizer = load_script("news_workflow_news_maintenance", "news-maintenance.py")
    return normalizer.normalize_space(value)


def plain(value: str) -> str:
    value = html.unescape(value)
    value = value.replace("\u20b1", "P")
    value = re.sub(r"\s+", " ", value)
    return value.strip()


def parse_folder_date(folder_name: str) -> str:
    match = ARTICLE_DATE_RE.search(folder_name)
    if not match:
        return ""
    month_name, day, year, _seq = match.groups()
    month = MONTHS.get(month_name.lower())
    if not month:
        return ""
    parsed = datetime(int(year), month, int(day))
    return f"{parsed.strftime('%B')} {parsed.day}, {parsed.year}"


def date_key(date_value: str, folder_name: str = "") -> tuple[int, int, int, str]:
    for pattern in ("%B %d, %Y", "%B %#d, %Y"):
        try:
            parsed = datetime.strptime(date_value, pattern)
            return (parsed.year, parsed.month, parsed.day, folder_name)
        except ValueError:
            continue
    folder_date = parse_folder_date(folder_name)
    if folder_date and folder_date != date_value:
        return date_key(folder_date, folder_name)
    return (0, 0, 0, folder_name)


def same_date(left: str, right: str) -> bool:
    if not left or not right:
        return False
    return date_key(left)[:3] == date_key(right)[:3]


def find_article_html(folder: Path) -> Path:
    helper = load_script("news_workflow_news_maintenance", "news-maintenance.py")
    return helper.find_article_html(folder)


def discover_images(folder: Path) -> list[Path]:
    return sorted(
        [path for path in folder.iterdir() if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES],
        key=lambda path: path.name.lower(),
    )


def first_match(source: str, pattern: str) -> str:
    match = re.search(pattern, source, flags=re.IGNORECASE | re.DOTALL)
    return normalize_space(match.group(1)) if match else ""


def extract_paragraphs(source: str) -> list[str]:
    helper = load_script("news_workflow_news_maintenance", "news-maintenance.py")
    return helper.extract_paragraphs(source)


def sentence_summary(paragraphs: list[str]) -> str:
    helper = load_script("news_workflow_news_maintenance", "news-maintenance.py")
    return helper.sentence_summary(paragraphs)


def split_kicker(title: str) -> tuple[str, str]:
    helper = load_script("news_workflow_news_maintenance", "news-maintenance.py")
    return helper.split_kicker(title)


def load_manifest(folder: Path) -> dict[str, object]:
    for name in ("news.json", "news-workflow.json"):
        path = folder / name
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8-sig"))
    return {}


def parse_kicker_overrides(values: list[str] | None) -> dict[str, str]:
    overrides = {}
    for value in values or []:
        if "=" not in value:
            raise ValueError(f"Invalid --kicker value {value!r}. Use NEWS/folder=KICKER.")
        folder_value, kicker = value.split("=", 1)
        folder_name = Path(folder_value.strip()).name
        kicker = kicker.strip()
        if not folder_name or not kicker:
            raise ValueError(f"Invalid --kicker value {value!r}. Use NEWS/folder=KICKER.")
        overrides[folder_name] = kicker
    return overrides


def infer_kicker(title: str, source: str, folder: Path, overrides: dict[str, str] | None = None) -> tuple[str, str]:
    if overrides and folder.name in overrides:
        return overrides[folder.name], "cli"

    manifest = load_manifest(folder)
    manifest_kicker = str(manifest.get("kicker", "")).strip()
    if manifest_kicker:
        return manifest_kicker, "manifest"

    explicit, _card_title = split_kicker(title)
    if "|" in title:
        return explicit, "title"

    haystack = normalize_space(source).upper()
    for kicker in KNOWN_KICKERS:
        if re.search(rf"\b{re.escape(kicker)}\b", haystack):
            return kicker, "article"
    return explicit or "LGCDD", "default"


def build_article(
    folder_value: str | Path,
    date_source: str = "folder",
    kicker_overrides: dict[str, str] | None = None,
) -> Article:
    folder = (ROOT / folder_value).resolve() if not isinstance(folder_value, Path) else folder_value.resolve()
    html_path = find_article_html(folder)
    source = read_text(html_path)
    images = [rel(path) for path in discover_images(folder)]

    h1_title = first_match(
        source,
        r"<h1\b[^>]*class=[\"'][^\"']*news-article__title[^\"']*[\"'][^>]*>(.*?)</h1>",
    )
    title = h1_title or first_match(source, r"<title\b[^>]*>(.*?)</title>")
    title = title or html_path.stem.replace("-", " ").title()
    title = plain(title)
    _default_kicker, card_title = split_kicker(title)
    kicker, kicker_source = infer_kicker(title, source, folder, overrides=kicker_overrides)
    page_date = first_match(
        source,
        r"<p\b[^>]*class=[\"'][^\"']*news-article__date[^\"']*[\"'][^>]*>(.*?)</p>",
    )
    folder_date = parse_folder_date(folder.name)
    effective_date = folder_date if date_source == "folder" and folder_date else page_date or folder_date

    paragraphs = extract_paragraphs(source)
    summary = plain(sentence_summary(paragraphs))
    hero_image = first_match(
        source,
        r"<img\b[^>]*class=[\"'][^\"']*news-article__hero[^\"']*[\"'][^>]*\bsrc=[\"']([^\"']+)[\"']",
    )
    slider_images = [path for path in images if "FORSLIDERPREVIEW" in path.upper()]
    main_slider_images = [path for path in images if "FORMAINSLIDERPREVIEW" in path.upper()]
    gallery_images = [
        path
        for path in images
        if "FORSLIDERPREVIEW" not in path.upper() and "FORMAINSLIDERPREVIEW" not in path.upper()
    ]
    hero_image = slider_images[0] if slider_images else hero_image or (images[0] if images else "")

    return Article(
        folder=folder,
        html_path=html_path,
        url=rel(html_path),
        folder_date=folder_date,
        page_date=page_date,
        effective_date=effective_date,
        title=title,
        card_title=plain(card_title),
        kicker=plain(kicker or "LGCDD"),
        kicker_source=kicker_source,
        summary=summary,
        hero_image=hero_image,
        slider_images=slider_images,
        main_slider_images=main_slider_images,
        gallery_images=gallery_images,
        all_images=images,
    )


def discover_articles(date_source: str = "folder", kicker_overrides: dict[str, str] | None = None) -> list[Article]:
    articles = []
    for folder in sorted(NEWS_ROOT.iterdir()):
        if not folder.is_dir():
            continue
        try:
            articles.append(build_article(folder, date_source=date_source, kicker_overrides=kicker_overrides))
        except (FileNotFoundError, RuntimeError):
            continue
    return sorted(articles, key=lambda item: date_key(item.effective_date, item.folder.name), reverse=True)


def img_tag(image: str, alt: str, indent: str, active: bool = False) -> str:
    class_attr = ' class="active"' if active else ""
    return f'{indent}<img{class_attr} src="{image}" alt="{html.escape(alt, quote=True)}" loading="lazy" decoding="async">'


def card_images(article: Article, include_all_folder_photos: bool) -> list[str]:
    images = []
    for image in article.slider_images or [article.hero_image]:
        if image and image not in images:
            images.append(image)
    if include_all_folder_photos:
        for image in article.gallery_images:
            if image not in images:
                images.append(image)
    return images


def card(article: Article, heading: str, indent: str, include_all_folder_photos: bool = False) -> str:
    images = card_images(article, include_all_folder_photos)
    image_tags = "\n".join(
        img_tag(image, article.card_title, f"{indent}            ", active=index == 0)
        for index, image in enumerate(images)
    )
    return "\n".join(
        [
            f'{indent}<a class="sugbo-balita-link" href="{article.url}">',
            f'{indent}  <article class="sugbo-balita-item">',
            f'{indent}    <div class="sugbo-balita-thumb">',
            f'{indent}      <div class="sugbo-balita-photo-slider" data-news-photo-slider>',
            image_tags,
            f'{indent}      </div>',
            f'{indent}    </div>',
            f'{indent}    <div>',
            f'{indent}      <p class="sugbo-balita-kicker">{html.escape(article.kicker)}</p>',
            f'{indent}      <{heading} class="sugbo-balita-headline">{html.escape(article.card_title)}</{heading}>',
            f'{indent}      <p class="sugbo-balita-date">{html.escape(article.effective_date)}</p>',
            f'{indent}      <p class="sugbo-balita-summary">{html.escape(article.summary)}</p>',
            f'{indent}    </div>',
            f'{indent}  </article>',
            f'{indent}</a>',
        ]
    )


def news_slide(article: Article) -> str:
    image = (article.slider_images or [article.hero_image])[0]
    return "\n".join(
        [
            f'                                  <a class="main-slide" href="{article.url}" aria-label="Read {html.escape(article.effective_date)} {html.escape(article.card_title)} news article">',
            img_tag(image, article.card_title, "                                    "),
            '                                    <div class="news-slide-caption">',
            f'                                      <p>{html.escape(article.kicker)}</p>',
            f'                                      <h2>{html.escape(article.card_title)}</h2>',
            '                                    </div>',
            '                                  </a>',
        ]
    )


def index_main_slide(article: Article) -> str:
    image = article.main_slider_images[0]
    return "\n".join(
        [
            f'                          <a class="main-slide" href="{article.url}" aria-label="Read {html.escape(article.effective_date)} {html.escape(article.card_title)} news article">',
            img_tag(image, article.card_title, "                            "),
            '                          </a>',
        ]
    )


def find_matching_close(source: str, start: int, open_token: str, close_token: str) -> int:
    depth = 0
    pos = start
    while True:
        next_open = source.find(open_token, pos)
        next_close = source.find(close_token, pos)
        if next_close == -1:
            raise RuntimeError(f"Could not find closing token {close_token!r}")
        if next_open != -1 and next_open < next_close:
            depth += 1
            pos = next_open + len(open_token)
            continue
        depth -= 1
        pos = next_close + len(close_token)
        if depth == 0:
            return next_close


def replace_div_content(source: str, div_marker: str, new_content: str) -> str:
    start = source.find(div_marker)
    if start == -1:
        raise RuntimeError(f"Could not find block marker: {div_marker}")
    open_end = source.find(">", start)
    close_start = find_matching_close(source, start, "<div", "</div>")
    return source[: open_end + 1] + "\n" + new_content + "\n                                </div>" + source[close_start + len("</div>") :]


def replace_between(source: str, start_marker: str, end_marker: str, new_content: str, after_start: bool = True) -> str:
    start = source.find(start_marker)
    if start == -1:
        raise RuntimeError(f"Could not find start marker: {start_marker}")
    content_start = source.find(">", start) + 1 if after_start else start + len(start_marker)
    end = source.find(end_marker, content_start)
    if end == -1:
        raise RuntimeError(f"Could not find end marker: {end_marker}")
    return source[:content_start] + "\n" + new_content + "\n" + source[end:]


def replace_featured_slider_content(source: str, new_content: str) -> str:
    marker = '<div class="main-slider" id="mainPageSlider">'
    start = source.find(marker)
    if start == -1:
        raise RuntimeError("Could not find news featured slider.")
    open_end = source.find(">", start)
    button_start = source.find('<button class="slider-nav prev-slide"', open_end)
    if button_start == -1:
        raise RuntimeError("Could not find news featured slider navigation.")
    close_start = source.rfind("</div>", open_end, button_start)
    if close_start == -1:
        raise RuntimeError("Could not find news featured slider closing div.")
    return source[: open_end + 1] + "\n" + new_content + "\n" + source[close_start:]


def update_article_page(article: Article) -> None:
    source = read_text(article.html_path)
    source = re.sub(
        r"<title\b[^>]*>.*?</title>",
        f"<title>{html.escape(article.title)}</title>",
        source,
        count=1,
        flags=re.IGNORECASE | re.DOTALL,
    )
    source = re.sub(
        r'(<img\b[^>]*class=["\'][^"\']*news-article__hero[^"\']*["\'][^>]*\bsrc=["\'])[^"\']+(["\'][^>]*\balt=["\'])[^"\']*(["\'])',
        rf"\1{article.hero_image}\2{html.escape(article.title, quote=True)}\3",
        source,
        count=1,
        flags=re.IGNORECASE | re.DOTALL,
    )
    source = re.sub(
        r'(<p\b[^>]*class=["\'][^"\']*news-article__date[^"\']*["\'][^>]*>).*?(</p>)',
        rf"\1{html.escape(article.effective_date)}\2",
        source,
        count=1,
        flags=re.IGNORECASE | re.DOTALL,
    )
    source = re.sub(
        r'(<h1\b[^>]*class=["\'][^"\']*news-article__title[^"\']*["\'][^>]*>).*?(</h1>)',
        rf"\1{html.escape(article.title)}\2",
        source,
        count=1,
        flags=re.IGNORECASE | re.DOTALL,
    )
    if article.gallery_images and "news-article__gallery" in source:
        gallery = "\n".join(
            f'                            <img src="{image}" alt="{html.escape(article.card_title, quote=True)} activity photo {index}">'
            for index, image in enumerate(article.gallery_images, start=1)
        )
        source = replace_div_content(source, '<div class="news-article__gallery">', gallery)
    write_text(article.html_path, source)


def update_index(articles: list[Article], supplied: list[Article]) -> None:
    source = read_text(INDEX_HTML)
    supplied_by_url = {article.url: article for article in supplied}
    pd_marker = '<a class="main-slide" href="theprovincialdirector.html"'
    pd_start = source.find(pd_marker)
    if pd_start == -1:
        raise RuntimeError("Could not find Provincial Director slide.")
    pd_end = source.find("</a>", pd_start) + len("</a>")
    main_slides = [
        index_main_slide(article)
        for article in supplied
        if article.main_slider_images and article.main_slider_images[0] not in source
    ]
    if main_slides:
        source = source[:pd_end] + "\n" + "\n".join(main_slides) + source[pd_end:]

    top_five = articles[:5]
    list_html = "\n".join(card(article, "h3", "    ", include_all_folder_photos=True) for article in top_five)
    source = replace_div_content(source, '<div class="sugbo-balita-list">', list_html)
    write_text(INDEX_HTML, source)


def update_news_page(articles: list[Article]) -> None:
    source = read_text(NEWS_HTML)
    slides = "\n\n".join(news_slide(article) for article in articles if article.slider_images or article.hero_image)
    source = replace_featured_slider_content(source, slides)
    list_html = "\n".join(
        card(article, "h2", "                              ", include_all_folder_photos=True)
        for article in articles
    )
    source = replace_div_content(source, '<div class="sugbo-balita-list">', list_html)
    write_text(NEWS_HTML, source)


def run_command(args: list[str], check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(args, cwd=ROOT, text=True, capture_output=True, check=check)


def clean_pycache() -> None:
    pycache = ROOT / "scripts" / "__pycache__"
    if not pycache.exists():
        return
    for path in pycache.glob("*.pyc"):
        relative = rel(path)
        tracked = run_command(["git", "ls-files", "--error-unmatch", relative], check=False)
        if tracked.returncode == 0:
            run_command(["git", "restore", "--", relative], check=False)
        else:
            path.unlink(missing_ok=True)


def run_post_maintenance() -> None:
    run_command([sys.executable, "scripts/site-maintenance.py", "text", "fix", "NEWS", "index.html", "news.html"])
    run_command([sys.executable, "scripts/site-maintenance.py", "search", "rebuild"])
    clean_pycache()


def validate_article(article: Article) -> list[str]:
    issues = []
    if not article.title:
        issues.append(f"{article.url}: missing title")
    if article.page_date and article.folder_date and not same_date(article.page_date, article.folder_date):
        issues.append(f"{article.url}: page date {article.page_date!r} differs from folder date {article.folder_date!r}")
    if not article.slider_images:
        issues.append(f"{article.url}: no FORSLIDERPREVIEW image detected")
    if article.hero_image and not (ROOT / article.hero_image).exists():
        issues.append(f"{article.url}: hero image does not exist: {article.hero_image}")
    for image in article.gallery_images + article.slider_images + article.main_slider_images:
        if not (ROOT / image).exists():
            issues.append(f"{article.url}: image does not exist: {image}")

    source = read_text(article.html_path)
    page_title = first_match(source, r"<title\b[^>]*>(.*?)</title>")
    visible_title = first_match(
        source,
        r"<h1\b[^>]*class=[\"'][^\"']*news-article__title[^\"']*[\"'][^>]*>(.*?)</h1>",
    )
    if page_title and visible_title and plain(page_title) != plain(visible_title):
        issues.append(f"{article.url}: <title> and visible article title differ")
    return issues


def validate_pages(articles: list[Article]) -> list[str]:
    issues = []
    index_source = read_text(INDEX_HTML)
    news_source = read_text(NEWS_HTML)
    index_cards = re.findall(r'<a class="sugbo-balita-link" href="NEWS/[^"]+">', index_source)
    if len(index_cards) != 5:
        issues.append(f"index.html: expected exactly 5 homepage news cards, found {len(index_cards)}")

    for article in articles[:5]:
        if article.url not in index_source:
            issues.append(f"index.html: expected top-five article missing: {article.url}")
        expected_images = card_images(article, include_all_folder_photos=True)
        for image in expected_images:
            if image not in index_source:
                issues.append(f"index.html: expected homepage card image missing for {article.url}: {image}")
            if image not in news_source:
                issues.append(f"news.html: expected news card image missing for {article.url}: {image}")
    for article in articles:
        if article.url not in news_source:
            issues.append(f"news.html: must preserve every discoverable article card; missing {article.url}")
    featured_block = ""
    slider_start = news_source.find('<div class="main-slider" id="mainPageSlider">')
    if slider_start != -1:
        slider_end = find_matching_close(news_source, slider_start, "<div", "</div>")
        featured_block = news_source[slider_start:slider_end]
    featured_urls = re.findall(r'<a class="main-slide" href="(NEWS/[^"]+)"', featured_block)
    duplicate_featured = sorted({url for url in featured_urls if featured_urls.count(url) > 1})
    for url in duplicate_featured:
        issues.append(f"news.html: duplicate featured slider article: {url}")
    return issues


def cmd_plan(args: argparse.Namespace) -> int:
    kicker_overrides = parse_kicker_overrides(args.kicker)
    supplied = [
        build_article(folder, date_source=args.date_source, kicker_overrides=kicker_overrides)
        for folder in args.folders
    ]
    articles = discover_articles(date_source=args.date_source, kicker_overrides=kicker_overrides)
    print("# NEWS Workflow Plan\n")
    for article in supplied:
        print(f"- `{article.url}`")
        print(f"  title: {article.title}")
        print(f"  page date: {article.page_date or 'missing'}")
        print(f"  folder date: {article.folder_date or 'missing'}")
        print(f"  effective date: {article.effective_date or 'missing'}")
        print(f"  kicker: {article.kicker} ({article.kicker_source})")
        print(f"  FORSLIDERPREVIEW: {len(article.slider_images)}")
        print(f"  FORMAINSLIDERPREVIEW: {len(article.main_slider_images)}")
        print(f"  index/news card photos: {len(card_images(article, include_all_folder_photos=True))}")
        if article.page_date and article.folder_date and not same_date(article.page_date, article.folder_date):
            print("  warning: page date differs from folder date")
    print("\nHomepage DILG Sugbo Balita top five after apply:")
    for index, article in enumerate(articles[:5], start=1):
        print(f"{index}. {article.effective_date} - {article.card_title}")
    print("\nHomepage main-slider additions:")
    additions = [article for article in supplied if article.main_slider_images]
    if additions:
        for article in additions:
            print(f"- {article.card_title}: {article.main_slider_images[0]}")
    else:
        print("- none; no supplied FORMAINSLIDERPREVIEW images detected")
    return 0


def cmd_apply(args: argparse.Namespace) -> int:
    kicker_overrides = parse_kicker_overrides(args.kicker)
    supplied = [
        build_article(folder, date_source=args.date_source, kicker_overrides=kicker_overrides)
        for folder in args.folders
    ]
    for article in supplied:
        update_article_page(article)
    articles = discover_articles(date_source=args.date_source, kicker_overrides=kicker_overrides)
    update_index(articles, supplied)
    update_news_page(articles)
    if not args.no_maintenance:
        run_post_maintenance()
    print(f"Applied NEWS workflow to {len(supplied)} article(s).")
    return 0


def cmd_doctor(args: argparse.Namespace) -> int:
    issues = []
    kicker_overrides = parse_kicker_overrides(args.kicker)
    articles = discover_articles(date_source=args.date_source, kicker_overrides=kicker_overrides)
    folders = [Path(folder).name for folder in args.folders] if args.folders else []
    selected = [article for article in articles if not folders or article.folder.name in folders]
    for article in selected:
        issues.extend(validate_article(article))
    issues.extend(validate_pages(articles))

    text = run_command([sys.executable, "scripts/site-maintenance.py", "doctor"], check=False)
    if text.returncode:
        issues.append("site-maintenance doctor failed")
    diff = run_command(["git", "diff", "--check"], check=False)
    if diff.returncode:
        issues.append("git diff --check failed")

    if issues:
        print("NEWS workflow doctor found issues:")
        for issue in issues:
            print(f"- {issue}")
        if text.stdout:
            print("\nsite-maintenance output:")
            print(text.stdout.rstrip())
        if diff.stdout:
            print("\ngit diff --check output:")
            print(diff.stdout.rstrip())
        return 1

    print("NEWS workflow doctor passed.")
    print(text.stdout.rstrip())
    if diff.stderr:
        print(diff.stderr.rstrip())
    return 0


def cmd_clean(_args: argparse.Namespace) -> int:
    clean_pycache()
    print("Cleaned predictable Python cache side effects.")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="End-to-end NEWS update workflow for the DILG Cebu Province static site.")
    parser.add_argument(
        "--date-source",
        choices=("folder", "article"),
        default="folder",
        help="date source used for ordering and article page date updates; default: folder",
    )
    subparsers = parser.add_subparsers(dest="command", required=True)

    plan = subparsers.add_parser("plan", help="print a dry-run NEWS update plan")
    plan.add_argument("folders", nargs="+", help="NEWS folders to plan")
    plan.add_argument("--kicker", action="append", help="override arbitrary kicker, for example NEWS/news-june-10-2026-001=PDMS")
    plan.set_defaults(func=cmd_plan)

    apply = subparsers.add_parser("apply", help="apply article, index.html, news.html, and search-index updates")
    apply.add_argument("folders", nargs="+", help="NEWS folders to apply")
    apply.add_argument("--kicker", action="append", help="override arbitrary kicker, for example NEWS/news-june-10-2026-001=PDMS")
    apply.add_argument("--no-maintenance", action="store_true", help="skip text normalization and search rebuild")
    apply.set_defaults(func=cmd_apply)

    doctor = subparsers.add_parser("doctor", help="validate NEWS workflow invariants")
    doctor.add_argument("folders", nargs="*", help="optional NEWS folders to validate specifically")
    doctor.add_argument("--kicker", action="append", help="override arbitrary kicker while validating")
    doctor.set_defaults(func=cmd_doctor)

    clean = subparsers.add_parser("clean", help="remove predictable maintenance side effects")
    clean.set_defaults(func=cmd_clean)

    return parser


def main() -> int:
    args = build_parser().parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
