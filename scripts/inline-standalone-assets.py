import base64
import mimetypes
import re
import sys
from pathlib import Path


if len(sys.argv) != 2:
    raise SystemExit("Usage: python scripts/inline-standalone-assets.py <html-file>")

root = Path.cwd().resolve()
html_path = (root / sys.argv[1]).resolve()
html = html_path.read_text(encoding="utf-8")


def local_asset(url: str):
    if re.match(r"^(?:[a-z]+:)?//|^(?:data:|#)", url, re.I):
        return None
    candidate = (root / re.split(r"[?#]", url.lstrip("/"), maxsplit=1)[0]).resolve()
    if root not in candidate.parents or not candidate.is_file():
        return None
    return candidate


def inline_css(match):
    tag, attrs = match.group(0), match.group(1)
    href_match = re.search(r'\bhref=["\']([^"\']+)["\']', attrs, re.I)
    asset = local_asset(href_match.group(1)) if href_match else None
    if not asset:
        return "" if href_match and href_match.group(1).startswith("/") else tag
    href = href_match.group(1)
    media_match = re.search(r'\bmedia=["\']([^"\']+)["\']', attrs, re.I)
    media = f' media="{media_match.group(1)}"' if media_match else ""
    css = asset.read_text(encoding="utf-8").replace("</style", "<\\/style")
    return f'<style data-inlined-from="{href}"{media}>\n{css}\n</style>'


def inline_js(match):
    tag, attrs, src = match.group(0), match.group(1), match.group(2)
    asset = local_asset(src)
    if not asset:
        return "" if src.startswith("/") or re.match(r"^(?:[a-z]+:)?//", src, re.I) else tag
    preserved = re.sub(r'\s*src=["\'][^"\']+["\']', "", attrs, flags=re.I)
    preserved = re.sub(r'\s*(?:defer|async)(?:=["\'][^"\']*["\'])?', "", preserved, flags=re.I)
    js = asset.read_text(encoding="utf-8").replace("</script", "<\\/script")
    return f'<script{preserved} data-inlined-from="{src}">\n{js}\n</script>'


html = re.sub(
    r'<link\b([^>]*\brel=["\']stylesheet["\'][^>]*)>',
    inline_css,
    html,
    flags=re.I,
)
html = re.sub(
    r'<script\b([^>]*\bsrc=["\']([^"\']+)["\'][^>]*)>\s*</script>',
    inline_js,
    html,
    flags=re.I,
)

# Standalone charter builds must never navigate away from this document.
def localize_anchor(match):
    attrs, quote, href = match.group(1), match.group(2), match.group(3)
    if href.startswith("#"):
        return match.group(0)
    fragment = href.split("#", 1)[1] if "#" in href else "cover"
    return f'<a{attrs}href={quote}#{fragment}{quote}'


html = re.sub(
    r'<a\b([^>]*?)href=(["\'])([^"\']*)\2',
    localize_anchor,
    html,
    flags=re.I,
)
html = re.sub(
    r'(\bhref\s*:\s*["\'])citizenscharter\.html(#[-\w]+)(["\'])',
    r'\1\2\3',
    html,
    flags=re.I,
)

# Remove online-only widgets and embedded pages from offline output.
html = re.sub(
    r'<script\b[^>]*data-inlined-from=["\']assets/js/(?:header-clock-weather|goatcounter-stats|site-search)\.js["\'][^>]*>.*?</script>',
    "",
    html,
    flags=re.I | re.S,
)
html = re.sub(
    r'<iframe\b([^>]*?)\bsrc=(["\'])(?:https?:)?//[^"\']*\2([^>]*)>.*?</iframe>',
    r'<div\1\3 aria-label="Online embedded content removed from standalone page"></div>',
    html,
    flags=re.I | re.S,
)

# Standalone header: retain only agency logo and a full-height Charter launcher.
html = re.sub(
    r'\s*<!-- Header Date/Time/Weather Widget -->\s*<div class="overlay-widget header-datetime-widget".*?</div>',
    "",
    html,
    count=1,
    flags=re.I | re.S,
)
html = re.sub(
    r'\s*<time class="overlay-text header-date"[^>]*></time>\s*<time class="overlay-text header-time"[^>]*></time>\s*</div>',
    "",
    html,
    count=1,
    flags=re.I | re.S,
)
html = re.sub(
    r'\s*<div class="nav-menu">.*?</div>\s*(?=<div class="header-action-menu">)',
    "\n",
    html,
    count=1,
    flags=re.I | re.S,
)
html = re.sub(
    r'<div class="header-action-menu">.*?</div>\s*</div>\s*(?=<div class="mobile-menu-toggle">)',
    '''<div class="header-action-menu standalone-charter-action">
            <a class="citizens-charter-button" href="#cover" aria-label="Open Citizen's Charter services">
              <img src="images/citizenscharterbutton.png" alt="Citizen's Charter">
            </a>
          </div>
          ''',
    html,
    count=1,
    flags=re.I | re.S,
)
html = re.sub(
    r'\s*<div class="mobile-menu-toggle">.*?</div>',
    "",
    html,
    count=1,
    flags=re.I | re.S,
)
if 'class="standalone-header-title"' not in html:
    html = html.replace(
        '<div class="header-action-menu standalone-charter-action">',
        '''<h1 class="standalone-header-title">
            <span>Welcome to DILG Cebu Province's</span>
            <span>Citizen's Charter System</span>
          </h1>
          <div class="header-action-menu standalone-charter-action">''',
        1,
    )

standalone_header_css = '''
<style id="standalone-charter-header">
  .main-navigation {
    height: 104px;
    min-height: 104px;
    max-height: 104px;
    justify-content: space-between;
    padding: 0 14px;
    overflow: hidden;
    box-sizing: border-box;
  }
  .main-navigation .nav-logo {
    width: 88px;
    height: 88px;
    flex: 0 0 88px;
    margin: 0 8px;
  }
  .standalone-charter-action {
    position: static;
    transform: none;
    width: 104px;
    height: 104px;
    padding: 0;
  }
  .standalone-header-title {
    min-width: 0;
    flex: 1 1 auto;
    margin: 0 clamp(12px, 2vw, 28px);
    color: #050505;
    font-family: Arial, Helvetica, sans-serif;
    font-size: clamp(1.2rem, 1.9vw, 2rem);
    font-weight: 800;
    line-height: 1.18;
    letter-spacing: 0.01em;
    text-align: center;
    text-transform: uppercase;
  }
  .standalone-header-title span {
    display: block;
    white-space: nowrap;
  }
  .standalone-charter-action .citizens-charter-button {
    width: 88px;
    height: 88px;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 0;
    box-shadow: none;
  }
  .standalone-charter-action .citizens-charter-button img {
    width: 88px;
    height: 88px;
    object-fit: contain;
  }
  @media (max-width: 768px) {
    .main-navigation {
      height: 76px;
      min-height: 76px;
      max-height: 76px;
      padding: 0 14px !important;
    }
    .main-navigation .nav-logo {
      width: 68px;
      height: 68px;
      flex-basis: 68px;
      margin: 0;
    }
    .standalone-charter-action,
    .standalone-charter-action .citizens-charter-button,
    .standalone-charter-action .citizens-charter-button img {
      width: 68px;
      height: 68px;
    }
    .standalone-header-title {
      margin: 0 8px;
      font-size: clamp(0.62rem, 2.8vw, 1rem);
      line-height: 1.15;
    }
  }
  @media (max-width: 480px) {
    .main-navigation {
      padding: 0 6px !important;
    }
    .main-navigation .nav-logo,
    .standalone-charter-action,
    .standalone-charter-action .citizens-charter-button,
    .standalone-charter-action .citizens-charter-button img {
      width: 54px;
      height: 54px;
      flex-basis: 54px;
    }
    .standalone-header-title {
      margin: 0 4px;
      font-size: clamp(0.5rem, 2.65vw, 0.72rem);
    }
  }
  @media (min-width: 901px) {
    .shared-charter-dialog__icon {
      width: clamp(76px, calc(6vw - 39px), 144px) !important;
      height: clamp(76px, calc(6vw - 39px), 144px) !important;
      flex-basis: clamp(76px, calc(6vw - 39px), 144px) !important;
    }
    .shared-charter-dialog__card {
      min-height: clamp(118px, calc(8vw - 36px), 196px) !important;
      gap: clamp(14px, 1.1vw, 24px) !important;
      padding: clamp(14px, 1.1vw, 22px) !important;
    }
  }
  @media (max-width: 900px) {
    .shared-charter-dialog__icon {
      width: clamp(58px, 16vw, 76px) !important;
      height: clamp(58px, 16vw, 76px) !important;
      flex-basis: clamp(58px, 16vw, 76px) !important;
    }
  }
  @media (orientation: portrait) {
    .shared-charter-dialog__list {
      grid-template-columns: minmax(0, 1fr) !important;
    }
    .shared-charter-dialog__card {
      width: 100%;
      min-height: 104px !important;
      box-sizing: border-box;
    }
    .shared-charter-dialog__icon {
      width: clamp(64px, 14vw, 96px) !important;
      height: clamp(64px, 14vw, 96px) !important;
      flex-basis: clamp(64px, 14vw, 96px) !important;
    }
  }
</style>
'''
html = re.sub(
    r'<style id="standalone-charter-header">.*?</style>',
    "",
    html,
    count=1,
    flags=re.I | re.S,
)
html = html.replace("</head>", standalone_header_css + "</head>", 1)

# Remove scripts whose only purpose is loading additional local or online resources.
html = re.sub(
    r'<script\b[^>]*data-inlined-from=["\']assets/js/(?:image-manager|main-background-switcher|search-index|pdfjs-overlay-dialog)\.js["\'][^>]*>.*?</script>',
    "",
    html,
    flags=re.I | re.S,
)
html = re.sub(
    r'<script>\s*if \(["\']serviceWorker["\'] in navigator\).*?</script>',
    "",
    html,
    flags=re.I | re.S,
)
html = re.sub(
    r'<script\b[^>]*>\s*/\* <\!\[CDATA\[ \*/\s*/\*! This file is auto-generated \*/.*?</script>',
    "",
    html,
    count=1,
    flags=re.I | re.S,
)
html = re.sub(
    r'<link\b(?![^>]*\bhref=["\']data:)[^>]*>',
    "",
    html,
    flags=re.I,
)

asset_extensions = r'(?:png|jpe?g|gif|webp|svg|ico|bmp|avif|mp4|webm|ogg|mp3|wav|woff2?|ttf|otf|pdf)'
data_cache = {}


def asset_data_url(value: str):
    if value.startswith(("data:", "#")) or re.match(r"^(?:[a-z]+:)?//", value, re.I):
        return None
    clean = re.split(r"[?#]", value.lstrip("./"), maxsplit=1)[0]
    if not re.search(rf'\.{asset_extensions}$', clean, re.I):
        return None
    asset = (root / clean).resolve()
    if root not in asset.parents or not asset.is_file():
        if re.search(r'\.(?:woff2?|otf|ttf)$', clean, re.I):
            return "data:application/octet-stream;base64,"
        raise SystemExit(f"Missing standalone asset: {value}")
    if asset not in data_cache:
        mime = mimetypes.guess_type(asset.name)[0] or "application/octet-stream"
        encoded = base64.b64encode(asset.read_bytes()).decode("ascii")
        data_cache[asset] = f"data:{mime};base64,{encoded}"
    return data_cache[asset]


def embed_quoted_asset(match):
    quote, value = match.group(1), match.group(2)
    embedded = asset_data_url(value)
    return f"{quote}{embedded or value}{quote}"


html = re.sub(
    rf'(["\'])((?!data:|https?:|//|#)[^"\'\s<>]+\.{asset_extensions}(?:[?#][^"\']*)?)\1',
    embed_quoted_asset,
    html,
    flags=re.I,
)


def embed_css_asset(match):
    quote = match.group(1) or ""
    value = match.group(2).strip()
    embedded = asset_data_url(value)
    return f"url({quote}{embedded or value}{quote})"


html = re.sub(
    r'url\(\s*(["\']?)(?!data:)([^)"\']+)\1\s*\)',
    embed_css_asset,
    html,
    flags=re.I,
)

ids = set(re.findall(r'\bid=["\']([^"\']+)["\']', html, re.I))
fragments = set(re.findall(r'<a\b[^>]*\bhref=["\']#([^"\']+)["\']', html, re.I))
missing = sorted(fragments - ids)
if missing:
    raise SystemExit("Missing standalone anchor targets: " + ", ".join(missing))

html_path.write_text(html, encoding="utf-8")
